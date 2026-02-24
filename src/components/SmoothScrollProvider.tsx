import { useEffect } from 'react'
import Lenis from '@studio-freight/lenis'

export function SmoothScrollProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // Initialize exactly the heavy, cinematic physics curve requested
    const lenis = new Lenis({
      duration: 1.4, // Long, weighty momentum carry
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)), // Aggressive ease out
      orientation: 'vertical',
      gestureOrientation: 'vertical',
      smoothWheel: true,
      wheelMultiplier: 1.1, // Adds a bit more mass to each wheel click
      syncTouch: false, // Let native OS handle direct touch tracking
      touchMultiplier: 2,
    })

    // Bind Lenis purely to the browser's hardware-accelerated drawing cycle
    function raf(time: number) {
      lenis.raf(time)
      requestAnimationFrame(raf)
    }

    requestAnimationFrame(raf)

    return () => {
      lenis.destroy()
    }
  }, [])

  return <>{children}</>
}
