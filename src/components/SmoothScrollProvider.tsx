import React, { useEffect } from 'react'
import Lenis from '@studio-freight/lenis'

export function SmoothScrollProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // Skip Lenis on mobile — native momentum scroll is already smooth
    // and running a RAF loop on mobile drains battery and adds jank
    const isMobile = window.matchMedia('(max-width: 768px)').matches ||
      ('ontouchstart' in window && navigator.maxTouchPoints > 1)

    if (isMobile) return

    const lenis = new Lenis({
      duration: 1.2,         // Slightly snappier than 1.4 — feels more responsive
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      orientation: 'vertical',
      gestureOrientation: 'vertical',
      smoothWheel: true,
      wheelMultiplier: 1.0,  // Reduced from 1.1 — less over-scroll
      syncTouch: false,
      touchMultiplier: 2,
    })

    let rafId: number

    function raf(time: number) {
      lenis.raf(time)
      rafId = requestAnimationFrame(raf)
    }

    rafId = requestAnimationFrame(raf)

    // Pause when tab hidden — saves CPU/GPU when user switches tabs
    const handleVisibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(rafId)
      } else {
        rafId = requestAnimationFrame(raf)
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      cancelAnimationFrame(rafId)
      document.removeEventListener('visibilitychange', handleVisibility)
      lenis.destroy()
    }
  }, [])

  return <>{children}</>
}
