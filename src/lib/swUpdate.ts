/**
 * Getting a new deploy in front of people who already have the site.
 *
 * vite-plugin-pwa's precache serves the *installed* build first and fetches
 * the new one in the background, so the first visit after a deploy always
 * shows the previous version — on a phone, where the tab lives for days, that
 * can mean never seeing a release. Its 'autoUpdate' activates the new service
 * worker but leaves the open page running the old code.
 *
 * So: look for a new build whenever the viewer comes back to the tab, and
 * once one has taken over, reload — but never under a playing video. On a
 * title/player page the reload waits for the next navigation away from it.
 */

/** Where a reload would interrupt playback (or a title the viewer is reading). */
function isBusy(pathname: string): boolean {
  return pathname.startsWith('/watch/') || Array.from(document.querySelectorAll('video')).some((v) => !v.paused)
}

let updateReady = false
let reloading = false

/** Reload into the new build if one is waiting and it's safe to. Call on every route change. */
export function applyPendingUpdate(pathname: string = window.location.pathname): void {
  if (!updateReady || reloading || isBusy(pathname)) return
  reloading = true
  window.location.reload()
}

export function watchForUpdates(): void {
  if (!('serviceWorker' in navigator)) return
  const sw = navigator.serviceWorker

  // No controller yet means this is the first install — nothing stale to replace.
  const hadController = !!sw.controller
  sw.addEventListener('controllerchange', () => {
    if (!hadController) return
    updateReady = true
    applyPendingUpdate()
  })

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return
    // Back on the tab: ask for a newer build (the browser only checks on navigation)
    void sw
      .getRegistration()
      .then((registration) => registration?.update())
      .catch(() => {})
    applyPendingUpdate()
  })
  window.addEventListener('popstate', () => applyPendingUpdate())
}
