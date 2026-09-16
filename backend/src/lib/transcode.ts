/**
 * On-the-fly audio-only HLS transcoder for TorBox streams.
 *
 * Why this exists: a lot of 4K/UHD releases carry DTS/TrueHD/Atmos audio
 * (BluRay remux staples). No mainstream browser can decode those natively —
 * the <video> element plays the picture fine and silently drops the audio
 * track instead of erroring. TorBox's own web player would transcode this
 * for us, but that tier isn't part of every plan.
 *
 * The fix mirrors what Stremio's streaming server does for external players:
 * remux the stream with the video stream copied as-is (`-c:v copy` — no
 * re-encode, so it's cheap even for 4K) and only the audio re-encoded to AAC,
 * packaged as HLS so it can be served progressively while ffmpeg is still
 * working through the file.
 *
 * Sessions live in memory only (Map + child process + a scratch dir under
 * /tmp/hls). A process restart drops them, which is fine — the frontend just
 * calls /torbox/hls/start again and gets a new session.
 */

import { spawn, type ChildProcess } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { randomUUID } from 'crypto'
import { logger } from './logger'

const FFMPEG_PATH = process.env.FFMPEG_PATH || 'ffmpeg'
// The static-ffmpeg image ships ffprobe next to ffmpeg, so derive it from
// FFMPEG_PATH unless it's set explicitly.
const FFPROBE_PATH =
  process.env.FFPROBE_PATH ||
  (process.env.FFMPEG_PATH ? path.join(path.dirname(process.env.FFMPEG_PATH), 'ffprobe') : 'ffprobe')

// The Dockerfile pre-creates /tmp/hls with the right ownership for the
// production runtime user; fall back to the OS temp dir for local dev.
const HLS_ROOT = fs.existsSync('/tmp/hls') ? '/tmp/hls' : path.join(os.tmpdir(), 'streamvault-hls')

// Generous enough to survive a paused player: once the playlist is complete
// hls.js stops polling it, and a paused <video> fetches nothing at all. The
// frontend DELETEs its session on unmount, so this only reaps abandoned tabs.
const SESSION_IDLE_TIMEOUT_MS = 20 * 60 * 1000
const SESSION_MAX_AGE_MS = 4 * 60 * 60 * 1000
const SWEEP_INTERVAL_MS = 30 * 1000
const SEGMENT_WAIT_TIMEOUT_MS = 20 * 1000
const WAIT_POLL_MS = 300

/**
 * ffmpeg's `-reconnect` flags only cover drops mid-stream, not a failed
 * initial open — and TorBox CDN hostnames intermittently fail DNS resolution
 * (observed locally, Sept 2026). Restart a run that dies before producing a
 * single segment instead of surfacing that as a broken stream.
 */
const MAX_START_ATTEMPTS = 3
const START_RETRY_DELAY_MS = 1000

const PROBE_TIMEOUT_MS = 8000
const PROBE_CACHE_MAX = 500

/**
 * Audio codecs every mainstream browser decodes natively. Everything else —
 * most importantly AC3/E-AC3 (Dolby Digital/Plus, the norm on WEB-DL), DTS,
 * and TrueHD — plays as silent video: the <video> element drops the track
 * without firing an error.
 */
const BROWSER_SAFE_AUDIO_CODECS = new Set(['aac', 'mp3', 'opus', 'vorbis', 'flac'])

/** ISO 639 codes to prefer when a file carries several audio languages, most preferred first. */
const PREFERRED_AUDIO_LANGUAGES = (process.env.TORBOX_PREFERRED_AUDIO_LANGS || 'eng,en')
  .split(',')
  .map((l) => l.trim().toLowerCase())
  .filter(Boolean)

export interface HlsSession {
  id: string
  dir: string
  proc: ChildProcess
  createdAt: number
  lastAccess: number
  exited: boolean
  error: string | null
}

const sessions = new Map<string, HlsSession>()

// ---------------------------------------------------------------------------
// Stream probing + track selection
// ---------------------------------------------------------------------------

export interface ProbedStream {
  index: number
  codec_type: string
  codec_name?: string
  channels?: number
  disposition?: { default?: number; attached_pic?: number; comment?: number }
  tags?: { language?: string; title?: string }
}

export interface PlaybackPlan {
  /** True when the file can be handed to the browser as-is and will have sound. */
  direct: boolean
  /** Absolute stream index of the video track to keep (transcode only). */
  videoIndex: number | null
  /** Absolute stream index of the audio track to keep (transcode only). */
  audioIndex: number | null
  /** Human-readable reason, for logs. */
  reason: string
}

const probeCache = new Map<string, ProbedStream[]>()

/**
 * List a remote file's streams with ffprobe. Only the container headers are
 * read (analyzeduration 0). Returns null when the probe fails or times out —
 * callers fall back to the release-name heuristic.
 *
 * Two probes race, and the first one to find the streams wins. One forbids
 * seeking: an MKV's track headers sit at the start, but a seekable probe also
 * chases Cues/Tags near EOF, costing a CDN round trip each (measured 4.4s →
 * 0.5-2s on TorBox for a 4K MKV). That probe can never finish an MP4 whose
 * `moov` index sits at the end, though — it reads mdat until the timeout — so
 * a seekable probe runs alongside it. Running both also rides out a transient
 * DNS/connect failure on either one.
 *
 * @param cacheKey - Stable identity of the file (torrent + file id). The
 *   signed URL changes on every request, so it can't be the key itself.
 */
export async function probeStreams(url: string, cacheKey: string): Promise<ProbedStream[] | null> {
  const hit = probeCache.get(cacheKey)
  if (hit) return hit

  const probes = [false, true].map((seekable) => runProbe(url, seekable))
  const streams = await new Promise<ProbedStream[] | null>((resolve) => {
    let pending = probes.length
    for (const probe of probes) {
      void probe.promise.then((result) => {
        pending--
        if (result) resolve(result)
        else if (pending === 0) resolve(null)
      })
    }
  })
  for (const probe of probes) probe.cancel()

  if (!streams) {
    logger.warn('ffprobe could not read TorBox file streams', { cacheKey })
    return null
  }
  if (probeCache.size >= PROBE_CACHE_MAX) {
    const oldest = probeCache.keys().next().value
    if (oldest !== undefined) probeCache.delete(oldest)
  }
  probeCache.set(cacheKey, streams)
  return streams
}

function runProbe(url: string, seekable: boolean): { promise: Promise<ProbedStream[] | null>; cancel: () => void } {
  const proc = spawn(
    FFPROBE_PATH,
    [
      '-v', 'error',
      '-seekable', seekable ? '1' : '0',
      '-probesize', '5000000',
      '-analyzeduration', '0',
      '-of', 'json',
      '-show_entries',
      'stream=index,codec_type,codec_name,channels:stream_disposition=default,attached_pic,comment:stream_tags=language,title',
      url,
    ],
    { stdio: ['ignore', 'pipe', 'ignore'] }
  )

  const promise = new Promise<ProbedStream[] | null>((resolve) => {
    let stdout = ''
    proc.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString()
    })

    const timer = setTimeout(() => proc.kill('SIGKILL'), PROBE_TIMEOUT_MS)

    proc.on('error', (err) => {
      clearTimeout(timer)
      logger.warn('ffprobe could not be spawned', { error: err.message })
      resolve(null)
    })
    proc.on('close', () => {
      clearTimeout(timer)
      try {
        const streams = (JSON.parse(stdout) as { streams?: ProbedStream[] }).streams
        if (Array.isArray(streams) && streams.some((s) => s.codec_type === 'video')) return resolve(streams)
      } catch {
        // Killed mid-output, or no output at all
      }
      resolve(null)
    })
  })

  return {
    promise,
    cancel: () => {
      if (proc.exitCode === null && proc.signalCode === null) proc.kill('SIGKILL')
    },
  }
}

function isCommentary(s: ProbedStream): boolean {
  return s.disposition?.comment === 1 || /commentary/i.test(s.tags?.title || '')
}

function isBrowserSafeAudio(s: ProbedStream): boolean {
  return BROWSER_SAFE_AUDIO_CODECS.has((s.codec_name || '').toLowerCase())
}

/**
 * Pick the audio track a viewer actually wants: preferred language first
 * (multi-audio releases often lead with a Russian/Hindi/Turkish dub), then
 * the track the file flags as default, then simply the first — skipping
 * commentary tracks throughout. Within a language, a browser-safe codec wins
 * so no transcode is needed when the release also ships an AAC track.
 */
export function chooseAudioTrack(streams: ProbedStream[]): ProbedStream | null {
  const audio = streams.filter((s) => s.codec_type === 'audio')
  if (audio.length === 0) return null
  const main = audio.filter((s) => !isCommentary(s))
  const pool = main.length > 0 ? main : audio

  const byLang = (lang: string) => pool.filter((s) => (s.tags?.language || '').toLowerCase() === lang)
  let candidates: ProbedStream[] = []
  for (const lang of PREFERRED_AUDIO_LANGUAGES) {
    candidates = byLang(lang)
    if (candidates.length > 0) break
  }
  if (candidates.length === 0) candidates = pool.filter((s) => s.disposition?.default === 1)
  if (candidates.length === 0) candidates = pool

  return candidates.find(isBrowserSafeAudio) ?? candidates[0]
}

/**
 * Decide how a probed file should be played. Browsers only ever play a
 * file's first audio track, so direct playback is only safe when the chosen
 * track is both browser-decodable and the first one in the file; anything
 * else is remuxed with just the chosen track, re-encoded to AAC.
 */
export function planPlayback(streams: ProbedStream[]): PlaybackPlan {
  const video = streams.find((s) => s.codec_type === 'video' && s.disposition?.attached_pic !== 1)
  const audio = chooseAudioTrack(streams)
  const firstAudio = streams.find((s) => s.codec_type === 'audio')

  if (!audio) {
    return { direct: true, videoIndex: null, audioIndex: null, reason: 'no audio track' }
  }
  if (isBrowserSafeAudio(audio) && audio.index === firstAudio?.index) {
    return { direct: true, videoIndex: null, audioIndex: null, reason: `browser-safe ${audio.codec_name}` }
  }
  return {
    direct: false,
    videoIndex: video?.index ?? null,
    audioIndex: audio.index,
    reason: isBrowserSafeAudio(audio)
      ? `preferred ${audio.codec_name} track is not the first audio track`
      : `${audio.codec_name} audio is not browser-decodable`,
  }
}

// ---------------------------------------------------------------------------
// HLS session lifecycle
// ---------------------------------------------------------------------------

/**
 * Start remuxing `sourceUrl` into HLS: video stream copied through untouched,
 * audio re-encoded to stereo AAC. Segments land in a per-session scratch dir
 * as ffmpeg produces them — playback can start as soon as the first one
 * exists, well before the whole file has been processed.
 *
 * @param tracks - Absolute stream indexes from `planPlayback`. Omitted (e.g.
 *   the probe failed), the first video and first audio track are used.
 */
export function createHlsSession(
  sourceUrl: string,
  tracks: { videoIndex?: number | null; audioIndex?: number | null } = {}
): HlsSession {
  const id = randomUUID()
  const dir = path.join(HLS_ROOT, id)
  fs.mkdirSync(dir, { recursive: true })

  const args = [
    '-loglevel', 'error',
    '-y',
    '-reconnect', '1',
    '-reconnect_streamed', '1',
    '-reconnect_on_network_error', '1',
    '-reconnect_delay_max', '5',
    '-i', sourceUrl,
    '-map', tracks.videoIndex != null ? `0:${tracks.videoIndex}` : '0:v:0',
    '-map', tracks.audioIndex != null ? `0:${tracks.audioIndex}` : '0:a:0?',
    '-c:v', 'copy',
    '-c:a', 'aac',
    '-ac', '2',
    '-b:a', '192k',
    // 4K remuxes deliver video packets far faster than the audio encoder
    // drains; the default queue overflows and aborts the mux.
    '-max_muxing_queue_size', '4096',
    '-f', 'hls',
    '-hls_time', '6',
    '-hls_list_size', '0',
    // EVENT, not VOD: the playlist genuinely grows while ffmpeg works, and
    // #EXT-X-ENDLIST marks when it's complete.
    '-hls_playlist_type', 'event',
    '-hls_flags', 'independent_segments',
    '-hls_segment_filename', path.join(dir, 'seg_%05d.ts'),
    path.join(dir, 'playlist.m3u8'),
  ]

  const session: HlsSession = {
    id,
    dir,
    proc: spawn(FFMPEG_PATH, args, { stdio: ['ignore', 'ignore', 'pipe'] }),
    createdAt: Date.now(),
    lastAccess: Date.now(),
    exited: false,
    error: null,
  }

  const attach = (proc: ChildProcess, attempt: number) => {
    let stderrTail = ''
    proc.stderr?.on('data', (chunk: Buffer) => {
      stderrTail = (stderrTail + chunk.toString()).slice(-4000)
    })

    proc.on('exit', (code) => {
      if (session.proc !== proc) return
      if (code === 0 || code === null) {
        session.exited = true
        return
      }

      const producedOutput = fs.existsSync(path.join(dir, 'playlist.m3u8'))
      if (!producedOutput && attempt < MAX_START_ATTEMPTS && sessions.has(id)) {
        logger.warn('TorBox HLS transcode failed to start, retrying', {
          sessionId: id,
          attempt,
          error: stderrTail,
        })
        setTimeout(() => {
          if (!sessions.has(id)) return
          const retry = spawn(FFMPEG_PATH, args, { stdio: ['ignore', 'ignore', 'pipe'] })
          session.proc = retry
          attach(retry, attempt + 1)
        }, START_RETRY_DELAY_MS)
        return
      }

      session.exited = true
      session.error = stderrTail || `ffmpeg exited with code ${code}`
      logger.warn('TorBox HLS transcode failed', { sessionId: id, code, error: session.error })
    })

    proc.on('error', (spawnErr) => {
      if (session.proc !== proc) return
      session.exited = true
      session.error = spawnErr.message
      logger.error('Failed to spawn ffmpeg for TorBox HLS session', {
        sessionId: id,
        error: spawnErr.message,
      })
    })
  }

  attach(session.proc, 1)
  sessions.set(id, session)
  return session
}

/** Look up a session by id, marking it as recently accessed. */
export function getSession(id: string): HlsSession | undefined {
  const session = sessions.get(id)
  if (session) session.lastAccess = Date.now()
  return session
}

/** Stop a session early (the viewer closed the player or switched release). */
export function stopSession(id: string): boolean {
  const session = sessions.get(id)
  if (!session) return false
  destroySession(session)
  return true
}

function destroySession(session: HlsSession) {
  sessions.delete(session.id)
  if (!session.exited) {
    try {
      session.proc.kill('SIGKILL')
    } catch {
      // Already gone
    }
  }
  fs.rm(session.dir, { recursive: true, force: true }, () => {})
}

const sweepInterval = setInterval(() => {
  const now = Date.now()
  for (const session of sessions.values()) {
    if (
      now - session.lastAccess > SESSION_IDLE_TIMEOUT_MS ||
      now - session.createdAt > SESSION_MAX_AGE_MS
    ) {
      destroySession(session)
    }
  }
}, SWEEP_INTERVAL_MS)
sweepInterval.unref()

function killAllSessions() {
  for (const session of [...sessions.values()]) destroySession(session)
}
process.once('SIGTERM', killAllSessions)
process.once('SIGINT', killAllSessions)

// ---------------------------------------------------------------------------
// File readiness helpers (ffmpeg is still writing while we serve)
// ---------------------------------------------------------------------------

/** Poll for a file to exist and be non-empty — ffmpeg writes it asynchronously. */
export async function waitForFile(filePath: string, timeoutMs = SEGMENT_WAIT_TIMEOUT_MS): Promise<boolean> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      if (fs.statSync(filePath).size > 0) return true
    } catch {
      // Not written yet
    }
    await new Promise((r) => setTimeout(r, WAIT_POLL_MS))
  }
  try {
    return fs.statSync(filePath).size > 0
  } catch {
    return false
  }
}

/** Poll until the playlist references at least one segment (not just the header). */
export async function waitForPlaylistReady(dir: string, timeoutMs = SEGMENT_WAIT_TIMEOUT_MS): Promise<boolean> {
  const playlistPath = path.join(dir, 'playlist.m3u8')
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const content = fs.readFileSync(playlistPath, 'utf8')
      if (content.includes('.ts')) return true
    } catch {
      // Not written yet
    }
    await new Promise((r) => setTimeout(r, WAIT_POLL_MS))
  }
  return false
}
