/**
 * SubtitleOverlay — draws the cue on screen for DebridVideo.
 *
 * Our own renderer, not a <track>: cue times are seconds into the *file*,
 * but Real-Debrid's converted stream starts mid-file, so the element's clock
 * runs `offset` seconds behind — which native cues can't follow. Rendering
 * ourselves also keeps the text identical in every mode and browser.
 *
 * Sits under the controls (z-10 vs their z-20): the text shows through the
 * idle player, and the control bar paints over it while it's up.
 */

import { useEffect, useState } from 'react'
import { cueTextAt, type SubtitleCue } from '@/lib/subtitles'

interface SubtitleOverlayProps {
  video: HTMLVideoElement
  /** Sorted cues, in seconds into the file. */
  cues: SubtitleCue[]
  /** Seconds into the file at the element's time 0 (the converted stream's start). */
  offset: number
}

export function SubtitleOverlay({ video, cues, offset }: SubtitleOverlayProps) {
  const [text, setText] = useState<string | null>(null)

  // Polled on frames rather than on `timeupdate`, which fires only ~4 times a
  // second — enough to show a line a noticeable beat late.
  useEffect(() => {
    let frame = 0
    let last: string | null = null
    const tick = () => {
      const next = cueTextAt(cues, offset + video.currentTime)
      if (next !== last) {
        last = next
        setText(next)
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [video, cues, offset])

  if (!text) return null

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-[max(5%,env(safe-area-inset-bottom,0px))] z-10 flex justify-center px-6">
      <span
        data-testid="subtitle-cue"
        className="max-w-full whitespace-pre-line rounded-md bg-black/55 px-3 py-1 text-center text-[clamp(0.95rem,2.2vw,1.6rem)] font-medium leading-snug text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.9)]"
      >
        {text}
      </span>
    </div>
  )
}
