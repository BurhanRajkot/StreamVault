/**
 * Loopback HTTP range proxy between the HLS jobs' ffmpeg and the TorBox CDN.
 *
 * Every seek restarts the job's ffmpeg (see hlsVod.ts), and opening a remote
 * MKV/MP4 costs ffmpeg five or six range requests before the first media
 * byte: the header, the SeekHead targets near EOF, stream analysis, the Cues
 * index, and only then the seek target — each a fresh TLS connection at
 * 0.4-1s TTFB. On a 23GB remux that made a seek take 10-16s, of which ~3s
 * was media download (measured locally, Sept 2026).
 *
 * The proxy keeps the first bytes of every read near the start or end of the
 * file — exactly the header/index reads each ffmpeg open repeats — and serves
 * them from memory on the next open, so a restart only goes to the CDN for
 * the seek target itself. Upstream fetches also reuse keep-alive connections
 * rather than paying a TLS handshake per read.
 *
 * Media reads are fetched as parallel range chunks rather than one long
 * response. A single TorBox CDN connection stalls for seconds at a time —
 * measured 43, 23, 46, 42, 52, 13, 0, 2, 4 Mbit/s in consecutive 5s windows
 * while other connections to the same file ran at 60+ — and with one
 * connection every such stall reached ffmpeg, so a 17 Mbit/s file was only
 * remuxed at ~1x realtime and the player kept running dry. Now several
 * chunks are in flight ahead of the reader, and a chunk that falls behind
 * its deadline is re-requested on a fresh connection.
 */

import http from 'http'
import type { AddressInfo } from 'net'
import { logger } from './logger'

/** Reads starting this close to either end of the file are header/index reads worth keeping. */
const EDGE_BYTES = 64 * 1024 * 1024
/** How much of each such read to keep — Cues and MP4 `moov` boxes are well under this. */
const RECORD_BYTES = 4 * 1024 * 1024
const CACHE_MAX_BYTES = 128 * 1024 * 1024

/** First chunk of a read is small so the first bytes arrive fast (ffmpeg's header reads often stop after a few KB); later ones double up to the max. */
const FIRST_CHUNK_BYTES = 512 * 1024
const MAX_CHUNK_BYTES = 4 * 1024 * 1024
/** Chunks fetched concurrently per read. */
const PARALLEL_CHUNKS = 4
/** Fetched-but-unwritten chunks allowed per read — bounds memory while the reader is paused (e.g. a throttled ffmpeg). */
const MAX_BUFFERED_CHUNKS = 6
/**
 * A chunk attempt gets this long for its first byte, plus time at
 * MIN_CHUNK_BPS for its size, before it's abandoned and re-requested. Only a
 * stalled connection misses it: 4MB at 60 Mbit/s takes ~0.6s.
 */
const CHUNK_FIRST_BYTE_MS = 5000
const MIN_CHUNK_BPS = (4 * 1024 * 1024) / 8 // 4 Mbit/s
const MAX_CHUNK_ATTEMPTS = 4

interface Source {
  /** Stable identity of the file (torrent + file id); the signed URL changes on every request. */
  key: string
  /** Current upstream URL — re-read on every request so a refreshed link is picked up. */
  getUrl: () => string
}

interface Chunk {
  start: number
  data: Buffer
}

interface FileCache {
  size: number | null
  chunks: Chunk[]
  bytes: number
}

const sources = new Map<string, Source>()
/** Insertion order doubles as LRU order: a touched entry is re-inserted at the end. */
const caches = new Map<string, FileCache>()
let cachedBytes = 0
let portPromise: Promise<number> | null = null

export function registerSource(id: string, source: Source) {
  sources.set(id, source)
}

export function unregisterSource(id: string) {
  sources.delete(id)
}

/** The loopback URL ffmpeg should read source `id` from; starts the proxy on first use. */
export async function localUrl(id: string): Promise<string> {
  const port = await startServer()
  return `http://127.0.0.1:${port}/${encodeURIComponent(id)}`
}

function startServer(): Promise<number> {
  if (!portPromise) {
    portPromise = new Promise<number>((resolve, reject) => {
      const server = http.createServer((req, res) => {
        handle(req, res).catch((err: unknown) => {
          // ffmpeg hung up (a seek, or the job was killed) — expected.
          if (res.destroyed || (err instanceof Error && err.name === 'AbortError')) return
          logger.warn('TorBox range proxy request failed', {
            error: err instanceof Error ? err.message : String(err),
          })
          if (!res.headersSent) res.writeHead(502).end()
          else res.destroy()
        })
      })
      server.once('error', reject)
      server.listen(0, '127.0.0.1', () => {
        server.unref()
        resolve((server.address() as AddressInfo).port)
      })
    }).catch((err: unknown) => {
      portPromise = null
      throw err
    })
  }
  return portPromise
}

async function handle(req: http.IncomingMessage, res: http.ServerResponse) {
  const source = sources.get(decodeURIComponent((req.url || '/').slice(1)))
  if (!source || req.method !== 'GET') {
    res.writeHead(404).end()
    return
  }
  const range = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range || 'bytes=0-')
  if (!range) {
    res.writeHead(416).end()
    return
  }
  const start = Number(range[1])
  const requestedEnd = range[2] ? Number(range[2]) : null

  const controller = new AbortController()
  res.on('close', () => controller.abort())
  const cache = touchCache(source.key)

  const hit = cache.size !== null ? findChunk(cache, start) : null
  if (hit && cache.size !== null) {
    const end = Math.min(requestedEnd ?? cache.size - 1, cache.size - 1)
    res.writeHead(206, {
      'Accept-Ranges': 'bytes',
      'Content-Range': `bytes ${start}-${end}/${cache.size}`,
      'Content-Length': String(end - start + 1),
      'Content-Type': 'application/octet-stream',
    })
    const cachedEnd = Math.min(hit.start + hit.data.length, end + 1)
    const drained = res.write(hit.data.subarray(start - hit.start, cachedEnd - hit.start))
    if (cachedEnd > end) {
      res.end()
      return
    }
    // ffmpeg usually seeks away within the cached bytes; only continue
    // upstream if it's still reading once they're flushed.
    if (!drained) await waitForDrain(res)
    if (res.destroyed) return
    await pumpChunks(source, cachedEnd, end, MAX_CHUNK_BYTES, res, controller.signal)
    return
  }

  // The first chunk comes back with the file size, which the response
  // headers need; it's fetched on its own before anything is written.
  const firstEnd = requestedEnd !== null ? Math.min(requestedEnd, start + FIRST_CHUNK_BYTES - 1) : start + FIRST_CHUNK_BYTES - 1
  let first: Awaited<ReturnType<typeof fetchChunk>>
  try {
    first = await fetchChunk(source, start, firstEnd, controller.signal)
  } catch (err: unknown) {
    if (!(err instanceof UpstreamStatusError)) throw err
    res.writeHead(err.status === 200 ? 502 : err.status).end()
    return
  }
  if (first.total !== null) cache.size = first.total
  const size = cache.size
  if (size === null) {
    // No Content-Range to learn the size from — the upstream ignored the range. Don't guess.
    res.writeHead(502).end()
    return
  }
  const end = Math.min(requestedEnd ?? size - 1, size - 1)
  res.writeHead(206, {
    'Accept-Ranges': 'bytes',
    'Content-Range': `bytes ${start}-${end}/${size}`,
    'Content-Length': String(end - start + 1),
    'Content-Type': 'application/octet-stream',
  })

  let record: ((data: Buffer) => void) | undefined
  if (start < EDGE_BYTES || start >= size - EDGE_BYTES) {
    let parts: Buffer[] | null = []
    let recorded = 0
    // Also runs when ffmpeg hangs up early: whatever was sent is still valid file data.
    const save = () => {
      if (parts && recorded > 0) addChunk(source.key, { start, data: Buffer.concat(parts) })
      parts = null
    }
    record = (data) => {
      if (!parts) return
      parts.push(data)
      recorded += data.length
      if (recorded >= RECORD_BYTES) save()
    }
    res.once('close', save)
  }

  const firstData = first.data.subarray(0, end - start + 1)
  record?.(firstData)
  const drained = res.write(firstData)
  const next = start + firstData.length
  if (next > end) {
    res.end()
    return
  }
  if (!drained) await waitForDrain(res)
  if (res.destroyed) return
  await pumpChunks(source, next, end, FIRST_CHUNK_BYTES * 2, res, controller.signal, record)
}

function waitForDrain(res: http.ServerResponse): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      res.off('drain', done).off('close', done)
      resolve()
    }
    res.once('drain', done).once('close', done)
  })
}

/**
 * Write bytes [from, end] to `res` in order, fetching them as parallel range
 * chunks that grow from `firstChunkBytes` to MAX_CHUNK_BYTES. Fetching stops
 * MAX_BUFFERED_CHUNKS ahead of what `res` has accepted, so a reader that
 * stops reading (a paused ffmpeg) also stops the downloads instead of
 * holding idle CDN connections open.
 */
async function pumpChunks(
  source: Source,
  from: number,
  end: number,
  firstChunkBytes: number,
  res: http.ServerResponse,
  signal: AbortSignal,
  onData?: (data: Buffer) => void
) {
  interface Pending {
    data: Promise<Buffer>
    done: boolean
  }
  const queue: Pending[] = []
  let nextStart = from
  let chunkBytes = firstChunkBytes

  const fill = () => {
    while (
      nextStart <= end &&
      queue.length < MAX_BUFFERED_CHUNKS &&
      queue.filter((c) => !c.done).length < PARALLEL_CHUNKS
    ) {
      const chunkEnd = Math.min(nextStart + chunkBytes - 1, end)
      const pending: Pending = { data: fetchChunk(source, nextStart, chunkEnd, signal).then((c) => c.data), done: false }
      // Marks completion for the concurrency count; also keeps a failure from
      // going unhandled before the loop below gets to await it in order.
      pending.data.then(
        () => (pending.done = true),
        () => (pending.done = true)
      )
      queue.push(pending)
      nextStart = chunkEnd + 1
      chunkBytes = Math.min(chunkBytes * 2, MAX_CHUNK_BYTES)
    }
  }

  fill()
  while (queue.length > 0) {
    // Wake when the head is ready, or when any other chunk lands so the next
    // one can start downloading without waiting on the head.
    const head = queue[0]
    const others = queue.slice(1).filter((c) => !c.done)
    await Promise.race([head.data, ...others.map((c) => c.data)]).catch(() => {})
    if (res.destroyed || signal.aborted) return
    if (!head.done) {
      fill()
      continue
    }
    queue.shift()
    const data = await head.data // rethrows a chunk that gave up
    onData?.(data)
    if (!res.write(data)) await waitForDrain(res)
    if (res.destroyed) return
    fill()
  }
  res.end()
}

/** The CDN refused a range outright (e.g. 416 past EOF, 403 expired link) — retrying won't help. */
export class UpstreamStatusError extends Error {
  constructor(readonly status: number) {
    super(`upstream answered ${status} to a range request`)
  }
}

/**
 * Fetch bytes [start, end] as one buffer, re-requesting on a fresh
 * connection when an attempt stalls (see CHUNK_FIRST_BYTE_MS) or fails.
 * The last attempt gets no deadline, so a genuinely slow link still works.
 *
 * @returns the bytes and, when the upstream reported it, the file's total size.
 */
export async function fetchChunk(
  source: Pick<Source, 'getUrl'>,
  start: number,
  end: number,
  signal: AbortSignal
): Promise<{ data: Buffer; total: number | null }> {
  const expected = end - start + 1
  let lastError: unknown = null
  for (let attempt = 1; attempt <= MAX_CHUNK_ATTEMPTS; attempt++) {
    if (signal.aborted) throw signal.reason
    const attemptController = new AbortController()
    const onAbort = () => attemptController.abort(signal.reason)
    signal.addEventListener('abort', onAbort, { once: true })
    const deadlineMs = CHUNK_FIRST_BYTE_MS + (expected / MIN_CHUNK_BPS) * 1000
    const timer =
      attempt < MAX_CHUNK_ATTEMPTS ? setTimeout(() => attemptController.abort(new Error('chunk stalled')), deadlineMs) : null
    try {
      const upstream = await fetchRange(source, start, end, attemptController.signal)
      if (upstream.status !== 206 || !upstream.body) {
        await upstream.body?.cancel().catch(() => {})
        throw new UpstreamStatusError(upstream.status)
      }
      const total = Number(upstream.headers.get('content-range')?.match(/\/(\d+)$/)?.[1]) || null
      const data = Buffer.from(await upstream.arrayBuffer())
      if (data.length !== expected && (total === null || end < total - 1 || data.length === 0)) {
        throw new Error(`short chunk: ${data.length} of ${expected} bytes`)
      }
      return { data, total }
    } catch (err: unknown) {
      if (signal.aborted) throw err
      if (err instanceof UpstreamStatusError && err.status >= 400 && err.status < 500) throw err
      lastError = err
    } finally {
      if (timer) clearTimeout(timer)
      signal.removeEventListener('abort', onAbort)
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}

function fetchRange(source: Pick<Source, 'getUrl'>, start: number, end: number | null, signal: AbortSignal): Promise<Response> {
  return fetch(source.getUrl(), {
    headers: { Range: `bytes=${start}-${end ?? ''}` },
    signal,
  })
}

// ---------------------------------------------------------------------------
// Edge cache
// ---------------------------------------------------------------------------

function touchCache(key: string): FileCache {
  let cache = caches.get(key)
  if (cache) caches.delete(key)
  else cache = { size: null, chunks: [], bytes: 0 }
  caches.set(key, cache)
  return cache
}

/** The cached chunk covering `pos` that extends furthest past it, if any. */
export function findChunk(cache: Pick<FileCache, 'chunks'>, pos: number): Chunk | null {
  let best: Chunk | null = null
  for (const chunk of cache.chunks) {
    if (chunk.start > pos || chunk.start + chunk.data.length <= pos) continue
    if (!best || chunk.start + chunk.data.length > best.start + best.data.length) best = chunk
  }
  return best
}

function addChunk(key: string, chunk: Chunk) {
  const cache = caches.get(key)
  if (!cache) return
  const chunkEnd = chunk.start + chunk.data.length
  if (cache.chunks.some((c) => c.start <= chunk.start && c.start + c.data.length >= chunkEnd)) return

  cache.chunks = cache.chunks.filter((c) => {
    const contained = c.start >= chunk.start && c.start + c.data.length <= chunkEnd
    if (contained) {
      cache.bytes -= c.data.length
      cachedBytes -= c.data.length
    }
    return !contained
  })
  cache.chunks.push(chunk)
  cache.bytes += chunk.data.length
  cachedBytes += chunk.data.length

  for (const [oldKey, old] of caches) {
    if (cachedBytes <= CACHE_MAX_BYTES || oldKey === key) break
    caches.delete(oldKey)
    cachedBytes -= old.bytes
  }
}
