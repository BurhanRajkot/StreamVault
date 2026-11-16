/**
 * How the Premium player behaves on a weak connection — the decisions,
 * kept apart from the <video> element so they can be tested.
 *
 * A slow connection and a dead one look alike for a while: nothing on
 * screen. The player used to give both the same few seconds and then drop
 * the stream — for the next server, the converted stream, the next release —
 * until it ran out and showed an error. On a slow line that threw away a
 * stream that was working; when the Wi-Fi dropped for half a minute it ended
 * the film. So:
 *
 *   - a stream is only taken for dead when no bytes are arriving;
 *   - a film that has played is reconnected where it stopped, however long
 *     the connection takes to come back (reconnectDelayMs);
 *   - a slow connection gets more time to start (startupPatience), and no
 *     second connection competing for it (shouldHedge);
 *   - a film that keeps stalling is reported (StallMeter), so the player
 *     can move to a release the connection can carry.
 */

/** Below this (kbit/s) a connection needs extra time to start a film. */
const SLOW_CONNECTION_KBPS = 4000
/** How much longer than usual the slowest connection gets to start. */
const MAX_STARTUP_PATIENCE = 4

/**
 * How many times the usual startup timeout this connection gets. A 1080p
 * file needs a few megabytes before its first frame: seconds on a fast
 * line, a minute at 1 Mbit/s.
 */
export function startupPatience(kbps: number | null): number {
  if (kbps === null || !(kbps > 0) || kbps >= SLOW_CONNECTION_KBPS) return 1
  return Math.min(MAX_STARTUP_PATIENCE, SLOW_CONNECTION_KBPS / kbps)
}

/**
 * Whether a second connection may race a direct link that's slow to answer
 * (see DebridVideo's startup). Not on a slow line: the two would share what
 * little there is, and the first isn't stuck, just slow.
 */
export function shouldHedge(kbps: number | null): boolean {
  return kbps === null || !(kbps > 0) || kbps >= SLOW_CONNECTION_KBPS
}

const RECONNECT_BASE_MS = 1000
const RECONNECT_MAX_MS = 10_000

/** How long to wait before reconnect number `attempt` (1, 2, ...): 1s, 2s, 4s, 8s, then every 10s. */
export function reconnectDelayMs(attempt: number): number {
  const n = Math.max(1, Math.floor(attempt))
  return Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** Math.min(n - 1, 10))
}

/** Stalls are counted over this much time. */
const STALL_WINDOW_MS = 3 * 60_000
/** This many stalls in the window... */
const STALL_COUNT_LIMIT = 3
/** ...or this much time spent stalled in it, and the connection isn't keeping up with the file. */
const STALL_TIME_LIMIT_MS = 15_000
/** Shorter than this isn't a stall worth counting. */
const MIN_STALL_MS = 1000

/**
 * Keeps count of a film's stalls — the ones the connection caused, not the
 * wait after a jump — and says when there have been too many: the file
 * needs more than the connection delivers.
 */
export class StallMeter {
  private stalls: { at: number; ms: number }[] = []

  /** A stall that ended at `at` (ms, any clock) after lasting `ms`. */
  note(at: number, ms: number): void {
    if (ms < MIN_STALL_MS) return
    this.stalls.push({ at, ms })
    this.trim(at)
  }

  /** Whether the film is struggling at `now` — `ongoingMs` is the stall still running, if one is. */
  struggling(now: number, ongoingMs = 0): boolean {
    this.trim(now)
    const ongoing = ongoingMs >= MIN_STALL_MS ? 1 : 0
    const total = this.stalls.reduce((sum, s) => sum + s.ms, 0) + (ongoing ? ongoingMs : 0)
    return this.stalls.length + ongoing >= STALL_COUNT_LIMIT || total >= STALL_TIME_LIMIT_MS
  }

  reset(): void {
    this.stalls = []
  }

  private trim(now: number): void {
    this.stalls = this.stalls.filter((s) => now - s.at <= STALL_WINDOW_MS)
  }
}

/** Frames are judged over this much smooth playing time... */
const FRAME_WINDOW_MS = 10_000
/** ...once playback has settled this long after starting, a jump or a stall (decoders drop a few catching up)... */
const FRAME_SETTLE_MS = 8000
/** ...and only with this many frames to go by (10 s of a 24 fps film is 240). */
const MIN_WINDOW_FRAMES = 120
/** A quarter of the frames never shown: the picture visibly stutters. */
const DROPPED_SHARE_LIMIT = 0.25

/**
 * Keeps an eye on the frames a playing film drops — the ones the device
 * decoded too late to show (`getVideoPlaybackQuality`). A file the device
 * can't decode in time (4K, a high bitrate, a codec it decodes in
 * software) plays on without a single stall, so StallMeter never sees it,
 * but the picture judders.
 *
 * Fed readings only while the film plays smoothly and visibly; anything else
 * (a jump, a stall, a pause, a hidden tab — where browsers skip frames on
 * purpose) is a `reset`.
 */
export class FrameMeter {
  private readings: { at: number; total: number; dropped: number }[] = []
  private resetAt: number | null = null

  /** The film was interrupted at `at` (ms): what follows is judged afresh. */
  reset(at: number): void {
    this.readings = []
    this.resetAt = at
  }

  /** A reading at `at` (ms) of the element's running totals. */
  note(at: number, total: number, dropped: number): void {
    if (this.resetAt === null) this.resetAt = at
    if (at - this.resetAt < FRAME_SETTLE_MS) return
    this.readings.push({ at, total, dropped })
    // Keep the last window, plus the reading it's measured from.
    while (this.readings.length > 2 && at - this.readings[1].at >= FRAME_WINDOW_MS) this.readings.shift()
  }

  /** Whether the last window dropped too many frames. */
  struggling(): boolean {
    const first = this.readings[0]
    const last = this.readings[this.readings.length - 1]
    if (!first || last.at - first.at < FRAME_WINDOW_MS) return false
    const total = last.total - first.total
    const dropped = last.dropped - first.dropped
    return total >= MIN_WINDOW_FRAMES && dropped / total >= DROPPED_SHARE_LIMIT
  }
}

/**
 * What the connection delivered during a stall, in kbit/s: the film it
 * loaded (`bufferedS` seconds of a file that needs `fileKbps`) over the time
 * it took. Null when the stall was too short to say, or the film loaded
 * faster than it plays — then the stall wasn't the connection's doing.
 */
export function stallThroughputKbps(bufferedS: number, stallMs: number, fileKbps: number | null): number | null {
  if (fileKbps === null || !(fileKbps > 0) || !(bufferedS > 0) || stallMs < 2000) return null
  const ratio = bufferedS / (stallMs / 1000)
  if (ratio >= 1) return null
  return Math.max(1, Math.round(ratio * fileKbps))
}
