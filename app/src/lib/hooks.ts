import { useEffect, useState, useSyncExternalStore } from 'react'
import { desktop, type WindowState } from '@app/native/platform'

/** Past `threshold` px of page scroll — for bars that turn to glass once content slides under them. */
export function useScrolled(threshold = 24): boolean {
  const [scrolled, setScrolled] = useState(() => typeof window !== 'undefined' && window.scrollY > threshold)
  useEffect(() => {
    let frame = 0
    const onScroll = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => setScrolled(window.scrollY > threshold))
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', onScroll)
    }
  }, [threshold])
  return scrolled
}

/** True while the reader scrolls down through content; false again on the way back up. */
export function useHideOnScroll(minY = 140): boolean {
  const [hidden, setHidden] = useState(false)
  useEffect(() => {
    let last = window.scrollY
    let frame = 0
    const onScroll = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const y = window.scrollY
        const delta = y - last
        if (Math.abs(delta) < 6) return
        setHidden(delta > 0 && y > minY)
        last = y
      })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', onScroll)
    }
  }, [minY])
  return hidden
}

function subscribeMedia(query: string) {
  return (fn: () => void) => {
    const mql = window.matchMedia(query)
    mql.addEventListener('change', fn)
    return () => mql.removeEventListener('change', fn)
  }
}

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(subscribeMedia(query), () => window.matchMedia(query).matches, () => false)
}

/** The wide (desktop window / tablet) layout rather than the phone one. */
export function useIsWide(): boolean {
  return useMediaQuery('(min-width: 1024px)')
}

/** A mouse (hover effects, arrows) rather than a finger. */
export function useFinePointer(): boolean {
  return useMediaQuery('(hover: hover) and (pointer: fine)')
}

/** The Linux window's maximized / fullscreen state. */
export function useWindowState(): WindowState {
  const [state, setState] = useState<WindowState>({ maximized: false, fullscreen: false })
  useEffect(() => {
    let live = true
    // Ask once (the window may already be maximized or full screen), then follow its changes
    desktop?.windowControl?.('state').then((s) => live && s && setState(s), () => {})
    const off = desktop?.onWindowState?.(setState)
    return () => {
      live = false
      off?.()
    }
  }, [])
  return state
}
