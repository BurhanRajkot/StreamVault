/**
 * Frames of one video file for the seek bar's previews (see SeekPreview),
 * grabbed from the file itself: a hidden, muted <video> on the same link is
 * seeked to a spot, and the frame drawn into a small canvas and kept.
 *
 * Measured on Real-Debrid links in Chrome (2026-11-10): the file's header
 * takes 3 requests (~3 MB, 3.5-4.5s from India to Real-Debrid's main
 * servers) before the first frame can be asked for, and every frame then
 * costs a new connection and 1-6s — a seek reads from the keyframe before
 * the spot, 1-8 MB. Fetching only what the pointer rests on, only once it
 * rests there, meant a spinner nearly every time. So:
 *
 *   - The header loads as soon as playback is under way (useFrameGrabber),
 *     not when the pointer first reaches the bar.
 *   - Two hidden elements ("lanes") work at once. The spot the pointer rests
 *     on never queues behind anything: it takes a free lane, or the one
 *     grabbing in the background.
 *   - In the background — only while the film itself is well buffered and
 *     hasn't stalled lately — frames are grabbed across the whole film, coarse
 *     to fine (the middle, the quarters, the eighths, ...). Wherever the
 *     pointer lands, a frame from close by is already there to stand in
 *     (dimmed, with a spinner) while the exact one loads.
 *   - Frames are kept by time bucket, so going back over the bar is instant.
 */

/** Frames kept per file — ~150 KB each at THUMB_PX wide. */
const MAX_FRAMES = 120
/** Width of a grabbed frame in pixels: sharp at the card's size on a 2× screen, small enough to keep many. */
const THUMB_PX = 256
/** A seek that hasn't landed by now is abandoned. */
const SEEK_GIVE_UP_MS = 10_000
/** Nearest grabbed frame shown while the exact one loads — at most this many buckets away, without background grabbing. */
const STAND_IN_BUCKETS = 3
/** The pointer has rested this long on a spot — fetch it. */
const SETTLE_MS = 60
/** Hidden elements grabbing at once. Real-Debrid closes every connection after one answer, so each is its own. */
const LANES = 2
/**
 * Frames grabbed across the film in the background: one every ~3 minutes
 * of a two-hour film, ~1 MB-8 MB each (a few % of the file).
 */
const BACKGROUND_FRAMES = 40
/** Background grabbing waits for the film to have this much loaded ahead of the playhead... */
const BACKGROUND_MIN_AHEAD_S = 8
/** ...and for this long after it last stalled. */
const BACKGROUND_QUIET_AFTER_STALL_MS = 20_000
/** Breathing room between background frames, for the film's own requests. */
const BACKGROUND_GAP_MS = 300
/** How often a waiting background queue checks whether the film is buffered well enough to go on. */
const BACKGROUND_CHECK_MS = 2000

/** Seconds of film one cached frame stands for. */
function bucketSeconds(duration: number): number {
  return Math.min(10, Math.max(2, Math.round(duration / 400)))
}

/**
 * `count` spots across (0, 1), coarse to fine — 1/2, 1/4, 3/4, 1/8, 5/8,
 * 3/8, 7/8, ... (the base-2 van der Corput sequence): however few have been
 * grabbed, they're spread over the whole film.
 */
export function coarseToFine(count: number): number[] {
  const out: number[] = []
  for (let i = 1; out.length < count; i++) {
    let f = 0
    let denom = 1
    for (let n = i; n > 0; n >>= 1) {
      denom *= 2
      if (n & 1) f += 1 / denom
    }
    out.push(f)
  }
  return out
}

/** Seconds loaded ahead of the playhead. */
function bufferedAhead(video: HTMLVideoElement): number {
  const t = video.currentTime
  const { buffered } = video
  for (let i = 0; i < buffered.length; i++) {
    if (buffered.start(i) <= t + 0.5 && buffered.end(i) >= t) return buffered.end(i) - t
  }
  return 0
}

type HTMLVideoWithFastSeek = HTMLVideoElement & { fastSeek?: (time: number) => void }

interface Lane {
  video: HTMLVideoWithFastSeek
  /** Bucket being fetched, or null when free. */
  bucket: number | null
  /** Fetching for the background queue (so the pointer may take it over). */
  background: boolean
  giveUp: ReturnType<typeof setTimeout> | null
}

export interface FrameGrabberOptions {
  /** The film playing. Background grabbing runs only while it's well buffered — never without it. */
  main?: HTMLVideoElement | null
  /** Grab frames across the film ahead of the pointer (not on phones, or with data saver on). */
  background?: boolean
}

/** Frames of one file, grabbed ahead of time and on demand. */
export class FrameGrabber {
  private readonly url: string
  private readonly lanes: Lane[] = []
  private readonly frames = new Map<number, HTMLCanvasElement>()
  private readonly listeners = new Set<() => void>()
  private readonly bucketS: number
  private readonly duration: number
  /** How far (in buckets) a stand-in frame may be from the spot pointed at. */
  private readonly standInBuckets: number
  private main: HTMLVideoElement | null = null
  /** Background buckets still to grab, in order. */
  private readonly queue: number[]
  /** Bucket the pointer wants next (latest request wins). */
  private wanted: number | null = null
  private settleTimer: ReturnType<typeof setTimeout> | null = null
  private backgroundTimer: ReturnType<typeof setInterval> | null = null
  private nextBackgroundAt = 0
  private lastStallAt = 0
  private destroyed = false
  /** The file can't be read here — no previews. */
  failed = false

  constructor(url: string, duration: number, { main = null, background = false }: FrameGrabberOptions = {}) {
    this.url = url
    this.duration = duration
    this.bucketS = bucketSeconds(duration)
    const buckets = Math.max(1, Math.ceil(duration / this.bucketS))
    const count = background ? Math.min(BACKGROUND_FRAMES, buckets) : 0
    this.queue = [...new Set(coarseToFine(count).map((f) => Math.floor((f * duration) / this.bucketS)))]
    this.standInBuckets = count > 0 ? Math.max(STAND_IN_BUCKETS, Math.ceil(buckets / count)) : STAND_IN_BUCKETS
    this.setMain(main)
    if (this.queue.length > 0) this.backgroundTimer = setInterval(this.pump, BACKGROUND_CHECK_MS)
    // One lane to begin with; the second once the file's header is in, so it reads that from the media cache.
    this.addLane()
  }

  /** Aspect ratio of the picture (16:9 until the file says). */
  get aspect(): number {
    const video = this.lanes[0]?.video
    const w = video?.videoWidth ?? 0
    const h = video?.videoHeight ?? 0
    return w > 0 && h > 0 ? w / h : 16 / 9
  }

  /** The film playing — background grabbing paces itself by it. */
  setMain(main: HTMLVideoElement | null): void {
    if (main === this.main) return
    this.main?.removeEventListener('waiting', this.onMainStall)
    this.main = main
    main?.addEventListener('waiting', this.onMainStall)
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** Fetch the frame for `time` (seconds into the file) once the pointer rests there, unless it's here or on its way. */
  request(time: number): void {
    if (this.failed) return
    const bucket = this.bucketOf(time)
    if (this.settleTimer) clearTimeout(this.settleTimer)
    this.settleTimer = null
    if (this.frames.has(bucket)) {
      this.wanted = null
      return
    }
    const fetching = this.lanes.find((l) => l.bucket === bucket)
    if (fetching) {
      // Already on its way for the background: the pointer's now, so it mustn't be taken over.
      fetching.background = false
      this.wanted = null
      return
    }
    this.wanted = bucket
    this.settleTimer = setTimeout(() => {
      this.settleTimer = null
      this.pump()
    }, SETTLE_MS)
  }

  /** The frame for `time`, or the nearest one grabbed close enough to stand in for it. */
  frameAt(time: number): { canvas: HTMLCanvasElement; exact: boolean } | null {
    const bucket = this.bucketOf(time)
    const exact = this.frames.get(bucket)
    if (exact) return { canvas: exact, exact: true }
    for (let d = 1; d <= this.standInBuckets; d++) {
      const near = this.frames.get(bucket - d) ?? this.frames.get(bucket + d)
      if (near) return { canvas: near, exact: false }
    }
    return null
  }

  destroy(): void {
    this.destroyed = true
    if (this.settleTimer) clearTimeout(this.settleTimer)
    if (this.backgroundTimer) clearInterval(this.backgroundTimer)
    this.setMain(null)
    this.listeners.clear()
    for (const lane of this.lanes) {
      if (lane.giveUp) clearTimeout(lane.giveUp)
      lane.video.removeAttribute('src')
      lane.video.load()
    }
    this.lanes.length = 0
    this.frames.clear()
  }

  private bucketOf(time: number): number {
    return Math.max(0, Math.floor(time / this.bucketS))
  }

  private emit(): void {
    this.listeners.forEach((l) => l())
  }

  private addLane(): void {
    const video = document.createElement('video') as HTMLVideoWithFastSeek
    video.muted = true
    video.playsInline = true
    video.preload = 'metadata'
    const lane: Lane = { video, bucket: null, background: false, giveUp: null }
    video.addEventListener('loadedmetadata', () => {
      if (this.destroyed) return
      if (this.lanes.length < LANES) this.addLane()
      this.pump()
    })
    video.addEventListener('seeked', () => this.onSeeked(lane))
    video.addEventListener('error', () => this.onLaneError(lane))
    video.src = this.url
    this.lanes.push(lane)
  }

  private isReady(lane: Lane): boolean {
    return lane.video.readyState >= HTMLMediaElement.HAVE_METADATA
  }

  private onMainStall = (): void => {
    this.lastStallAt = Date.now()
  }

  /** The film is far enough ahead, and steady enough, to spare the connection a background frame. */
  private backgroundAllowed(): boolean {
    const main = this.main
    if (!main || (typeof document !== 'undefined' && document.hidden)) return false
    if (Date.now() < this.nextBackgroundAt || Date.now() - this.lastStallAt < BACKGROUND_QUIET_AFTER_STALL_MS) return false
    if (main.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) return false
    return bufferedAhead(main) >= BACKGROUND_MIN_AHEAD_S
  }

  /**
   * A lane for the pointer's spot: a free one; else the one grabbing for the
   * background; else the one fetching a spot the pointer has since left —
   * the farthest from the new one, its frame being the least use as a
   * stand-in there.
   */
  private laneForPointer(bucket: number): Lane | null {
    const ready = this.lanes.filter((l) => this.isReady(l))
    const free = ready.find((l) => l.bucket === null)
    if (free) return free
    const background = ready.find((l) => l.background)
    if (background) {
      if (background.bucket !== null) this.queue.unshift(background.bucket)
      return background
    }
    let farthest: Lane | null = null
    for (const l of ready) {
      if (!farthest || Math.abs((l.bucket ?? 0) - bucket) > Math.abs((farthest.bucket ?? 0) - bucket)) farthest = l
    }
    return farthest
  }

  private seek(lane: Lane, bucket: number, background: boolean): void {
    lane.bucket = bucket
    lane.background = background
    if (lane.giveUp) clearTimeout(lane.giveUp)
    lane.giveUp = setTimeout(() => {
      lane.giveUp = null
      lane.bucket = null
      lane.background = false
      this.pump()
    }, SEEK_GIVE_UP_MS)
    // The middle of the bucket, kept clear of the very end
    const end = Number.isFinite(lane.video.duration) ? lane.video.duration : this.duration
    const time = Math.min(bucket * this.bucketS + this.bucketS / 2, Math.max(0, end - 0.5))
    // To the nearest keyframe where the browser can (Firefox, Safari): a thumbnail needn't be exact
    if (typeof lane.video.fastSeek === 'function') lane.video.fastSeek(time)
    else lane.video.currentTime = time
  }

  /** Put the lanes to work: the pointer's spot first, then the background queue. */
  private pump = (): void => {
    if (this.failed || this.destroyed) return

    const wanted = this.wanted
    if (wanted !== null) {
      if (this.frames.has(wanted) || this.lanes.some((l) => l.bucket === wanted)) {
        this.wanted = null
      } else {
        const lane = this.laneForPointer(wanted)
        if (lane) {
          this.wanted = null
          this.seek(lane, wanted, false)
        }
      }
    }

    if (this.queue.length === 0) {
      if (this.backgroundTimer) clearInterval(this.backgroundTimer)
      this.backgroundTimer = null
      return
    }
    // One background frame at a time, and none while the pointer waits for a lane.
    if (this.wanted !== null || this.lanes.some((l) => l.background)) return
    const free = this.lanes.find((l) => l.bucket === null && this.isReady(l))
    if (!free || !this.backgroundAllowed()) return
    while (this.queue.length > 0) {
      const bucket = this.queue.shift() as number
      if (this.frames.has(bucket) || this.lanes.some((l) => l.bucket === bucket)) continue
      this.seek(free, bucket, true)
      break
    }
  }

  private onSeeked(lane: Lane): void {
    // The end of a seek superseded by a later one: the frame isn't the one wanted now
    if (this.destroyed || lane.video.seeking) return
    if (lane.giveUp) clearTimeout(lane.giveUp)
    lane.giveUp = null
    const bucket = lane.bucket
    const background = lane.background
    lane.bucket = null
    lane.background = false
    const { videoWidth, videoHeight } = lane.video
    if (bucket !== null && videoWidth > 0 && videoHeight > 0) {
      const canvas = document.createElement('canvas')
      canvas.width = THUMB_PX
      canvas.height = Math.round((THUMB_PX * videoHeight) / videoWidth)
      try {
        canvas.getContext('2d')?.drawImage(lane.video, 0, 0, canvas.width, canvas.height)
        this.frames.set(bucket, canvas)
        if (this.frames.size > MAX_FRAMES) {
          const oldest = this.frames.keys().next().value
          if (oldest !== undefined) this.frames.delete(oldest)
        }
        this.emit()
      } catch {
        // A browser that won't draw this video — no previews, just the time.
        this.failed = true
        this.emit()
        return
      }
    }
    if (background) this.nextBackgroundAt = Date.now() + BACKGROUND_GAP_MS
    this.pump()
  }

  /** A lane that can't read the file is dropped; with none left, there are no previews. */
  private onLaneError(lane: Lane): void {
    if (this.destroyed) return
    if (lane.giveUp) clearTimeout(lane.giveUp)
    const index = this.lanes.indexOf(lane)
    if (index >= 0) this.lanes.splice(index, 1)
    if (lane.bucket !== null && !lane.background && this.wanted === null) this.wanted = lane.bucket
    if (this.lanes.length === 0) {
      this.failed = true
      this.emit()
      return
    }
    this.pump()
  }
}
