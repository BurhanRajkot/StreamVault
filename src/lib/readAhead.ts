/**
 * Loading a Real-Debrid file further ahead than the browser does by itself.
 *
 * A `<video>` playing a plain file keeps only ~10 seconds loaded ahead
 * (Chrome sizes that from the file's bitrate), and a Real-Debrid server
 * now and then goes quiet for longer than that: a slow answer on a new
 * connection, a connection that sits for 15-25 s (see DebridVideo). Then
 * the film stalls, where Sol, streaming HLS with a buffer of a minute or
 * more, plays on. The file can't be loaded into a buffer of our own — its
 * server sends no CORS headers, so a page can't read its bytes — but
 * Chromium keeps the media a page loads in one cache per address, shared
 * by every media element on it. So a few hidden, muted elements on the
 * same link, each held some way ahead of the playhead, keep that stretch
 * of the film loaded for the one on screen.
 *
 * Measured against a stand-in server with Real-Debrid's measured behaviour
 * (connections that answer slowly or sit, `Connection: close`), a 12
 * Mbit/s 1080p file: see the numbers in the commit that added this.
 *
 * The helpers are `<audio>` elements: they load the same bytes — the
 * cache is the file's, not a track's — without decoding a single picture,
 * so jumping them along costs next to nothing and takes no video decoder
 * from the film (a phone has only a few). A file whose audio this browser
 * can't decode makes an `<audio>` element give up, so that helper becomes
 * a `<video>` instead.
 *
 * Only in Chromium (Chrome, Edge, Android, the desktop app): elsewhere the
 * cache isn't shared, and the helpers would only load the file twice.
 */

/** Where each helper is held, in seconds ahead of the playhead — each keeps ~10-20 s loaded from there. */
const LEADS_S = [15, 35]
/** On a device with little memory, one helper: every one keeps 25 MB or more of the file in memory. */
const LOW_MEMORY_LEADS_S = [15]
const LOW_MEMORY_GB = 2
/** How often the helpers are moved along. */
const TICK_MS = 1000
/** A helper this many seconds short of its place is moved up (each move costs a seek, so not every tick). */
const MOVE_AFTER_S = 4
/** ...or this far past it (the viewer jumped back). */
const MOVE_BACK_AFTER_S = 30
/**
 * The film itself has less than this loaded ahead: it's starting (Chrome
 * keeps only 2-3 s for its first ~20 s), catching up after a jump or
 * loading slowly — the helpers wait, so as not to take the connection from
 * it.
 */
const MAIN_AHEAD_MIN_S = 10
/**
 * A helper with this much loaded ahead of it has filled its stretch: the
 * next one may start on its own. One at a time, because filling them is the
 * only time they add to what the film itself needs — after that only the
 * one furthest ahead loads anything, at the film's own pace (the others
 * find their stretch already loaded). Filled all at once, on a line with
 * little to spare, they stalled the film they were there to protect
 * (measured: four early stalls on a 20 Mbit/s line, 12 Mbit/s file).
 */
const HELPER_FILLED_S = 8

/** Whether this browser shares loaded media between elements on one address (Chromium does). */
export function sharesMediaCache(nav: Navigator | undefined = typeof navigator === 'undefined' ? undefined : navigator): boolean {
  if (!nav) return false
  const brands = (nav as Navigator & { userAgentData?: { brands?: { brand: string }[] } }).userAgentData?.brands
  if (brands?.length) return brands.some((b) => b.brand === 'Chromium')
  // iOS browsers are all WebKit, whatever they're called.
  return /\b(Chrome|Chromium)\//.test(nav.userAgent) && !/\b(CriOS|EdgiOS|FxiOS)\//.test(nav.userAgent)
}

/** Seconds loaded ahead of where `el` is playing. */
function bufferedAhead(el: HTMLMediaElement): number {
  const at = el.currentTime
  for (let i = 0; i < el.buffered.length; i++) {
    if (el.buffered.start(i) <= at + 0.1 && el.buffered.end(i) >= at) return el.buffered.end(i) - at
  }
  return 0
}

interface Helper {
  el: HTMLMediaElement
  lead: number
  /** An `<audio>` that gave up is replaced by a `<video>`; a `<video>` that gives up is dropped. */
  failed: boolean
}

export class ReadAhead {
  private readonly leads: number[]
  private helpers: Helper[] = []
  private timer: ReturnType<typeof setInterval> | null = null
  private destroyed = false

  /**
   * Starts at once, but the helpers only come once `main` has a few seconds
   * loaded (MAIN_AHEAD_MIN_S). Call `destroy` when the file goes.
   */
  constructor(
    private readonly url: string,
    private readonly main: HTMLVideoElement
  ) {
    const memoryGb = (navigator as Navigator & { deviceMemory?: number }).deviceMemory
    this.leads = memoryGb !== undefined && memoryGb <= LOW_MEMORY_GB ? LOW_MEMORY_LEADS_S : LEADS_S
    this.timer = setInterval(() => this.tick(), TICK_MS)
  }

  destroy(): void {
    this.destroyed = true
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    for (const h of this.helpers) this.release(h.el)
    this.helpers = []
  }

  /** Move the helpers along — every TICK_MS by itself; called directly by tests. */
  tick(): void {
    const main = this.main
    // A hidden tab isn't loading the film either; a paused film keeps what's loaded.
    if (document.hidden || main.readyState < HTMLMediaElement.HAVE_METADATA || !Number.isFinite(main.duration)) return
    if (main.seeking || bufferedAhead(main) < MAIN_AHEAD_MIN_S) return
    // Nearest first; a helper still getting to its place, or still filling
    // its stretch, holds back the ones after it.
    for (const h of this.helpers) {
      if (h.failed) continue
      if (h.el.seeking || h.el.readyState < HTMLMediaElement.HAVE_METADATA) return
      const target = Math.min(main.currentTime + h.lead, main.duration - 1)
      const behind = target - h.el.currentTime
      if (behind > MOVE_AFTER_S || -behind > MOVE_BACK_AFTER_S) {
        h.el.currentTime = target
        return
      }
      if (bufferedAhead(h.el) < HELPER_FILLED_S && h.el.currentTime < main.duration - HELPER_FILLED_S) return
    }
    const next = this.leads[this.helpers.length]
    if (next !== undefined) this.helpers.push({ el: this.create('audio'), lead: next, failed: false })
  }

  private create(kind: 'audio' | 'video'): HTMLMediaElement {
    const el = document.createElement(kind)
    el.muted = true
    el.preload = 'auto'
    if (el instanceof HTMLVideoElement) el.playsInline = true
    el.addEventListener('error', () => this.onError(el, kind), { once: true })
    el.src = this.url
    return el
  }

  private onError(el: HTMLMediaElement, kind: 'audio' | 'video'): void {
    const helper = this.helpers.find((h) => h.el === el)
    if (!helper || this.destroyed) return
    this.release(el)
    if (kind === 'audio') {
      helper.el = this.create('video')
    } else {
      helper.failed = true
    }
  }

  private release(el: HTMLMediaElement): void {
    el.removeAttribute('src')
    el.load()
  }
}
