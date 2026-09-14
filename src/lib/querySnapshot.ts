/**
 * Last-known-good snapshots of homepage rows in localStorage.
 *
 * Continue Watching and recommendations each sit behind an Auth0 token fetch
 * plus one or two backend round trips, so on a fresh page load they used to
 * render as empty skeletons for seconds. Seeding React Query's
 * `placeholderData` from the previous visit's snapshot paints them instantly
 * while the real request revalidates in the background.
 *
 * Snapshots are keyed per account (Auth0 `sub`, or "guest") so one user never
 * sees another's rows. Every storage access is guarded — private mode, quota
 * errors or corrupt JSON just mean "no snapshot".
 */

const PREFIX = 'sv:snapshot:'

/** Snapshots older than this are ignored rather than shown. */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

interface StoredSnapshot<T> {
  savedAt: number
  value: T
}

export function readSnapshot<T>(key: string): T | undefined {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    if (!raw) return undefined
    const stored = JSON.parse(raw) as StoredSnapshot<T>
    if (typeof stored?.savedAt !== 'number' || Date.now() - stored.savedAt > MAX_AGE_MS) {
      return undefined
    }
    return stored.value
  } catch {
    return undefined
  }
}

export function writeSnapshot<T>(key: string, value: T): void {
  try {
    const stored: StoredSnapshot<T> = { savedAt: Date.now(), value }
    localStorage.setItem(PREFIX + key, JSON.stringify(stored))
  } catch {
    // Quota exceeded or storage unavailable — the snapshot is only an optimization.
  }
}
