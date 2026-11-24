/**
 * Real-Debrid files, played through the app instead of straight from
 * Real-Debrid — the reason the app plays Premium better than the website.
 *
 * Two things a web page can't do (Real-Debrid's download servers send no
 * CORS headers, so a page can't read a file's bytes, only hand its address
 * to a <video>):
 *
 *   1. Relay (`/_rd/<token>/file`): the file, served to the window with
 *      range requests from memory, loaded minutes ahead by up to four
 *      connections at once. A <video> on Real-Debrid's own link keeps ~10 s
 *      loaded and stalls whenever a Real-Debrid server goes quiet (a slow
 *      answer on a new connection, a connection that sits for 15-25 s);
 *      here a connection that goes quiet is dropped and its stretch asked
 *      for again, while the film plays from what's already loaded.
 *
 *   2. Convert (`/_rd/<token>/convert?t=<seconds>`): the file with its
 *      Dolby/DTS audio turned into AAC by ffmpeg and the video copied as it
 *      is — no browser decodes Dolby audio, and Real-Debrid's own
 *      conversion re-encodes the whole film, live, in Amsterdam (slow, and
 *      it stutters). Audio costs next to nothing to convert; a jump far
 *      away starts ffmpeg again from there (`t`), reading from the relay.
 *
 * Only Real-Debrid download links are relayed (allowUrl), each behind a
 * random token, and only while the player holds it open.
 *
 * Used by main.cjs; plain Node (fetch, http, child_process) so it can be
 * tested without Electron.
 */

'use strict'

const http = require('node:http')
const crypto = require('node:crypto')
const { spawn, spawnSync } = require('node:child_process')

const MB = 1024 * 1024
/** The unit the file is loaded, kept and handed to readers in — small, so the player sees bytes arrive steadily. */
const CHUNK = 1 * MB
/** One connection loads at most this many chunks in a row before handing over. */
const RUN_CHUNKS = 16
/**
 * Until the film has this much loaded ahead, a single connection: at the
 * start every extra one shares the line with the first frame, and the
 * browser holds autoplay back while the bytes it gets arrive slower than
 * the film plays.
 */
const SOLO_UNTIL = 16 * MB
/** Connections loading at once. */
const WORKERS = 4
/** Memory the loaded file may take, all files together. */
const BUDGET = 512 * MB
/** Kept behind the playhead, for a jump back. */
const BEHIND = 48 * MB
/** Loaded ahead of the playhead: this many seconds of the film, within these bounds. */
const AHEAD_S = 300
const AHEAD_MIN = 64 * MB
const AHEAD_MAX = BUDGET - BEHIND - 32 * MB
/** A connection with no first byte by now, or no byte for this long once going, is dropped and asked again. */
const FIRST_BYTE_MS = 8000
const QUIET_MS = 4000
/**
 * A reader waiting this long on a chunk whose connection hasn't sent a byte
 * yet: that connection is replaced. Real-Debrid's servers now and then sit on
 * a new connection for 10-25 s while the next one answers at once.
 */
const REPLACE_MS = 2500
/** A link failing this many times in a row gives way to the next one (the link as Real-Debrid gave it). */
const MAX_URL_FAILURES = 3
/**
 * Refusals in a row (403, 404, ... — the link is dead), across links, before
 * readers are told the file can't be loaded. A connection that fails
 * (offline, a dropped connection) is only ever asked again, after a wait:
 * the player decides when to give up on a file that isn't arriving.
 */
const MAX_REFUSALS = 6
/**
 * Nobody has read from the relay for this long (the player moved on to
 * Real-Debrid's own link, or closed): it stops loading ahead. A paused film
 * keeps its request open, so pausing doesn't count.
 */
const IDLE_STOP_MS = 30_000
/** The wait before asking again after failures in a row: 0.25 s, doubling, up to 4 s. */
const retryDelay = (failures) => Math.min(4000, 250 * 2 ** Math.min(Math.max(failures - 1, 0), 4))

/** Whether `url` may be relayed: a Real-Debrid download link. */
function isRealDebridDownload(url) {
  try {
    const { protocol, hostname, pathname } = new URL(url)
    return protocol === 'https:' && hostname.endsWith('.download.real-debrid.com') && pathname.startsWith('/d/')
  } catch {
    return false
  }
}

/** The first ffmpeg of `candidates` that runs, or null. */
function findFfmpeg(candidates) {
  for (const candidate of candidates) {
    if (!candidate) continue
    try {
      const probe = spawnSync(candidate, ['-hide_banner', '-version'], { timeout: 4000, stdio: 'ignore' })
      if (probe.status === 0) return candidate
    } catch {
      // not there, or not runnable
    }
  }
  return null
}

/** The converted stream is read by the page with fetch; on Android the page and the server are different origins. */
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'X-Start-Time' }

/** One file being relayed. */
class RelayFile {
  constructor({ urls, size, duration, fetchImpl, log, pool, debug }) {
    this.debug = debug || (() => {})
    this.urls = urls
    this.urlIndex = 0
    this.urlFailures = 0
    this.failures = 0
    this.refusals = 0
    /** No new connection before this (Date.now()) after failures. */
    this.retryAt = 0
    this.size = size > 0 ? size : 0
    this.duration = duration > 0 ? duration : 0
    this.fetchImpl = fetchImpl
    this.log = log
    this.pool = pool
    /** index -> Buffer, complete chunks only */
    this.chunks = new Map()
    /** index -> the connection loading it */
    this.claimed = new Map()
    /** index -> [{ resolve, reject, since }] */
    this.waiters = new Map()
    /** Open range requests: { pos, end, delivered, lastReadAt } */
    this.readers = new Set()
    this.runs = new Set()
    this.closed = false
    this.broken = null
    this.lastPrimaryPos = 0
    this.lastReaderAt = Date.now()
    this.replaceTimer = setInterval(() => this.replaceSlow(), 500)
  }

  get chunkCount() {
    return Math.ceil(this.size / CHUNK)
  }

  /** Bytes per second the film plays at, when that can be told. */
  get bytesPerSecond() {
    return this.size && this.duration ? this.size / this.duration : 0
  }

  get aheadBytes() {
    const bps = this.bytesPerSecond
    return Math.min(AHEAD_MAX, Math.max(AHEAD_MIN, bps ? bps * AHEAD_S : AHEAD_MIN))
  }

  url() {
    return this.urls[Math.min(this.urlIndex, this.urls.length - 1)]
  }

  /** Learn the file's size from Real-Debrid when the player didn't know it. */
  async ensureSize() {
    if (this.size) return
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), FIRST_BYTE_MS * 2)
    try {
      const res = await this.fetchImpl(this.url(), { headers: { Range: 'bytes=0-' }, signal: ctrl.signal })
      const total = /\/(\d+)\s*$/.exec(res.headers.get('content-range') || '')
      this.size = total ? Number(total[1]) : Number(res.headers.get('content-length')) || 0
    } finally {
      clearTimeout(timer)
      ctrl.abort()
    }
    if (!this.size) throw new Error('Real-Debrid did not say how big the file is')
  }

  /** The reader the prefetching follows: the one that has read the most lately (the film, or ffmpeg). */
  primary() {
    let best = null
    for (const r of this.readers) {
      if (!best || r.delivered > best.delivered || (r.delivered === best.delivered && r.lastReadAt > best.lastReadAt)) best = r
    }
    return best
  }

  /** A complete chunk, loading it first when needed. */
  get(index) {
    if (this.broken) return Promise.reject(this.broken)
    const have = this.chunks.get(index)
    if (have) return Promise.resolve(have)
    return new Promise((resolve, reject) => {
      const list = this.waiters.get(index) || []
      list.push({ resolve, reject, since: Date.now() })
      this.waiters.set(index, list)
      this.schedule()
    })
  }

  /** Bytes loaded in a row from `pos` on. */
  contiguousAhead(pos) {
    let i = Math.floor(pos / CHUNK)
    let bytes = 0
    while (i < this.chunkCount && this.chunks.has(i)) bytes += this.chunkLength(i++)
    return Math.max(0, bytes - (pos % CHUNK))
  }

  /** The connection bringing chunk `i`, if one is. */
  carrierOf(i) {
    const owner = this.claimed.get(i)
    return owner && this.runs.has(owner) ? owner : null
  }

  /** Drop a connection on purpose (not a failure): its unloaded chunks go back to be asked for. */
  preempt(run) {
    run.preempted = true
    run.ctrl.abort()
  }

  /**
   * Decide which connections to open:
   *
   *   1. A chunk a reader is waiting on gets a connection of its own at
   *      once — the film starting, the index at the end of the file, a jump,
   *      a seek-bar preview. A prefetch that holds it but is still far from
   *      it is dropped rather than waited for.
   *   2. Ahead of the film (the reader that reads the most): one connection
   *      until there's a cushion, more as it grows — at the start every
   *      connection would share the line with the first frame.
   *   3. Prefetches the film has left behind (a jump) are dropped.
   */
  schedule() {
    if (this.closed || this.broken || !this.size) return
    if (Date.now() < this.retryAt) {
      if (!this.retryTimer) {
        this.retryTimer = setTimeout(() => {
          this.retryTimer = null
          this.schedule()
        }, this.retryAt - Date.now())
      }
      return
    }
    const primary = this.primary()
    if (primary) this.lastPrimaryPos = primary.pos
    const pos = this.lastPrimaryPos
    const from = Math.floor(pos / CHUNK)
    const to = Math.min(this.chunkCount - 1, Math.floor((pos + this.aheadBytes) / CHUNK))

    for (const run of this.runs) {
      if (!run.urgent && !run.preempted && (run.next < from - 1 || run.next > to + RUN_CHUNKS)) this.preempt(run)
    }

    for (const i of [...this.waiters.keys()].sort((a, b) => a - b)) {
      if (this.chunks.has(i)) continue
      const carrier = this.carrierOf(i)
      if (carrier && !carrier.preempted && i - carrier.next <= 1) continue
      if (carrier && carrier.urgent && !carrier.preempted) continue
      if (carrier) this.preempt(carrier)
      if ([...this.runs].filter((r) => r.urgent && !r.preempted).length >= 3) break
      this.startRun(i, { urgent: true })
    }

    if (this.readers.size === 0 && Date.now() - this.lastReaderAt > IDLE_STOP_MS) return
    const cushion = this.contiguousAhead(pos)
    const live = [...this.runs].filter((r) => !r.preempted)
    const urgentNow = live.filter((r) => r.urgent).length
    // Short of a cushion, the one connection may as well be an urgent one already loading the film.
    const allowed = cushion < SOLO_UNTIL ? Math.max(0, 1 - urgentNow) : cushion < 64 * MB ? 2 : WORKERS
    let prefetching = live.filter((r) => !r.urgent).length
    for (let i = from; i <= to && prefetching < allowed; i++) {
      if (this.chunks.has(i) || this.carrierOf(i)) continue
      if (!this.pool.reserve(CHUNK * RUN_CHUNKS, this)) break
      this.startRun(i)
      prefetching++
    }
  }

  /** Load chunks from `first` on over one connection, until one that's already loaded or being loaded, or RUN_CHUNKS of them. */
  startRun(first, { urgent = false } = {}) {
    const indices = []
    for (let i = first; i < this.chunkCount && indices.length < RUN_CHUNKS; i++) {
      if (i !== first && (this.chunks.has(i) || this.carrierOf(i))) break
      indices.push(i)
    }
    const run = { indices, next: first, ctrl: new AbortController(), gotBytes: false, urgent, preempted: false, startedAt: Date.now() }
    this.debug(`run ${first}-${indices[indices.length - 1]}${urgent ? ' urgent' : ''}`)
    for (const i of indices) this.claimed.set(i, run)
    this.runs.add(run)
    this.load(run)
      .then(() => {
        this.failures = 0
        this.refusals = 0
        this.urlFailures = 0
      })
      .catch((err) => {
        if (this.closed || run.preempted) return
        this.failures++
        this.urlFailures++
        if (err && err.refused) this.refusals++
        this.retryAt = Date.now() + retryDelay(this.failures)
        this.log(`Relay: ${err && err.message ? err.message : err} (chunk ${run.next}, failure ${this.failures})`)
        if (this.urlFailures >= MAX_URL_FAILURES && this.urlIndex < this.urls.length - 1) {
          this.urlIndex++
          this.urlFailures = 0
          this.log('Relay: switching to the next link')
        }
        if (this.refusals >= MAX_REFUSALS) this.fail(new Error('Real-Debrid refuses to send this file'))
      })
      .finally(() => {
        this.runs.delete(run)
        for (const i of run.indices) if (this.claimed.get(i) === run) this.claimed.delete(i)
        this.evict()
        this.schedule()
      })
  }

  async load(run) {
    const start = run.indices[0] * CHUNK
    const last = run.indices[run.indices.length - 1]
    const end = Math.min(this.size, (last + 1) * CHUNK) // exclusive
    let timer = setTimeout(() => run.ctrl.abort(), FIRST_BYTE_MS)
    const quiet = () => {
      clearTimeout(timer)
      timer = setTimeout(() => run.ctrl.abort(), QUIET_MS)
    }
    try {
      // Real-Debrid sends to the end of the file whatever the range says; we stop reading at `end`.
      const res = await this.fetchImpl(this.url(), { headers: { Range: `bytes=${start}-${end - 1}` }, signal: run.ctrl.signal })
      if (res.status !== 206 && !(res.status === 200 && start === 0)) {
        const err = new Error(`Real-Debrid answered ${res.status}`)
        err.refused = res.status >= 400 && res.status < 500 && res.status !== 429
        throw err
      }
      const reader = res.body.getReader()
      let pos = start
      let index = run.indices[0]
      let buf = Buffer.allocUnsafe(this.chunkLength(index))
      let filled = 0
      quiet()
      while (pos < end) {
        const { done, value } = await reader.read()
        if (done) throw new Error('Real-Debrid closed the connection early')
        if (!run.gotBytes) this.debug(`first bytes for run ${run.indices[0]}`)
        run.gotBytes = true
        quiet()
        let offset = 0
        while (offset < value.length && pos < end) {
          const take = Math.min(value.length - offset, buf.length - filled)
          buf.set(value.subarray(offset, offset + take), filled)
          filled += take
          offset += take
          pos += take
          if (filled === buf.length) {
            this.store(index, buf)
            index++
            run.next = index
            if (pos < end) {
              buf = Buffer.allocUnsafe(this.chunkLength(index))
              filled = 0
            }
          }
        }
        if (this.closed) break
      }
      reader.cancel().catch(() => {})
    } finally {
      clearTimeout(timer)
      run.ctrl.abort()
    }
  }

  chunkLength(index) {
    return Math.min(CHUNK, this.size - index * CHUNK)
  }

  store(index, buf) {
    if (!this.chunks.has(index)) {
      this.chunks.set(index, buf)
      this.pool.add(buf.length)
    }
    const list = this.waiters.get(index)
    if (list) {
      this.waiters.delete(index)
      for (const w of list) w.resolve(this.chunks.get(index))
    }
  }

  /** Replace the connection a waiting reader depends on when it hasn't sent a byte yet (see REPLACE_MS). */
  replaceSlow() {
    if (this.closed || this.broken) return
    const now = Date.now()
    for (const [index, list] of this.waiters) {
      if (!list.length || now - list[0].since < REPLACE_MS) continue
      const carrier = this.carrierOf(index)
      if (!carrier || carrier.gotBytes || carrier.preempted || now - carrier.startedAt < REPLACE_MS) continue
      this.debug(`replacing the silent connection for chunk ${index}`)
      this.preempt(carrier)
      this.startRun(index, { urgent: true })
    }
  }

  /**
   * Over budget: let go of what's furthest behind the film first, then what's
   * furthest ahead of what it needs, then — only well over budget — from the
   * far end of that. Never a chunk a reader is on.
   */
  evict() {
    if (!this.pool.over()) return
    const pos = this.lastPrimaryPos
    const keepFrom = Math.floor(Math.max(0, pos - BEHIND) / CHUNK)
    const keepTo = Math.floor((pos + this.aheadBytes) / CHUNK)
    const busy = new Set([...this.readers].map((r) => Math.floor(r.pos / CHUNK)))
    const rank = (i) => (i < keepFrom ? 2e9 + (keepFrom - i) : i > keepTo ? 1e9 + (i - keepTo) : i - keepFrom)
    const order = [...this.chunks.keys()].filter((i) => !busy.has(i)).sort((a, b) => rank(b) - rank(a))
    for (const i of order) {
      if (!this.pool.over()) break
      if (rank(i) < 1e9 && this.pool.used() <= BUDGET * 1.1) break
      this.pool.remove(this.chunks.get(i).length)
      this.chunks.delete(i)
    }
  }

  fail(err) {
    this.broken = err
    for (const list of this.waiters.values()) for (const w of list) w.reject(err)
    this.waiters.clear()
  }

  /** Answer a range request from the relay. */
  async serve(req, res) {
    try {
      await this.ensureSize()
    } catch (err) {
      res.writeHead(502, { 'Content-Type': 'text/plain' }).end(String(err && err.message))
      return
    }
    const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '')
    let start = 0
    let end = this.size - 1
    if (m) {
      if (m[1]) start = Number(m[1])
      if (m[2]) end = Math.min(Number(m[2]), this.size - 1)
      if (!m[1] && m[2]) {
        start = Math.max(0, this.size - Number(m[2]))
        end = this.size - 1
      }
    }
    if (start >= this.size || start > end) {
      res.writeHead(416, { 'Content-Range': `bytes */${this.size}` }).end()
      return
    }
    res.writeHead(m ? 206 : 200, {
      'Content-Type': 'application/octet-stream',
      'Content-Length': end - start + 1,
      ...(m ? { 'Content-Range': `bytes ${start}-${end}/${this.size}` } : {}),
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-store',
      ...CORS,
    })
    if (req.method === 'HEAD') return res.end()
    const reader = { pos: start, end, delivered: 0, lastReadAt: Date.now() }
    this.debug(`request bytes=${start}-${m && m[2] ? end : ''} (chunk ${Math.floor(start / CHUNK)})`)
    let gone = false
    res.on('close', () => {
      gone = true
      this.readers.delete(reader)
      this.lastReaderAt = Date.now()
    })
    this.readers.add(reader)
    let pos = start
    try {
      while (pos <= end && !gone && !this.closed) {
        const index = Math.floor(pos / CHUNK)
        reader.pos = pos
        const buf = await this.get(index)
        if (gone) break
        const slice = buf.subarray(pos - index * CHUNK, Math.min(buf.length, end - index * CHUNK + 1))
        pos += slice.length
        reader.pos = pos
        reader.delivered += slice.length
        reader.lastReadAt = Date.now()
        this.schedule()
        if (!res.write(slice)) {
          await new Promise((resolve) => {
            const done = () => {
              res.off('drain', done)
              res.off('close', done)
              resolve()
            }
            res.on('drain', done)
            res.on('close', done)
          })
        }
      }
      if (!gone) res.end()
    } catch (err) {
      this.log(`Relay: giving up on a reader (${err && err.message ? err.message : err})`)
      res.destroy()
    } finally {
      this.readers.delete(reader)
      this.lastReaderAt = Date.now()
    }
  }

  close() {
    this.closed = true
    clearInterval(this.replaceTimer)
    clearTimeout(this.retryTimer)
    for (const run of this.runs) run.ctrl.abort()
    this.fail(new Error('closed'))
    for (const buf of this.chunks.values()) this.pool.remove(buf.length)
    this.chunks.clear()
  }
}

/** Memory shared by every relayed file. */
function createPool() {
  let used = 0
  return {
    add: (n) => (used += n),
    remove: (n) => (used = Math.max(0, used - n)),
    used: () => used,
    over: () => used > BUDGET,
    /** Room for another connection's worth: evict first if needed. */
    reserve(bytes, file) {
      if (used + bytes <= BUDGET) return true
      file.evict()
      return used + bytes <= BUDGET * 1.1
    },
  }
}

/**
 * createRdStreams({ ffmpegCandidates, fetchImpl, allowUrl, log })
 *   open({ urls, size, duration, audioIndex, videoCodec }) -> { token, canConvert }
 *   close(token)
 *   handle(req, res, url) -> true when the request was a relay/convert one (answered)
 *   shutdown()
 */
function createRdStreams({ ffmpegCandidates = [], fetchImpl = globalThis.fetch, allowUrl = isRealDebridDownload, log = () => {}, debug = null } = {}) {
  const files = new Map()
  const pool = createPool()
  let ffmpeg
  const ffmpegPath = () => (ffmpeg === undefined ? (ffmpeg = findFfmpeg(ffmpegCandidates)) : ffmpeg)

  /** ffmpeg reads the relay over plain HTTP on loopback (the window's server is HTTPS with a certificate of its own). */
  let inner = null
  const innerPort = () => {
    if (!inner) {
      inner = new Promise((resolve, reject) => {
        const server = http.createServer((req, res) => {
          const token = (req.url || '').split('/')[1]
          const entry = files.get(token)
          if (!entry) return res.writeHead(404).end()
          entry.file.serve(req, res)
        })
        server.on('error', reject)
        server.listen(0, '127.0.0.1', () => resolve(server))
      })
    }
    return inner.then((server) => server.address().port)
  }

  function open({ urls, size, duration, audioIndex, videoCodec }) {
    const list = (Array.isArray(urls) ? urls : []).filter((u) => typeof u === 'string' && allowUrl(u))
    if (list.length === 0) throw new Error('Only Real-Debrid download links can be played through the app')
    const token = crypto.randomBytes(16).toString('hex')
    files.set(token, {
      file: new RelayFile({ urls: list, size: Number(size) || 0, duration: Number(duration) || 0, fetchImpl, log, pool, debug }),
      audioIndex: Number.isInteger(audioIndex) && audioIndex >= 0 ? audioIndex : 0,
      videoCodec: typeof videoCodec === 'string' ? videoCodec.toLowerCase() : '',
      converter: null,
    })
    return { token, canConvert: !!ffmpegPath() }
  }

  function close(token) {
    const entry = files.get(token)
    if (!entry) return
    files.delete(token)
    if (entry.converter) entry.converter.kill('SIGKILL')
    entry.file.close()
  }

  /**
   * The file with its audio converted to AAC and the video copied, as
   * fragmented MP4, from `t` seconds in — for the player's Media Source
   * feed (src/lib/localStream.ts). A jump restarts it, at the keyframe at
   * or before `t` (both tracks there, so they stay in sync); ffmpeg numbers
   * the output from 0, so the keyframe's own time — read from a second,
   * one-packet output — goes ahead of the stream as `X-Start-Time`.
   */
  async function convert(entry, token, req, res, url) {
    const bin = ffmpegPath()
    if (!bin) return res.writeHead(501, CORS).end()
    const at = Math.max(0, Math.floor(Number(url.searchParams.get('t')) || 0))
    if (entry.converter) entry.converter.kill('SIGKILL')
    const port = await innerPort()
    const hevc = entry.videoCodec === 'hevc' || entry.videoCodec === 'h265'
    const args = [
      '-nostdin', '-hide_banner', '-loglevel', 'error',
      ...(at > 0 ? ['-ss', String(at), '-noaccurate_seek'] : []),
      '-i', `http://127.0.0.1:${port}/${token}`,
      // The stream
      '-map', '0:v:0', '-map', `0:a:${entry.audioIndex}?`,
      '-c:v', 'copy', ...(hevc ? ['-tag:v', 'hvc1'] : []),
      '-c:a', 'aac', '-b:a', '192k', '-ac', '2',
      '-sn', '-dn',
      '-f', 'mp4', '-movflags', 'frag_keyframe+empty_moov+default_base_moof', '-frag_duration', '2000000',
      'pipe:1',
      // Where it starts: the first video packet's own timestamp
      '-map', '0:v:0', '-c', 'copy', '-copyts', '-frames:v', '1', '-f', 'framecrc', 'pipe:3',
    ]
    const proc = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe', 'pipe'] })
    entry.converter = proc
    let stderr = ''
    proc.stderr.on('data', (d) => {
      stderr = (stderr + d).slice(-2000)
    })
    proc.on('exit', (code, signal) => {
      if (entry.converter === proc) entry.converter = null
      if (code && !signal) log(`Convert: ffmpeg exited ${code}: ${stderr.trim().split('\n').slice(-3).join(' | ')}`)
    })
    proc.on('error', (err) => log(`Convert: ${err.message}`))
    res.on('close', () => proc.kill('SIGKILL'))

    // Hold the stream until its start time is known (a packet or two in).
    const startTime = await new Promise((resolve) => {
      let text = ''
      const timer = setTimeout(() => resolve(at), 30_000)
      proc.stdio[3].on('data', (d) => {
        text += d
        const tb = /#tb 0: (\d+)\/(\d+)/.exec(text)
        const pkt = /^0,\s*(-?\d+),/m.exec(text)
        if (tb && pkt) {
          clearTimeout(timer)
          resolve((Number(pkt[1]) * Number(tb[1])) / Number(tb[2]))
        }
      })
      proc.on('exit', () => {
        clearTimeout(timer)
        resolve(null)
      })
    })
    if (startTime === null) {
      if (!res.headersSent) res.writeHead(502, CORS).end(stderr.trim().split('\n').pop() || 'ffmpeg stopped')
      return
    }
    res.writeHead(200, { ...CORS, 'Content-Type': 'video/mp4', 'Cache-Control': 'no-store', 'X-Start-Time': String(startTime) })
    proc.stdout.pipe(res)
  }

  function handle(req, res, url) {
    const m = /^\/_rd\/([a-f0-9]{32})\/(file|convert)$/.exec(url.pathname)
    if (!m) return false
    const entry = files.get(m[1])
    if (!entry) {
      res.writeHead(404).end()
      return true
    }
    if (m[2] === 'file') entry.file.serve(req, res)
    else convert(entry, m[1], req, res, url).catch((err) => {
      log(`Convert: ${err && err.message}`)
      if (!res.headersSent) res.writeHead(500).end()
    })
    return true
  }

  function shutdown() {
    for (const token of [...files.keys()]) close(token)
    if (inner) inner.then((server) => server.close()).catch(() => {})
  }

  return { open, close, handle, shutdown, hasFfmpeg: () => !!ffmpegPath() }
}

module.exports = { createRdStreams, isRealDebridDownload, CHUNK }
