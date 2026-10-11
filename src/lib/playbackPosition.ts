/**
 * Exact resume points for the Real-Debrid player, in localStorage.
 *
 * Continue Watching on the backend only stores a 0-1 fraction (embed
 * providers never report real time), which can't restore a viewer to the
 * second they stopped at. This does, per title/episode, on this browser.
 *
 * Every storage access is guarded — private mode or a full quota just means
 * "no resume point".
 */

const PREFIX = 'sv:resume:'

/** Before this many seconds there is nothing worth resuming. */
export const MIN_RESUME_S = 30

/**
 * Past 95%, or into the last two minutes (the credits) of anything long
 * enough to have them, the title counts as finished.
 */
const FINISHED_TAIL_S = 120
const FINISHED_FRACTION = 0.95
/** Shorter than this, the tail rule would swallow most of the video. */
const TAIL_RULE_MIN_DURATION_S = 20 * 60

/** Resume points older than this are dropped rather than offered. */
const MAX_AGE_MS = 60 * 24 * 60 * 60 * 1000

/** Cap on stored resume points; the oldest go first. */
const MAX_ENTRIES = 200

interface StoredPosition {
  /** Seconds */
  t: number
  /** Duration, seconds */
  d: number
  /** Saved at, epoch ms */
  at: number
}

/** Storage key for one title, or one episode of a series. */
export function resumeKey(id: string, season?: number, episode?: number): string {
  return season !== undefined && episode !== undefined ? `${id}:s${season}e${episode}` : id
}

export function isFinished(position: number, duration: number): boolean {
  if (!(duration > 0)) return false
  if (position >= duration * FINISHED_FRACTION) return true
  return duration >= TAIL_RULE_MIN_DURATION_S && duration - position <= FINISHED_TAIL_S
}

function read(key: string): StoredPosition | null {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    if (!raw) return null
    const stored = JSON.parse(raw) as StoredPosition
    if (typeof stored?.t !== 'number' || typeof stored.at !== 'number') return null
    return stored
  } catch {
    return null
  }
}

/** Where to resume this title, in seconds, or null to start from the top. */
export function readResumePosition(key: string, now = Date.now()): number | null {
  const stored = read(key)
  if (!stored || now - stored.at > MAX_AGE_MS) return null
  if (stored.t < MIN_RESUME_S || isFinished(stored.t, stored.d)) return null
  return stored.t
}

/** Remember the position — or forget it, when there's nothing (or nothing left) to resume. */
export function saveResumePosition(key: string, position: number, duration: number, now = Date.now()): void {
  try {
    if (!Number.isFinite(position) || position < MIN_RESUME_S || isFinished(position, duration)) {
      localStorage.removeItem(PREFIX + key)
      return
    }
    const isNew = localStorage.getItem(PREFIX + key) === null
    const value: StoredPosition = { t: Math.floor(position), d: Math.floor(duration || 0), at: now }
    localStorage.setItem(PREFIX + key, JSON.stringify(value))
    if (isNew) prune()
  } catch {
    // Storage unavailable or full — resuming is a nicety.
  }
}

/** Drop the oldest resume points beyond MAX_ENTRIES. */
function prune(): void {
  const entries: Array<{ key: string; at: number }> = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (!key?.startsWith(PREFIX)) continue
    entries.push({ key, at: read(key.slice(PREFIX.length))?.at ?? 0 })
  }
  if (entries.length <= MAX_ENTRIES) return
  entries.sort((a, b) => a.at - b.at)
  for (const { key } of entries.slice(0, entries.length - MAX_ENTRIES)) localStorage.removeItem(key)
}

/** 75 → "1:15", 3725 → "1:02:05" */
export function formatPlayerTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const s = Math.floor(seconds)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = String(s % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`
}
