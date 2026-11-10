import { useEffect, useState } from 'react'
import { FrameGrabber } from '@/lib/frameGrabber'

interface FrameGrabberHookOptions {
  /** The film playing: background grabbing paces itself by how well it's buffered. */
  main?: HTMLVideoElement | null
  /** Grab frames across the film ahead of the pointer (see FrameGrabber). */
  background?: boolean
}

/**
 * The grabber for `url` once `active` has been true (playback is under way,
 * or the viewer has pointed at the seek bar), kept for the life of the file;
 * and a counter that moves whenever a frame lands, to redraw on.
 */
export function useFrameGrabber(
  url: string | null | undefined,
  duration: number,
  active: boolean,
  { main = null, background = false }: FrameGrabberHookOptions = {}
) {
  const [entry, setEntry] = useState<{ url: string; grabber: FrameGrabber } | null>(null)
  const [version, setVersion] = useState(0)
  const current = entry && entry.url === url ? entry : null

  // Created on first use and kept for the file: the cache is the point.
  useEffect(() => {
    if (current || !url || !(duration > 0) || !active || typeof document === 'undefined') return
    setEntry({ url, grabber: new FrameGrabber(url, duration, { main, background }) })
    // `main` is handed over below; a new element mustn't throw the cache away.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, url, duration, active, background])

  useEffect(() => {
    current?.grabber.setMain(main)
  }, [current, main])

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
