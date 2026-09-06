import { useCallback, useEffect, useState } from 'react'

/** How much of a screenful an arrow press moves the row. */
const SCROLL_FRACTION = 0.75

/** Slack, in px, before an edge counts as "there is more to scroll this way". */
const EDGE_TOLERANCE = 10

/**
 * Tracks whether a horizontally-scrolling row can still scroll left or right,
 * so a carousel can show and hide its arrow affordances.
 *
 * Attach the returned `ref` to the scrolling element. It is a callback ref kept
 * in state rather than a `useRef`, because several of these rows only render
 * once their data arrives: a `useRef` would still be null on the render that
 * decides the arrows, and filling it in later would not re-run the
 * measurement. Storing the node in state means mounting it *is* the trigger.
 *
 * @param deps values that change the row's contents (re-measure when they do)
 */
export function useScrollArrows(deps: readonly unknown[] = []) {
  const [row, setRow] = useState<HTMLElement | null>(null)
  const [showLeftButton, setShowLeftButton] = useState(false)
  const [showRightButton, setShowRightButton] = useState(true)

  useEffect(() => {
    if (!row) return

    const measure = () => {
      setShowLeftButton(row.scrollLeft > EDGE_TOLERANCE)
      setShowRightButton(
        row.scrollLeft < row.scrollWidth - row.clientWidth - EDGE_TOLERANCE
      )
    }

    row.addEventListener('scroll', measure, { passive: true })

    // Observing the row covers the first measurement (the observer fires on
    // observe, once the row has been laid out) as well as every later reflow,
    // so no post-mount timeout is needed to catch the initial state.
    const observer = new ResizeObserver(measure)
    observer.observe(row)

    return () => {
      row.removeEventListener('scroll', measure)
      observer.disconnect()
    }
    // The caller decides what invalidates the measurement.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row, ...deps])

  /** Scroll the row by most of a screenful in either direction. */
  const scrollBy = useCallback(
    (direction: 'left' | 'right') => {
      if (!row) return
      const shift = row.clientWidth * SCROLL_FRACTION
      row.scrollBy({
        left: direction === 'left' ? -shift : shift,
        behavior: 'smooth',
      })
    },
    [row]
  )

  return { ref: setRow, showLeftButton, showRightButton, scrollBy }
}
