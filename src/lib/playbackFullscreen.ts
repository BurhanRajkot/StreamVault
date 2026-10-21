/**
 * Phone playback takes the whole screen: the page goes fullscreen (hiding the
 * browser's bars) and, where the browser allows it, turns sideways — what a
 * streaming app does when you press Play.
 *
 * The page rather than the <video>: the player's own controls, the episodes
 * panel and the settings sheet are page elements and have to stay on screen.
 * iPhone Safari has no page fullscreen; there the player just fills the
 * viewport, and the fullscreen button hands the video to iOS's own player.
 */

type LockableOrientation = ScreenOrientation & {
  lock?: (orientation: 'landscape') => Promise<void>
  unlock?: () => void
}

/** Call from the tap itself — fullscreen needs the user's gesture. */
export function enterPlaybackFullscreen(): void {
  const root = document.documentElement
  if (document.fullscreenElement || typeof root.requestFullscreen !== 'function') return
  root
    .requestFullscreen({ navigationUI: 'hide' })
    .then(() => (screen.orientation as LockableOrientation | undefined)?.lock?.('landscape'))
    // Refused (no gesture, iframe, desktop-class browser): play in the page
    .catch(() => {})
}

export function exitPlaybackFullscreen(): void {
  try {
    ;(screen.orientation as LockableOrientation | undefined)?.unlock?.()
  } catch {
    // Nothing was locked
  }
  if (document.fullscreenElement) void document.exitFullscreen().catch(() => {})
}
