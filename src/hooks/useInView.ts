import { useEffect, useRef, useState } from 'react'

/**
 * useInView — fires once when the ref'd element scrolls into view.
 * After that the `isVisible` flag stays true forever (one-shot lazy load).
 *
 * @param rootMargin  How far before the element enters the viewport the
 *                    observer should fire. Default "200px" so sections
 *                    start fetching/rendering just before they are visible.
 */
export function useInView(rootMargin = '200px'): [React.RefObject<HTMLDivElement | null>, boolean] {
  const ref = useRef<HTMLDivElement | null>(null)
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    // Already visible (e.g. component re-mounted) — nothing to do
    if (isVisible) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setIsVisible(true)
          observer.disconnect()
        }
      },
      { rootMargin, threshold: 0 }
    )

    observer.observe(el)
    return () => observer.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rootMargin])

  return [ref, isVisible]
}
