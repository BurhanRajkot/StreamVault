/**
 * Frames of one video file, grabbed on demand for the seek bar's previews
 * (see SeekPreview): a hidden, muted second <video> on the same link is
 * seeked to the spot asked for, and the frame drawn into a small canvas and
 * kept. Only the spot the pointer settles on is fetched — sweeping across
 * the bar costs one seek, not one per pixel, and a seek still on its way
 * for a spot the pointer has left is dropped for the new one — and frames
 * are cached by time bucket, so going back over the bar is instant.
 *
 * Measured on Real-Debrid links (2026-11-08): the first frame ~2-3s after
 * the file's header has loaded, later ones ~2-5s each (a seek has to fetch
 * from the keyframe before the spot).
 */

/** Frames kept per file — ~150 KB each at THUMB_PX wide. */
const MAX_FRAMES = 60
/** Width of a grabbed frame in pixels: sharp at the card's size on a 2× screen, small enough to keep many. */
const THUMB_PX = 256
/** A seek that hasn't landed by now is abandoned for whatever was asked for since. */
const SEEK_GIVE_UP_MS = 10_000
/** Nearest grabbed frame shown while the exact one loads — at most this many buckets away. */
const STAND_IN_BUCKETS = 3
/** The pointer has rested this long on a spot — fetch it. */
const SETTLE_MS = 80

/** Seconds of film one cached frame stands for. */
function bucketSeconds(duration: number): number {
  return Math.min(10, Math.max(2, Math.round(duration / 400)))
}

type HTMLVideoWithFastSeek = HTMLVideoElement & { fastSeek?: (time: number) => void }

/** Frames of one file, grabbed on demand. */
export class FrameGrabber {
  private readonly video: HTMLVideoWithFastSeek
  private readonly frames = new Map<number, HTMLCanvasElement>()
  private readonly listeners = new Set<() => void>()
  private readonly bucketS: number
  private readonly duration: number
  /** Bucket wanted next (latest request wins). */
  private wanted: number | null = null
  /** Bucket being fetched. */
  private inFlight: number | null = null
  private giveUpTimer: ReturnType<typeof setTimeout> | null = null
  private settleTimer: ReturnType<typeof setTimeout> | null = null
  /** The file can't be read here — no previews. */
  failed = false

  constructor(url: string, duration: number) {
    this.duration = duration
    this.bucketS = bucketSeconds(duration)
    const video = document.createElement('video') as HTMLVideoWithFastSeek
    video.muted = true
    video.playsInline = true
    video.preload = 'metadata'
    video.addEventListener('loadedmetadata', this.pump)
    video.addEventListener('seeked', this.onSeeked)
    video.addEventListener('error', this.onError)
    video.src = url
    this.video = video
  }

  /** Aspect ratio of the picture (16:9 until the file says). */
  get aspect(): number {
    const { videoWidth: w, videoHeight: h } = this.video
    return w > 0 && h > 0 ? w / h : 16 / 9
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
    if (this.frames.has(bucket) || this.inFlight === bucket) {
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
    for (let d = 1; d <= STAND_IN_BUCKETS; d++) {
      const near = this.frames.get(bucket - d) ?? this.frames.get(bucket + d)
      if (near) return { canvas: near, exact: false }
    }
    return null
  }

  destroy(): void {
    if (this.giveUpTimer) clearTimeout(this.giveUpTimer)
    if (this.settleTimer) clearTimeout(this.settleTimer)
    this.listeners.clear()
    this.video.removeEventListener('loadedmetadata', this.pump)
    this.video.removeEventListener('seeked', this.onSeeked)
    this.video.removeEventListener('error', this.onError)
    this.video.removeAttribute('src')
    this.video.load()
    this.frames.clear()
  }

  private bucketOf(time: number): number {
    return Math.max(0, Math.floor(time / this.bucketS))
  }

  private emit(): void {
    this.listeners.forEach((l) => l())
  }

  /** Seek to the wanted spot — dropping a seek still on its way for a spot the pointer has left. */
  private pump = (): void => {
    if (this.failed || this.wanted === null) return
    if (this.video.readyState < HTMLMediaElement.HAVE_METADATA) return // loadedmetadata pumps again
    const bucket = this.wanted
    this.wanted = null
    if (this.frames.has(bucket) || this.inFlight === bucket) return
    this.inFlight = bucket
    // The middle of the bucket, kept clear of the very end
    const end = Number.isFinite(this.video.duration) ? this.video.duration : this.duration
    const time = Math.min(bucket * this.bucketS + this.bucketS / 2, Math.max(0, end - 0.5))
    if (this.giveUpTimer) clearTimeout(this.giveUpTimer)
    this.giveUpTimer = setTimeout(() => {
      this.giveUpTimer = null
      this.inFlight = null
      this.pump()
    }, SEEK_GIVE_UP_MS)
    // To the nearest keyframe where the browser can (Firefox, Safari): a thumbnail needn't be exact
    if (typeof this.video.fastSeek === 'function') this.video.fastSeek(time)
    else this.video.currentTime = time
  }

  private onSeeked = (): void => {
    // The end of a seek superseded by a later one: the frame isn't the one wanted now
    if (this.video.seeking) return
    if (this.giveUpTimer) clearTimeout(this.giveUpTimer)
    this.giveUpTimer = null
    const bucket = this.inFlight
    this.inFlight = null
    const { videoWidth, videoHeight } = this.video
    if (bucket !== null && videoWidth > 0 && videoHeight > 0) {
      const canvas = document.createElement('canvas')
      canvas.width = THUMB_PX
      canvas.height = Math.round((THUMB_PX * videoHeight) / videoWidth)
      try {
        canvas.getContext('2d')?.drawImage(this.video, 0, 0, canvas.width, canvas.height)
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
    this.pump()
  }

  private onError = (): void => {
    this.failed = true
    this.emit()
  }
}
