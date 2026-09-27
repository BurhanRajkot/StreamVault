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
 */

import http from 'http'
import { Readable } from 'stream'
import type { AddressInfo } from 'net'
import type { ReadableStream as NodeReadableStream } from 'stream/web'
import { logger } from './logger'

/** Reads starting this close to either end of the file are header/index reads worth keeping. */
const EDGE_BYTES = 64 * 1024 * 1024
/** How much of each such read to keep — Cues and MP4 `moov` boxes are well under this. */
const RECORD_BYTES = 4 * 1024 * 1024
const CACHE_MAX_BYTES = 128 * 1024 * 1024

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
    if (!drained) await new Promise((r) => res.once('drain', r).once('close', r))
    if (res.destroyed) return
    const upstream = await fetchRange(source, cachedEnd, end, controller.signal)
    if (upstream.status !== 206 || !upstream.body) {
      res.destroy()
      return
    }
    toNodeStream(upstream.body).on('error', () => res.destroy()).pipe(res)
    return
  }

  const upstream = await fetchRange(source, start, requestedEnd, controller.signal)
  if (!upstream.body || !(upstream.status === 206 || (upstream.status === 200 && start === 0))) {
    await upstream.body?.cancel().catch(() => {})
    res.writeHead(upstream.status === 200 ? 502 : upstream.status).end()
    return
  }

  const contentRange = upstream.headers.get('content-range')
  const contentLength = upstream.headers.get('content-length')
  const total = upstream.status === 206 ? contentRange?.match(/\/(\d+)$/)?.[1] : contentLength
  if (total) cache.size = Number(total)

  const headers: http.OutgoingHttpHeaders = {
    'Accept-Ranges': 'bytes',
    'Content-Type': 'application/octet-stream',
  }
  if (contentRange) headers['Content-Range'] = contentRange
  if (contentLength) headers['Content-Length'] = contentLength
  res.writeHead(upstream.status, headers)

  const body = toNodeStream(upstream.body)
  const size = cache.size
  if (size !== null && (start < EDGE_BYTES || start >= size - EDGE_BYTES)) {
    let parts: Buffer[] | null = []
    let recorded = 0
    // Also called when ffmpeg hangs up early: whatever arrived is still valid file data.
    const save = () => {
      if (parts && recorded > 0) addChunk(source.key, { start, data: Buffer.concat(parts) })
      parts = null
    }
    body.on('data', (chunk: Buffer) => {
      if (!parts) return
      parts.push(chunk)
      recorded += chunk.length
      if (recorded >= RECORD_BYTES) save()
    })
    body.once('close', save)
  }
  body.on('error', () => res.destroy()).pipe(res)
}

/** The runtime value is a web ReadableStream; the DOM and node:stream/web typings just don't line up. */
function toNodeStream(body: ReadableStream<Uint8Array>): Readable {
  return Readable.fromWeb(body as unknown as NodeReadableStream<Uint8Array>)
}

function fetchRange(source: Source, start: number, end: number | null, signal: AbortSignal): Promise<Response> {
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
