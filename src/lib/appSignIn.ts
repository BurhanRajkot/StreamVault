/**
 * Signing in to the desktop app (Linux, Windows) through the system browser.
 *
 * Google refuses sign-ins inside an app's embedded browser ("This browser or
 * app may not be secure"), so the app opens the Auth0 login in the viewer's
 * own browser instead (app/electron/main.cjs, 'sv:sign-in'). Auth0 only
 * returns to the site, which is already on its callback list, so the site
 * relays the code back to the app:
 *
 *   1. The app opens https://stream-vault.site/app-signin#port=<p>&url=<authorize URL>.
 *      The site remembers the port for this tab and goes on to Auth0.
 *   2. Auth0 returns to https://stream-vault.site/?code=…&state=… in the same tab.
 *      The site sees the port it remembered and passes the query on to
 *      http://127.0.0.1:<p>/callback, where the app is waiting.
 *   3. The app exchanges the code itself. The code is useless without the
 *      PKCE verifier, which never leaves the app.
 *
 * This runs before the site's own Auth0 provider mounts, which would
 * otherwise try (and fail) to finish a sign-in that the app started.
 */

const PORT_KEY = 'sv-app-signin-port'

/** What the page does: go somewhere else, or start the site as usual. */
export type AppSignInStep = { redirect: string } | null

interface Where {
  pathname: string
  search: string
  hash: string
}

interface Store {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

function validPort(value: string | null): value is string {
  if (!value || !/^\d{1,5}$/.test(value)) return false
  const port = Number(value)
  return port >= 1024 && port <= 65535
}

/**
 * Only this site's Auth0 tenant's authorize endpoint — never an open redirect.
 * The address is rebuilt on the tenant's fixed origin; only the query comes
 * from the link, and a query can't change where the page goes.
 */
function authorizeRedirect(value: string | null, auth0Domain: string): string | null {
  if (!value || !auth0Domain) return null
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.hostname !== auth0Domain || url.port || url.pathname !== '/authorize') return null
    return `https://${auth0Domain}/authorize${url.search}`
  } catch {
    return null
  }
}

export function appSignInStep(where: Where, store: Store, auth0Domain: string): AppSignInStep {
  if (where.pathname === '/app-signin') {
    const params = new URLSearchParams(where.hash.replace(/^#/, ''))
    const port = params.get('port')
    const redirect = authorizeRedirect(params.get('url'), auth0Domain)
    if (!validPort(port) || !redirect) return { redirect: '/' }
    store.setItem(PORT_KEY, port)
    return { redirect }
  }

  const port = store.getItem(PORT_KEY)
  if (!port) return null
  const query = new URLSearchParams(where.search)
  const fromAuth0 = query.has('state') && (query.has('code') || query.has('error'))
  if (!fromAuth0) return null
  store.removeItem(PORT_KEY)
  if (!validPort(port)) return null
  return { redirect: `http://127.0.0.1:${Number(port)}/callback${where.search}` }
}

/** Runs the step on this page; true when the page is leaving (don't start the app). */
export function runAppSignInStep(): boolean {
  let step: AppSignInStep
  try {
    step = appSignInStep(window.location, window.sessionStorage, import.meta.env.VITE_AUTH0_DOMAIN ?? '')
  } catch {
    // No sessionStorage (blocked site data): the site starts as usual
    return false
  }
  if (!step) return false
  window.location.replace(step.redirect)
  return true
}
