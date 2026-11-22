import { useCallback, useSyncExternalStore } from 'react'

/**
 * Whether the F1 archive shows who won. Off until the viewer turns it on —
 * most people open a race to watch it, and the winner on the card would
 * spoil it. Remembered on this device (the app shares the key).
 */
const KEY = 'sv:f1-show-results'

const listeners = new Set<() => void>()
/** The choice made on this page — what counts when storage isn't there (a private window). */
let chosen: boolean | null = null

function read(): boolean {
  if (chosen !== null) return chosen
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useF1ShowResults(): [boolean, (show: boolean) => void] {
  const show = useSyncExternalStore(subscribe, read, () => false)
  const setShow = useCallback((next: boolean) => {
    chosen = next
    try {
      localStorage.setItem(KEY, next ? '1' : '0')
    } catch {
      /* kept for this visit only */
    }
    listeners.forEach((l) => l())
  }, [])
  return [show, setShow]
}
