/**
 * Playing a Real-Debrid file through the StreamVault app (app/) — what makes
 * Premium in the app play like Sol, where the website can't.
 *
 * Real-Debrid's download servers send no CORS headers, so a web page can't
 * read a file's bytes: only hand its address to a <video>, which keeps ~10 s
 * loaded and stalls whenever the server goes quiet, and can't play the
 * Dolby/DTS audio most WEB-DLs carry (no browser decodes it). The app's own
 * process isn't a web page. It runs a small server on the device
 * (app/electron/rdStream.cjs on Linux, RdStreamServer.java on Android) that:
 *
 *   - relays the file (`fileUrl`): range requests answered from memory,
 *     the film loaded minutes ahead over several connections, and a
 *     connection that goes quiet dropped and asked again;
 *   - converts it (`convertUrl`): the audio turned into AAC by ffmpeg, the
 *     video copied as it is — so a Dolby file plays at its own quality,
 *     instead of through Real-Debrid's live conversion of the whole film.
 *
 * The app registers itself here (setLocalStreamProvider); on the website
 * there's no provider and nothing changes.
 */

export interface LocalStream {
  /** The file through the app: range requests, loaded minutes ahead. */
  fileUrl: string
  /** The file with its audio converted to AAC and the video copied — `?t=<seconds>` starts it there. Null when the app can't convert. */
  convertUrl: string | null
  /** Done with the file: the app lets go of what it loaded. */
  close(): void
}

export interface LocalStreamRequest {
  /** The file's links, best first (the nearest server's, then the one Real-Debrid gave). */
  urls: string[]
  size: number
  /** Seconds, when Real-Debrid said. */
  duration: number | null
  /** The audio track to convert, by its place among the file's audio tracks. */
  audioIndex: number
  /** Real-Debrid's name for the video codec ("h264", "hevc", ...), when known. */
  videoCodec: string | null
}

export interface LocalStreamProvider {
  /** The app can convert Dolby/DTS audio (it has ffmpeg) — not just relay the file. */
  readonly canConvert: boolean
  open(request: LocalStreamRequest): Promise<LocalStream | null>
}

/** Whether the app this runs in converts Dolby/DTS audio itself (false on the website). */
export function appConvertsAudio(): boolean {
  return !!provider?.canConvert && canFeedConverted(null)
}

let provider: LocalStreamProvider | null = null

/** Called by the app at startup; the website never does. */
export function setLocalStreamProvider(next: LocalStreamProvider | null): void {
  provider = next
}

export function localStreamProvider(): LocalStreamProvider | null {
  return provider
}

// ---------------------------------------------------------------------------
// The converted stream, fed to the <video> through Media Source Extensions
// ---------------------------------------------------------------------------

/** Loaded ahead of the playhead before the feed waits (the app goes on loading the file meanwhile). */
const MAX_AHEAD_S = 90
/** Kept behind the playhead, for a jump back; older is let go when memory runs short. */
const KEEP_BEHIND_S = 30
/** How often a waiting feed looks whether the playhead has moved on. */
const WAIT_STEP_MS = 500

/** Codec strings for the source buffer: the app always sends AAC audio, and the video as the file has it. */
function mimeFor(videoCodec: string | null): string {
  const video = videoCodec && /^(hevc|h265)$/i.test(videoCodec) ? 'hvc1.1.6.L150.B0' : 'avc1.640029'
  return `video/mp4; codecs="${video},mp4a.40.2"`
}

/** Whether this browser can play the converted stream of a file with this video codec. */
export function canFeedConverted(videoCodec: string | null): boolean {
  try {
    return typeof MediaSource !== 'undefined' && MediaSource.isTypeSupported(mimeFor(videoCodec))
  } catch {
    return false
  }
}

function withStart(url: string, at: number): string {
  const t = Math.max(0, Math.floor(at))
  return `${url}${url.includes('?') ? '&' : '?'}t=${t}`
}

function isAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError'
}

/**
 * Feeds `video` the app's converted stream. The stream carries the film's
 * own time (each restart says where it begins, `X-Start-Time`), so the
 * element's clock is the film's: a jump within what's loaded is an ordinary
 * seek, and what was loaded before a restart stays usable.
 */
export class ConvertedFeed {
  private readonly ms = new MediaSource()
  private readonly objectUrl: string
  private sb: SourceBuffer | null = null
  private readonly ready: Promise<void>
  private ctrl: AbortController | null = null
  /** Bumped by every (re)start: an older feed stops at its next step. */
  private generation = 0
  private destroyed = false

  constructor(
    private readonly video: HTMLVideoElement,
    private readonly opts: {
      url: string
      /** The film's length in seconds (0 when unknown). */
      duration: number
      videoCodec: string | null
      /** The stream can't be played (the app refused it, or the browser can't decode it). */
      onFatal: (reason: string) => void
    }
  ) {
    this.objectUrl = URL.createObjectURL(this.ms)
    this.ready = new Promise((resolve, reject) => {
      this.ms.addEventListener(
        'sourceopen',
        () => {
          try {
            this.sb = this.ms.addSourceBuffer(mimeFor(opts.videoCodec))
            if (opts.duration > 0) this.ms.duration = opts.duration
            resolve()
          } catch (err) {
            reject(err)
          }
        },
        { once: true }
      )
    })
    this.ready.catch(() => {})
    video.src = this.objectUrl
  }

  /** Whether the film is loaded at `time` (seconds). */
  covers(time: number): boolean {
    const { buffered } = this.video
    for (let i = 0; i < buffered.length; i++) {
      if (buffered.start(i) <= time + 0.05 && time < buffered.end(i) - 0.25) return true
    }
    return false
  }

  /** Where the loaded stretch the playhead is in ends (the playhead itself when it's in none). */
  loadedUntil(): number {
    const at = this.video.currentTime
    const { buffered } = this.video
    for (let i = 0; i < buffered.length; i++) {
      if (buffered.start(i) <= at + 0.05 && at <= buffered.end(i)) return buffered.end(i)
    }
    return at
  }

  /** Jump to `time`: within what's loaded, as is; anywhere else, the app starts converting there. */
  seek(time: number): void {
    const target = Math.max(0, time)
    this.video.currentTime = target
    if (!this.covers(target)) void this.start(target)
  }

  /** (Re)start the stream at `at` seconds into the film. */
  async start(at: number): Promise<void> {
    const generation = ++this.generation
    this.ctrl?.abort()
    const ctrl = (this.ctrl = new AbortController())
    const live = () => generation === this.generation && !this.destroyed
    try {
      await this.ready
      if (!live()) return
      if (at > 0 && Math.abs(this.video.currentTime - at) > 0.5) this.video.currentTime = at
      const res = await fetch(withStart(this.opts.url, at), { signal: ctrl.signal, cache: 'no-store' })
      if (!res.ok || !res.body) throw new Error(`the app answered ${res.status}`)
      const startTime = Number(res.headers.get('X-Start-Time'))
      if (!live()) return
      await this.idle()
      const sb = this.sourceBuffer()
      // A new stream: drop whatever of the last one was half-read, and place it at the film's time.
      if (this.ms.readyState === 'open') sb.abort()
      sb.timestampOffset = Number.isFinite(startTime) && startTime >= 0 ? startTime : at
      const reader = res.body.getReader()
      for (;;) {
        while (live() && this.loadedUntil() - this.video.currentTime > MAX_AHEAD_S) await sleep(WAIT_STEP_MS)
        const { done, value } = await reader.read()
        if (!live()) {
          void reader.cancel().catch(() => {})
          return
        }
        if (done) break
        await this.append(value)
      }
      // The end of the film: without this the element waits for more at the last frame.
      if (live() && this.ms.readyState === 'open') {
        await this.idle()
        this.ms.endOfStream()
      }
    } catch (err) {
      if (!live() || isAbort(err)) return
      this.opts.onFatal(err instanceof Error ? err.message : String(err))
    }
  }

  destroy(): void {
    this.destroyed = true
    this.generation++
    this.ctrl?.abort()
    URL.revokeObjectURL(this.objectUrl)
  }

  private sourceBuffer(): SourceBuffer {
    if (!this.sb) throw new Error('no source buffer')
    return this.sb
  }

  private idle(): Promise<void> {
    const sb = this.sourceBuffer()
    if (!sb.updating) return Promise.resolve()
    return new Promise((resolve) => sb.addEventListener('updateend', () => resolve(), { once: true }))
  }

  /** Append, making room first when the browser says its media memory is full. */
  private async append(data: Uint8Array): Promise<void> {
    const sb = this.sourceBuffer()
    for (let attempt = 0; ; attempt++) {
      await this.idle()
      try {
        // Reopens a stream that was ended (a jump back after the end).
        sb.appendBuffer(data as BufferSource)
        await this.idle()
        return
      } catch (err) {
        if (!(err instanceof DOMException && err.name === 'QuotaExceededError') || attempt >= 3) throw err
        await this.trim()
      }
    }
  }

  /** Let go of what's well behind the playhead, then of what's far beyond what's needed ahead. */
  private async trim(): Promise<void> {
    const sb = this.sourceBuffer()
    const at = this.video.currentTime
    const behind = at - KEEP_BEHIND_S
    await this.idle()
    if (behind > 0) {
      sb.remove(0, behind)
      await this.idle()
    }
    const far = at + MAX_AHEAD_S + 30
    if (this.video.buffered.length && this.video.buffered.end(this.video.buffered.length - 1) > far) {
      sb.remove(far, Infinity)
      await this.idle()
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
