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
const FFPROBE_PATH = process.env.FFPROBE_PATH || 'ffprobe'

// The Dockerfile pre-creates /tmp/hls with the right ownership for the
// production runtime user; fall back to the OS temp dir for local dev.
const HLS_ROOT = fs.existsSync('/tmp/hls') ? '/tmp/hls' : path.join(os.tmpdir(), 'streamvault-hls')

const SESSION_IDLE_TIMEOUT_MS = 3 * 60 * 1000
const SESSION_MAX_AGE_MS = 4 * 60 * 60 * 1000
const SWEEP_INTERVAL_MS = 30 * 1000
const SEGMENT_WAIT_TIMEOUT_MS = 20 * 1000
const WAIT_POLL_MS = 300

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
// Codec probing
// ---------------------------------------------------------------------------

export interface ProbedStreams {
  videoCodec: string | null
  audioCodec: string | null
  durationSeconds: number | null
}

interface FfprobeStream {
  codec_type: string
  codec_name: string
}

interface FfprobeOutput {
  streams?: FfprobeStream[]
  format?: { duration?: string }
}

/**
 * Probe a remote stream URL's codecs via ffprobe. TorBox's CDN already
 * supports HTTP range requests (native <video> seeking on it works today),
 * which is what lets ffprobe read container metadata without downloading the
 * whole file.
 */
export async function probeStream(url: string): Promise<ProbedStreams> {
  return new Promise((resolve, reject) => {
    const args = [
      '-v', 'error',
      '-print_format', 'json',
      '-show_entries', 'stream=codec_type,codec_name:format=duration',
      url,
    ]

    const proc = spawn(FFPROBE_PATH, args)
    let out = ''
    let err = ''

    const timer = setTimeout(() => {
      proc.kill('SIGKILL')
      reject(new Error('ffprobe timed out'))
    }, SEGMENT_WAIT_TIMEOUT_MS)

    proc.stdout.on('data', (chunk: Buffer) => (out += chunk.toString()))
    proc.stderr.on('data', (chunk: Buffer) => (err += chunk.toString()))

    proc.on('error', (spawnErr) => {
      clearTimeout(timer)
      reject(spawnErr)
    })

    proc.on('close', (code) => {
      clearTimeout(timer)
      if (code !== 0) {
        reject(new Error(`ffprobe exited with code ${code}: ${err.slice(0, 500)}`))
        return
      }
      try {
        const parsed = JSON.parse(out) as FfprobeOutput
        const video = parsed.streams?.find((s) => s.codec_type === 'video')
        const audio = parsed.streams?.find((s) => s.codec_type === 'audio')
        resolve({
          videoCodec: video?.codec_name ?? null,
          audioCodec: audio?.codec_name ?? null,
          durationSeconds: parsed.format?.duration ? parseFloat(parsed.format.duration) : null,
        })
      } catch {
        reject(new Error('Failed to parse ffprobe output'))
      }
    })
  })
}

/** Audio codecs every mainstream browser can decode natively without help. */
const BROWSER_SAFE_AUDIO_CODECS = new Set(['aac', 'mp3', 'opus', 'vorbis', 'flac'])

/**
 * True when the probed audio codec needs to go through the HLS transcode
 * path instead of being played directly. Unknown codec (probe failed / no
 * audio stream detected) resolves to false — better to let native playback
 * try first than to unconditionally pay for a transcode session.
 */
export function needsAudioTranscode(audioCodec: string | null): boolean {
  if (!audioCodec) return false
  return !BROWSER_SAFE_AUDIO_CODECS.has(audioCodec.toLowerCase())
}

// ---------------------------------------------------------------------------
// HLS session lifecycle
// ---------------------------------------------------------------------------

/**
 * Start remuxing `sourceUrl` into HLS: video stream copied through untouched,
 * audio re-encoded to stereo AAC. Segments land in a per-session scratch dir
 * as ffmpeg produces them — playback can start as soon as the first one
 * exists, well before the whole file has been processed.
 */
export function createHlsSession(sourceUrl: string): HlsSession {
  const id = randomUUID()
  const dir = path.join(HLS_ROOT, id)
  fs.mkdirSync(dir, { recursive: true })

  const args = [
    '-loglevel', 'error',
    '-y',
    '-reconnect', '1',
    '-reconnect_streamed', '1',
    '-reconnect_delay_max', '5',
    '-i', sourceUrl,
    '-map', '0:v:0',
    '-map', '0:a:0?',
    '-c:v', 'copy',
    '-c:a', 'aac',
    '-ac', '2',
    '-b:a', '192k',
    '-f', 'hls',
    '-hls_time', '6',
    '-hls_list_size', '0',
    '-hls_flags', 'independent_segments',
    '-hls_segment_filename', path.join(dir, 'seg_%05d.ts'),
    path.join(dir, 'playlist.m3u8'),
  ]

  const proc = spawn(FFMPEG_PATH, args, { stdio: ['ignore', 'ignore', 'pipe'] })

  const session: HlsSession = {
    id,
    dir,
    proc,
    createdAt: Date.now(),
    lastAccess: Date.now(),
    exited: false,
    error: null,
  }

  let stderrTail = ''
  proc.stderr?.on('data', (chunk: Buffer) => {
    stderrTail = (stderrTail + chunk.toString()).slice(-4000)
  })

  proc.on('exit', (code) => {
    session.exited = true
    if (code !== 0 && code !== null) {
      session.error = stderrTail || `ffmpeg exited with code ${code}`
      logger.warn('TorBox HLS transcode failed', { sessionId: id, code, error: session.error })
    }
  })

  proc.on('error', (spawnErr) => {
    session.exited = true
    session.error = spawnErr.message
    logger.error('Failed to spawn ffmpeg for TorBox HLS session', {
      sessionId: id,
      error: spawnErr.message,
    })
  })

  sessions.set(id, session)
  return session
}

/** Look up a session by id, marking it as recently accessed. */
export function getSession(id: string): HlsSession | undefined {
  const session = sessions.get(id)
  if (session) session.lastAccess = Date.now()
  return session
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
