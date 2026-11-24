import { useEffect, useRef } from 'react'

/**
 * Marks an element `data-in` the first time it scrolls into view, so CSS can
 * bring it in (`.reveal` in app.css). Set on the element itself rather than
 * through React state: revealing re-renders nothing, and once in, it stays.
 * Without IntersectionObserver it's in at once — content is never left hidden.
 */
export function useReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  useEffect(() => {
    const el = ref.current
    if (!el || el.dataset.in !== undefined) return
    if (typeof IntersectionObserver === 'undefined') {
      el.dataset.in = ''
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          el.dataset.in = ''
          observer.disconnect()
        }
      },
      // A little before it's fully on screen, so a fast scroll never meets an empty row
      { rootMargin: '0px 0px 8% 0px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return ref
}

/** The system asks for less motion (Settings → Accessibility). */
export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}
