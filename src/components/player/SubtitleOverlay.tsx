/**
 * SubtitleOverlay — draws the Premium player's subtitles over the picture.
 *
 * Drawn by us rather than by a <track>, because the converted stream's
 * element clock starts wherever the stream last restarted (`offset`), and
 * because our controls need the text lifted clear of them while they're up.
 * The cues follow the picture frame by frame while it plays.
 *
 * Picture-in-picture and iPhone's own fullscreen player show the <video>
 * alone, without anything drawn over it, so the same cues are mirrored into
 * a native text track that's shown only then.
 */

import { useEffect, useState, type CSSProperties } from 'react'
import { activeCues, type SubtitleCue, type SubtitleSize, type SubtitleTrack } from '@/lib/subtitles'
import { cn } from '@/lib/utils'

interface SubtitleOverlayProps {
  video: HTMLVideoElement | null
  track: SubtitleTrack | null
  /** Seconds into the film at the element's time 0. */
  offset: number
  /** Seconds added to every cue. */
  delay: number
  size: SubtitleSize
  /** OpenSubtitles language code, for the native track. */
  language: string | null
  /** The controls are up — the text moves clear of them. */
  lifted: boolean
  /** The short-picture control layout (a portrait phone). */
  compact: boolean
}

/**
 * Scales with the picture's shorter side (container query units), within
 * readable bounds — its height on a wide screen, its width on a tall one.
 */
const FONT_SIZE: Record<SubtitleSize, string> = {
  s: 'clamp(12px, 3.7cqmin, 40px)',
  m: 'clamp(14px, 4.6cqmin, 52px)',
  l: 'clamp(16px, 5.8cqmin, 64px)',
}

/**
 * Black bands this tall above and below the picture (an upright phone) leave
 * the controls room of their own: the subtitles then sit on the picture
 * itself rather than down at the bottom of the screen.
 */
const PICTURE_ANCHOR_MIN_BAND_PX = 96

/** An outline of soft shadows: readable on a white frame without a box over the picture. */
const TEXT_STYLE: CSSProperties = {
  textShadow: '0 0 2px #000, 0 0 3px #000, 0 0 6px rgba(0,0,0,0.85), 0 2px 3px rgba(0,0,0,0.9)',
  textWrap: 'balance',
}

function sameCues(a: SubtitleCue[], b: SubtitleCue[]): boolean {
  return a.length === b.length && a.every((cue, i) => cue === b[i])
}

export function SubtitleOverlay({ video, track, offset, delay, size, language, lifted, compact }: SubtitleOverlayProps) {
  const [active, setActive] = useState<SubtitleCue[]>([])
  const [frameEl, setFrameEl] = useState<HTMLDivElement | null>(null)
  const picture = usePictureBox(frameEl, video)

  useEffect(() => {
    if (!video || !track || track.cues.length === 0) {
      setActive([])
      return
    }
    let frame = 0
    // Unknown at first: what's on screen came from the last file/timing, so
    // the first update always lands — even when it's "nothing".
    let shown: SubtitleCue[] | null = null
    const update = () => {
      const next = activeCues(track, offset + video.currentTime - delay)
      if (!shown || !sameCues(next, shown)) {
        shown = next
        setActive(next)
      }
    }
    const loop = () => {
      update()
      frame = requestAnimationFrame(loop)
    }
    const start = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(loop)
    }
    const stop = () => {
      cancelAnimationFrame(frame)
      update()
    }
    video.addEventListener('playing', start)
    video.addEventListener('pause', stop)
    video.addEventListener('ended', stop)
    video.addEventListener('waiting', stop)
    // Paused and seeking: the spot moves without frames playing.
    video.addEventListener('seeked', update)
    video.addEventListener('timeupdate', update)
    if (!video.paused && video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) start()
    else update()
    return () => {
      cancelAnimationFrame(frame)
      video.removeEventListener('playing', start)
      video.removeEventListener('pause', stop)
      video.removeEventListener('ended', stop)
      video.removeEventListener('waiting', stop)
      video.removeEventListener('seeked', update)
      video.removeEventListener('timeupdate', update)
    }
  }, [video, track, offset, delay])

  useNativeTrackMirror(video, track, offset, delay, language)

  const bottom = active.filter((c) => !c.top)
  const top = active.filter((c) => c.top)
  // On the picture itself, the controls are elsewhere: nothing to move out of the way of.
  const raised = lifted && !picture
  const topPlace = raised ? (compact ? 'top-14' : 'top-[calc(5rem+env(safe-area-inset-top,0px))]') : 'top-[6%]'
  const bottomPlace = picture
    ? 'bottom-[5%]'
    : raised
      ? compact
        ? 'bottom-[4.5rem]'
        : 'bottom-[calc(6.25rem+env(safe-area-inset-bottom,0px))]'
      : compact
        ? 'bottom-3'
        : 'bottom-[calc(6%+env(safe-area-inset-bottom,0px))]'

  return (
    <div ref={setFrameEl} aria-hidden="true" className="pointer-events-none absolute inset-0">
      {active.length > 0 && (
        <div
          className="absolute inset-x-0 [container-type:size]"
          style={picture ? { top: picture.top, height: picture.height } : { top: 0, bottom: 0 }}
          data-testid="player-subtitles"
        >
          {top.length > 0 && <CueBlock cues={top} size={size} className={cn('transition-[top] duration-300', topPlace)} />}
          {bottom.length > 0 && (
            <CueBlock cues={bottom} size={size} className={cn('transition-[bottom] duration-300', bottomPlace)} />
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Where the picture sits in the player when black bands above and below it
 * are tall enough for the controls (see PICTURE_ANCHOR_MIN_BAND_PX); null
 * when the picture fills the player, or near enough.
 */
function usePictureBox(frame: HTMLDivElement | null, video: HTMLVideoElement | null): { top: number; height: number } | null {
  const [size, setSize] = useState<{ width: number; height: number } | null>(null)
  const [aspect, setAspect] = useState(0)

  useEffect(() => {
    if (!frame || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }))
    observer.observe(frame)
    return () => observer.disconnect()
  }, [frame])

  useEffect(() => {
    if (!video) return
    const read = () => setAspect(video.videoWidth > 0 && video.videoHeight > 0 ? video.videoWidth / video.videoHeight : 0)
    read()
    video.addEventListener('loadedmetadata', read)
    video.addEventListener('resize', read)
    return () => {
      video.removeEventListener('loadedmetadata', read)
      video.removeEventListener('resize', read)
    }
  }, [video])

  if (!size || !aspect || video?.style.objectFit === 'cover') return null
  const height = size.width / aspect
  const band = (size.height - height) / 2
  return band >= PICTURE_ANCHOR_MIN_BAND_PX ? { top: band, height } : null
}

function CueBlock({ cues, size, className }: { cues: SubtitleCue[]; size: SubtitleSize; className?: string }) {
  return (
    <div className={cn('absolute inset-x-0 flex justify-center px-[5%]', className)}>
      <p
        className="max-w-[min(90%,60rem)] text-center font-medium leading-[1.22] text-white"
        style={{ ...TEXT_STYLE, fontSize: FONT_SIZE[size] }}
      >
        {cues.map((cue, c) =>
          cue.lines.map((line, l) => (
            <span key={`${c}:${cue.start}:${l}`} className="block">
              {line.map((segment, s) =>
                segment.italic ? (
                  <i key={s}>{segment.text}</i>
                ) : (
                  <span key={s}>{segment.text}</span>
                )
              )}
            </span>
          ))
        )}
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Native track — picture-in-picture and iPhone's fullscreen player
// ---------------------------------------------------------------------------

type PresentationVideo = HTMLVideoElement & {
  webkitPresentationMode?: string
  webkitDisplayingFullscreen?: boolean
}

/** A text track can't be removed from its element once added: one per element, reused. */
const nativeTracks = new WeakMap<HTMLVideoElement, TextTrack>()

function escapeCueText(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function useNativeTrackMirror(
  video: HTMLVideoElement | null,
  track: SubtitleTrack | null,
  offset: number,
  delay: number,
  language: string | null
) {
  useEffect(() => {
    if (!video || typeof video.addTextTrack !== 'function' || typeof VTTCue === 'undefined') return
    let native = nativeTracks.get(video)
    if (!track) {
      if (native) native.mode = 'disabled'
      return
    }
    if (!native) {
      native = video.addTextTrack('subtitles', 'Subtitles', language ?? 'en')
      nativeTracks.set(video, native)
    }
    const text = native
    // Clear the last file's (or the last timing's) cues.
    text.mode = 'hidden'
    for (const cue of Array.from(text.cues ?? [])) text.removeCue(cue)
    for (const cue of track.cues) {
      const start = cue.start - offset + delay
      const end = cue.end - offset + delay
      if (end <= 0) continue
      const body = cue.lines
        .map((line) => line.map((s) => (s.italic ? `<i>${escapeCueText(s.text)}</i>` : escapeCueText(s.text))).join(''))
        .join('\n')
      const vtt = new VTTCue(Math.max(0, start), end, body)
      if (cue.top) vtt.line = 1
      text.addCue(vtt)
    }

    const v = video as PresentationVideo
    const sync = () => {
      const outside =
        document.pictureInPictureElement === video ||
        v.webkitPresentationMode === 'picture-in-picture' ||
        v.webkitPresentationMode === 'fullscreen' ||
        v.webkitDisplayingFullscreen === true
      text.mode = outside ? 'showing' : 'hidden'
    }
    const events = ['enterpictureinpicture', 'leavepictureinpicture', 'webkitpresentationmodechanged', 'webkitbeginfullscreen', 'webkitendfullscreen']
    events.forEach((e) => video.addEventListener(e, sync))
    sync()
    return () => {
      events.forEach((e) => video.removeEventListener(e, sync))
      text.mode = 'disabled'
    }
  }, [video, track, offset, delay, language])
}
