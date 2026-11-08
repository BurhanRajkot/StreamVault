import { useEffect, useState } from 'react'
import { FrameGrabber } from '@/lib/frameGrabber'

/**
 * The grabber for `url` once `active` has been true (the viewer has pointed
 * at the seek bar), kept for the life of the file; and a counter that moves
 * whenever a frame lands, to redraw on.
 */
export function useFrameGrabber(url: string | null | undefined, duration: number, active: boolean) {
  const [entry, setEntry] = useState<{ url: string; grabber: FrameGrabber } | null>(null)
  const [version, setVersion] = useState(0)
  const current = entry && entry.url === url ? entry : null

  // Created on first use and kept for the file: the cache is the point.
  useEffect(() => {
    if (current || !url || !(duration > 0) || !active || typeof document === 'undefined') return
    setEntry({ url, grabber: new FrameGrabber(url, duration) })
  }, [current, url, duration, active])

  useEffect(() => {
    if (!entry) return
    const unsubscribe = entry.grabber.subscribe(() => setVersion((v) => v + 1))
    return () => {
      unsubscribe()
      entry.grabber.destroy()
    }
  }, [entry])

  return { grabber: current?.grabber ?? null, version }
}
