/**
 * Seek-bar previews: a frame of the film over the spot the pointer is on
 * (or the thumb being dragged), the way streaming apps show it.
 *
 * Nothing pre-renders thumbnails for a Real-Debrid file, so they're grabbed
 * from the file itself (lib/frameGrabber): across the whole film in the
 * background while it plays (with a mouse), and the spot pointed at on
 * demand. A seek on a Real-Debrid link takes ~1-2s, so while one is on its
 * way the nearest frame already grabbed stands in, dimmed, or a spinner.
 *
 * Nothing loads until playback is under way, or — on a touch screen — the
 * viewer first scrubs (hooks/useFrameGrabber).
 */

import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'
import { formatPlayerTime } from '@/lib/playbackPosition'
import type { FrameGrabber } from '@/lib/frameGrabber'

interface SeekPreviewProps {
  grabber: FrameGrabber | null
  /** Redraw trigger from useFrameGrabber. */
  version: number
  /** Seconds into the file. */
  time: number
  /** Where the card is centred, in px from the bar's left edge. */
  x: number
  /** The bar's width, to keep the card inside it. */
  barWidth: number
  compact?: boolean
}

/** The card above the seek bar: a frame (when the file allows) over the time. */
export function SeekPreview({ grabber, version, time, x, barWidth, compact }: SeekPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const frames = grabber && !grabber.failed ? grabber : null
  const frame = frames?.frameAt(time) ?? null
  // Sized by height, so a 2.39:1 film gets a wider card rather than a sliver
  const aspect = frames?.aspect ?? 16 / 9
  const maxWidth = compact ? 190 : 260
  const width = Math.min(Math.round((compact ? 81 : 108) * aspect), maxWidth)
  const height = Math.round(width / aspect)

  useEffect(() => {
    frames?.request(time)
  }, [frames, time])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !frame) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = Math.round(width * dpr)
    canvas.height = Math.round(height * dpr)
    canvas.getContext('2d')?.drawImage(frame.canvas, 0, 0, canvas.width, canvas.height)
  }, [frame, version, width, height])

  // Centred on the pointer, but never past either end of the bar
  const half = Math.max(frames ? width : 0, 56) / 2
  const left = barWidth > 2 * half ? Math.min(Math.max(x, half), barWidth - half) : barWidth / 2

  return (
    <div
      aria-hidden="true"
      data-testid="seek-preview"
      className="pointer-events-none absolute bottom-full mb-2 flex -translate-x-1/2 flex-col items-center gap-1.5"
      style={{ left }}
    >
      {frames && (
        <div
          className="relative overflow-hidden rounded-md bg-neutral-900 shadow-[0_8px_30px_rgba(0,0,0,0.6)] ring-1 ring-white/25"
          style={{ width, height }}
        >
          <canvas
            ref={canvasRef}
            data-testid="seek-preview-frame"
            data-ready={frame?.exact || undefined}
            className={cn('h-full w-full transition-opacity duration-150', frame ? (frame.exact ? 'opacity-100' : 'opacity-60') : 'opacity-0')}
          />
          {!frame?.exact && (
            <span className="absolute inset-0 flex items-center justify-center">
              <span className="player-spinner !h-5 !w-5 !border-2" />
            </span>
          )}
        </div>
      )}
      <span className="rounded-md bg-black/85 px-2 py-0.5 text-xs font-semibold tabular-nums text-white shadow">
        {formatPlayerTime(time)}
      </span>
    </div>
  )
}
