/**
 * On-demand VOD HLS for TorBox files whose audio needs transcoding.
 *
 * The playlist lists every segment of the file from the first request (with
 * #EXT-X-ENDLIST), so the player shows the real duration and can seek
 * anywhere — the way Stremio's and Jellyfin's streaming servers behave —
 * instead of a growing "live" playlist that only covers what ffmpeg has
 * reached so far.
 *
 * Segments are produced by a single ffmpeg "job" (video copied, audio → AAC)
 * that runs ahead of the player. A request for a segment the job won't reach
 * soon (a seek) restarts the job at that segment. That's only correct because
 * segment boundaries are the file's own keyframe times (see keyframeIndex.ts)
 * and every job cuts at exactly those times: segment N is byte-identical for
 * video no matter which job produced it. Two ffmpeg details make that hold:
 *   - `-segment_times` are relative to the first video packet of the job, so
 *     each job is given times relative to the keyframe it starts on, and the
 *     input seek lands exactly on that keyframe (see SEEK_PAST_KEYFRAME).
 *   - `-avoid_negative_ts disabled`, otherwise the job starting at 0 (B-frame
 *     files have negative DTS there) is shifted relative to all the others.
 *
 * The job pauses (SIGSTOP) once it is BUFFER_AHEAD_S ahead of the player and
 * segments far behind the player are deleted, bounding disk use per session.
 *
 * ffmpeg reads through rangeProxy.ts rather than straight from the CDN, so a
 * restart doesn't re-download the file's header and index each time.
 */

import { spawn, type ChildProcess } from 'child_process'
import fs from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import { logger } from './logger'
import * as rangeProxy from './rangeProxy'

const FFMPEG_PATH = process.env.FFMPEG_PATH || 'ffmpeg'

/**
 * Short, so the first segment after a seek — the one the viewer waits on —
 * is a small download. Segments still span at least one GOP.
 */
const TARGET_SEGMENT_S = 3
/**
 * fftools seeks `-ss` minus 3/23s (~0.13s) for streams with B-frames, then
 * the demuxer lands on the keyframe at or before that. Seeking this far past
 * a boundary keyframe lands exactly on it.
 */
const SEEK_PAST_KEYFRAME_S = 0.16
/** A keyframe followed by another this soon can't be seeked to reliably, so it's never a boundary. */
const MIN_KEYFRAME_GAP_S = 0.3
/**
 * Starting guesses until a session has measured its own: how long a job
 * takes to deliver its first segment, and how fast (media seconds per
 * second) it produces after that. The rate is bounded by the link to the
 * CDN — only ~2x realtime for a high-bitrate remux on a 40 Mbit/s line.
 */
const DEFAULT_RESTART_COST_S = 5
const DEFAULT_PRODUCE_RATE = 2
const BUFFER_AHEAD_S = Number(process.env.TORBOX_HLS_BUFFER_AHEAD_S) || 300
const RESUME_BELOW_S = BUFFER_AHEAD_S * 0.6
const KEEP_BEHIND_S = Number(process.env.TORBOX_HLS_KEEP_BEHIND_S) || 180
const SEGMENT_WAIT_TIMEOUT_MS = 45 * 1000
const POLL_MS = 200
const MAX_JOB_FAILURES = 3
/** TorBox CDN links last about an hour; re-resolve well before that. */
const URL_MAX_AGE_MS = 20 * 60 * 1000

export interface VodTracks {
  videoIndex?: number | null
  audioIndex?: number | null
}

interface Job {
  id: number
  proc: ChildProcess
  dir: string
  listPath: string
  start: number
  /** Highest segment index this job has finished (start - 1 before the first). */
  produced: number
  spawnedAt: number
  /** When `produced` last advanced (or the job was resumed); null before the first segment. */
  progressAt: number | null
  listLinesSeen: number
  paused: boolean
  exited: boolean
  exitCode: number | null
  stderrTail: string
}

export interface VodSession {
  id: string
  dir: string
  /** Start time (s) of each segment; segment i spans [starts[i], starts[i+1]). */
  starts: number[]
  duration: number
  tracks: VodTracks
  resolveUrl: () => Promise<string>
  url: string
  urlResolvedAt: number
  job: Job | null
  jobSeq: number
  /** A job start is waiting on a fresh TorBox link. */
  starting: boolean
  completed: Set<number>
  /** Most recently requested segment — the player's position, for throttling and cleanup. */
  playhead: number
  requestSeq: number
  failures: number
  /** Measured seconds from job spawn to its first segment (moving average). */
  restartCostS: number
  /** Measured media seconds produced per wall-clock second (moving average). */
  produceRate: number
  createdAt: number
  lastAccess: number
  error: string | null
  throttleTimer: ReturnType<typeof setInterval>
}

const sessions = new Map<string, VodSession>()

/**
 * Group keyframes into segments of at least TARGET_SEGMENT_S. Returns each
 * segment's start time; the first is always the first keyframe.
 */
export function buildSegmentStarts(keyframes: number[], duration: number, target = TARGET_SEGMENT_S): number[] {
  const starts = [keyframes[0]]
  for (let i = 1; i < keyframes.length; i++) {
    const kf = keyframes[i]
    const next = keyframes[i + 1]
    if (next !== undefined && next - kf < MIN_KEYFRAME_GAP_S) continue
    if (kf - starts[starts.length - 1] >= target && duration - kf >= 1) starts.push(kf)
  }
  return starts
}

export function buildPlaylist(session: Pick<VodSession, 'starts' | 'duration'>): string {
  const { starts, duration } = session
  const durations = starts.map((s, i) => (i === starts.length - 1 ? duration : starts[i + 1]) - (i === 0 ? 0 : s))
  const lines = [
    '#EXTM3U',
    '#EXT-X-VERSION:3',
    `#EXT-X-TARGETDURATION:${Math.ceil(Math.max(...durations))}`,
    '#EXT-X-MEDIA-SEQUENCE:0',
    '#EXT-X-PLAYLIST-TYPE:VOD',
    '#EXT-X-INDEPENDENT-SEGMENTS',
  ]
  durations.forEach((d, i) => lines.push(`#EXTINF:${d.toFixed(6)},`, segmentName(i)))
  lines.push('#EXT-X-ENDLIST', '')
  return lines.join('\n')
}

function segmentName(index: number): string {
  return `seg_${String(index).padStart(5, '0')}.ts`
}

export function createVodSession(opts: {
  hlsRoot: string
  url: string
  resolveUrl: () => Promise<string>
  /** Stable identity of the file (torrent + file id), for the range proxy's cache. */
  cacheKey: string
  keyframes: number[]
  duration: number
  tracks: VodTracks
}): VodSession {
  const id = randomUUID()
  const dir = path.join(opts.hlsRoot, id)
  fs.mkdirSync(dir, { recursive: true })

  const session: VodSession = {
    id,
    dir,
    starts: buildSegmentStarts(opts.keyframes, opts.duration),
    duration: opts.duration,
    tracks: opts.tracks,
    resolveUrl: opts.resolveUrl,
    url: opts.url,
    urlResolvedAt: Date.now(),
    job: null,
    jobSeq: 0,
    starting: false,
    completed: new Set(),
    playhead: 0,
    requestSeq: 0,
    failures: 0,
    restartCostS: DEFAULT_RESTART_COST_S,
    produceRate: DEFAULT_PRODUCE_RATE,
    createdAt: Date.now(),
    lastAccess: Date.now(),
    error: null,
    throttleTimer: setInterval(() => maintain(session), 1000),
  }
  session.throttleTimer.unref()
  sessions.set(id, session)
  rangeProxy.registerSource(id, { key: opts.cacheKey, getUrl: () => session.url })
  // Get the first segments going while the player is still fetching the playlist.
  void startJob(session, 0)
  return session
}

export function getVodSession(id: string): VodSession | undefined {
  const session = sessions.get(id)
  if (session) session.lastAccess = Date.now()
  return session
}

export function destroyVodSession(session: VodSession) {
  sessions.delete(session.id)
  rangeProxy.unregisterSource(session.id)
  clearInterval(session.throttleTimer)
  if (session.job) killJob(session, session.job)
  fs.rm(session.dir, { recursive: true, force: true }, () => {})
}

// ---------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------

async function startJob(session: VodSession, start: number): Promise<void> {
  if (session.job) killJob(session, session.job)

  if (Date.now() - session.urlResolvedAt > URL_MAX_AGE_MS || session.failures > 0) {
    session.starting = true
    try {
      session.url = await session.resolveUrl()
      session.urlResolvedAt = Date.now()
    } catch (err: unknown) {
      logger.warn('Could not refresh TorBox link for HLS job', {
        sessionId: session.id,
        error: err instanceof Error ? err.message : String(err),
      })
    } finally {
      session.starting = false
    }
    if (session.job || !sessions.has(session.id)) return
  }

  let input = session.url
  try {
    input = await rangeProxy.localUrl(session.id)
  } catch (err: unknown) {
    logger.warn('TorBox range proxy unavailable; reading the CDN directly', {
      error: err instanceof Error ? err.message : String(err),
    })
  }
  if (session.job || !sessions.has(session.id)) return

  const jobId = ++session.jobSeq
  const dir = path.join(session.dir, `job_${jobId}`)
  fs.mkdirSync(dir, { recursive: true })
  const listPath = path.join(dir, 'list.csv')
  const { starts, tracks } = session
  const origin = starts[start]
  const cutTimes = starts
    .slice(start + 1)
    .map((s) => (s - (start === 0 ? starts[0] : origin)).toFixed(3))

  const args = [
    '-loglevel', 'error',
    '-y',
    '-reconnect', '1',
    '-reconnect_streamed', '1',
    '-reconnect_on_network_error', '1',
    '-reconnect_delay_max', '5',
    ...(start > 0 ? ['-ss', (origin + SEEK_PAST_KEYFRAME_S).toFixed(3)] : []),
    '-copyts',
    '-i', input,
    '-map', tracks.videoIndex != null ? `0:${tracks.videoIndex}` : '0:v:0',
    '-map', tracks.audioIndex != null ? `0:${tracks.audioIndex}` : '0:a:0?',
    '-c:v', 'copy',
    '-c:a', 'aac',
    '-ac', '2',
    '-b:a', '192k',
    // 4K remuxes deliver video packets far faster than the audio encoder
    // drains; the default queue overflows and aborts the mux.
    '-max_muxing_queue_size', '4096',
    '-avoid_negative_ts', 'disabled',
    '-f', 'segment',
    '-segment_format', 'mpegts',
    ...(cutTimes.length > 0 ? ['-segment_times', cutTimes.join(',')] : ['-segment_time', '999999']),
    '-segment_time_delta', '0.1',
    '-segment_start_number', String(start),
    '-segment_list', listPath,
    '-segment_list_type', 'csv',
    path.join(dir, 'seg_%05d.ts'),
  ]

  const job: Job = {
    id: jobId,
    proc: spawn(FFMPEG_PATH, args, { stdio: ['ignore', 'ignore', 'pipe'] }),
    dir,
    listPath,
    start,
    produced: start - 1,
    spawnedAt: Date.now(),
    progressAt: null,
    listLinesSeen: 0,
    paused: false,
    exited: false,
    exitCode: null,
    stderrTail: '',
  }
  session.job = job

  job.proc.stderr?.on('data', (chunk: Buffer) => {
    job.stderrTail = (job.stderrTail + chunk.toString()).slice(-4000)
  })
  job.proc.on('exit', (code) => {
    job.exited = true
    job.exitCode = code
    collectFinished(session, job)
    if (code !== 0 && code !== null && session.job === job) {
      logger.warn('TorBox HLS job failed', { sessionId: session.id, start, code, error: job.stderrTail })
    }
  })
  job.proc.on('error', (err) => {
    job.exited = true
    job.exitCode = -1
    job.stderrTail = err.message
  })
}

function killJob(session: VodSession, job: Job) {
  if (session.job === job) session.job = null
  if (!job.exited) {
    try {
      job.proc.kill('SIGKILL')
    } catch {
      // Already gone
    }
  }
  collectFinished(session, job)
  fs.rm(job.dir, { recursive: true, force: true }, () => {})
}

/**
 * Move segments the job has finished (listed in its CSV — ffmpeg appends a
 * line only once a segment is closed) into the session dir. The rename is
 * atomic, so a segment being served is never one ffmpeg is still writing.
 */
function collectFinished(session: VodSession, job: Job) {
  let content: string
  try {
    content = fs.readFileSync(job.listPath, 'utf8')
  } catch {
    return
  }
  // The last element is '' or a line ffmpeg is still writing.
  const complete = content.split('\n').slice(0, -1)
  const before = job.produced
  for (let i = job.listLinesSeen; i < complete.length; i++) {
    const match = /^(seg_(\d{5})\.ts),/.exec(complete[i])
    if (!match) continue
    const index = Number(match[2])
    try {
      fs.renameSync(path.join(job.dir, match[1]), path.join(session.dir, segmentName(index)))
      session.completed.add(index)
      if (index > job.produced) job.produced = index
    } catch {
      // Already moved or removed
    }
  }
  job.listLinesSeen = complete.length
  if (job.produced > before) recordProgress(session, job, before)
}

/** Update the session's restart-cost and production-rate estimates from a job's progress. */
function recordProgress(session: VodSession, job: Job, before: number) {
  const now = Date.now()
  if (job.progressAt === null) {
    session.restartCostS = ewma(session.restartCostS, (now - job.spawnedAt) / 1000)
  } else if (now > job.progressAt) {
    const media = segmentEnd(session, job.produced) - segmentEnd(session, before)
    session.produceRate = ewma(session.produceRate, media / ((now - job.progressAt) / 1000))
  }
  job.progressAt = now
}

function ewma(previous: number, sample: number): number {
  return previous * 0.6 + sample * 0.4
}

function segmentEnd(session: Pick<VodSession, 'starts' | 'duration'>, index: number): number {
  return index + 1 < session.starts.length ? session.starts[index + 1] : session.duration
}

/**
 * Whether to wait for the running job to reach segment `index` rather than
 * restart it there: only when that's expected to be quicker than a restart.
 */
export function shouldJoin(
  session: Pick<VodSession, 'starts' | 'duration' | 'restartCostS' | 'produceRate'>,
  job: Pick<Job, 'start' | 'produced' | 'exited'>,
  index: number
): boolean {
  // Behind the job: already produced, so if it isn't on disk it was cleaned up.
  if (job.exited || index < job.start || index <= job.produced) return false
  // The segment the job is working on right now.
  if (index === job.produced + 1) return true
  const reached = job.produced >= job.start ? segmentEnd(session, job.produced) : session.starts[job.start]
  const gap = segmentEnd(session, index) - reached
  return gap / session.produceRate <= session.restartCostS
}

function signal(job: Job, sig: 'SIGSTOP' | 'SIGCONT') {
  if (job.exited) return
  try {
    job.proc.kill(sig)
    job.paused = sig === 'SIGSTOP'
    // Time spent stopped isn't production time.
    if (sig === 'SIGCONT' && job.progressAt !== null) job.progressAt = Date.now()
  } catch {
    // Already gone
  }
}

/** Throttle the job to BUFFER_AHEAD_S ahead of the player and drop segments far behind it. */
function maintain(session: VodSession) {
  const job = session.job
  if (job) {
    collectFinished(session, job)
    if (!job.exited && job.produced >= session.playhead) {
      const ahead = session.starts[job.produced] - session.starts[session.playhead]
      if (!job.paused && ahead > BUFFER_AHEAD_S) signal(job, 'SIGSTOP')
      else if (job.paused && ahead < RESUME_BELOW_S) signal(job, 'SIGCONT')
    }
  }

  const cutoff = session.starts[session.playhead] - KEEP_BEHIND_S
  for (const index of session.completed) {
    if (session.starts[index] >= cutoff) continue
    session.completed.delete(index)
    fs.rm(path.join(session.dir, segmentName(index)), { force: true }, () => {})
  }
}

// ---------------------------------------------------------------------------
// Serving
// ---------------------------------------------------------------------------

/**
 * Resolve once segment `index` is on disk, starting or restarting the ffmpeg
 * job as needed. Only the newest request may restart the job: a request the
 * player already abandoned (it seeked away) just waits out its timeout
 * instead of dragging the job back.
 *
 * @returns the segment's path, or an error message.
 */
export async function ensureSegment(
  session: VodSession,
  index: number,
  aborted: () => boolean
): Promise<{ path: string } | { error: string; status: number }> {
  if (index < 0 || index >= session.starts.length) return { error: 'Segment out of range', status: 404 }
  const requestId = ++session.requestSeq
  session.playhead = index
  const segPath = path.join(session.dir, segmentName(index))
  const deadline = Date.now() + SEGMENT_WAIT_TIMEOUT_MS

  while (Date.now() < deadline && !aborted()) {
    if (!sessions.has(session.id)) return { error: 'Session closed', status: 404 }
    const job = session.job
    if (job) collectFinished(session, job)
    if (session.completed.has(index)) {
      session.failures = 0
      return { path: segPath }
    }

    if (job && shouldJoin(session, job, index)) {
      if (job.paused) signal(job, 'SIGCONT')
    } else if (requestId === session.requestSeq && !session.starting) {
      if (job?.exited && job.exitCode === 0 && index > job.produced && index >= job.start) {
        // ffmpeg reached the end of the file without producing this segment.
        return { error: 'Segment not available', status: 404 }
      }
      if (job?.exited && job.exitCode !== 0) {
        session.failures++
        if (session.failures > MAX_JOB_FAILURES) {
          return { error: job.stderrTail || 'Transcode failed', status: 502 }
        }
        // TorBox CDN hostnames intermittently fail DNS; don't hammer them.
        await new Promise((r) => setTimeout(r, 1000))
      }
      await startJob(session, index)
    }

    await new Promise((r) => setTimeout(r, POLL_MS))
  }
  return { error: 'Timed out waiting for segment', status: 504 }
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

// Generous enough to survive a paused player — a paused <video> fetches nothing.
const SESSION_IDLE_TIMEOUT_MS = 20 * 60 * 1000
const SESSION_MAX_AGE_MS = 6 * 60 * 60 * 1000

export function stopVodSession(id: string): boolean {
  const session = sessions.get(id)
  if (!session) return false
  destroyVodSession(session)
  return true
}

const sweepInterval = setInterval(() => {
  const now = Date.now()
  for (const session of sessions.values()) {
    if (now - session.lastAccess > SESSION_IDLE_TIMEOUT_MS || now - session.createdAt > SESSION_MAX_AGE_MS) {
      destroyVodSession(session)
    }
  }
}, 30 * 1000)
sweepInterval.unref()

function destroyAll() {
  for (const session of [...sessions.values()]) destroyVodSession(session)
}
process.once('SIGTERM', destroyAll)
process.once('SIGINT', destroyAll)
