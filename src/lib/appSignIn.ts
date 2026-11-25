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
 * The TV app signs in the same way through the viewer's phone, which is
 * another device, so the backend carries the halves across
 * (backend/src/routes/tvLink.ts):
 *
 *   1. The phone opens https://stream-vault.site/activate and enters the code
 *      the TV shows (pages/Activate.tsx). The page remembers the code for this
 *      tab and goes on to Auth0.
 *   2. Auth0 returns to https://stream-vault.site/?code=…&state=…; the site
 *      sends the query to the backend under that code, where the TV is
 *      waiting, and shows /activate?linked=1.
 *
 * This runs before the site's own Auth0 provider mounts, which would
 * otherwise try (and fail) to finish a sign-in that the app started.
 */

const PORT_KEY = 'sv-app-signin-port'
/**
 * The TV sign-in this tab is on its way to finish (pages/Activate.tsx):
 * `{ code, state }` — the TV's code, and the Auth0 state its sign-in carries,
 * so only that sign-in's answer goes to the TV, never the website's own.
 */
export const TV_CODE_KEY = 'sv-tv-link-code'

/** What Activate stores under TV_CODE_KEY. */
export function tvSignInRecord(code: string, authorizeUrl: string): string {
  return JSON.stringify({ code, state: new URL(authorizeUrl).searchParams.get('state') })
}

function readTvSignIn(value: string | null): { code: string; state: string } | null {
  if (!value) return null
  try {
    const parsed = JSON.parse(value) as { code?: unknown; state?: unknown }
    if (typeof parsed.code !== 'string' || !/^[A-Z2-9]{6}$/.test(parsed.code) || typeof parsed.state !== 'string' || !parsed.state) return null
    return { code: parsed.code, state: parsed.state }
  } catch {
    return null
  }
}

/** What the page does: go somewhere else, hand a TV its sign-in, or start the site as usual. */
export type AppSignInStep = { redirect: string } | { tvLink: { code: string; search: string } } | null

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
    store.removeItem(TV_CODE_KEY)
    return { redirect }
  }

  const port = store.getItem(PORT_KEY)
  const tvRecord = store.getItem(TV_CODE_KEY)
  if (!port && !tvRecord) return null
  const query = new URLSearchParams(where.search)
  const fromAuth0 = query.has('state') && (query.has('code') || query.has('error'))
  if (!fromAuth0) return null
  if (tvRecord) {
    // Once back from Auth0, the TV sign-in is over either way
    store.removeItem(TV_CODE_KEY)
    const tv = readTvSignIn(tvRecord)
    if (tv && tv.state === query.get('state')) return { tvLink: { code: tv.code, search: where.search } }
    // Not the TV's sign-in (one abandoned earlier in this tab): the page's own, or the desktop app's
  }
  if (!port) return null
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
  if ('tvLink' in step) {
    void handTvItsSignIn(step.tvLink.code, step.tvLink.search)
    return true
  }
  window.location.replace(step.redirect)
  return true
}

/** Back from Auth0 on the phone: the TV waiting on this code takes it from here. */
async function handTvItsSignIn(code: string, search: string): Promise<void> {
  // Auth0's answer leaves the address bar before anything else happens
  window.history.replaceState(null, '', '/activate')
  const api = import.meta.env.VITE_API_URL || 'http://localhost:4000'
  let result = 'linked=1'
  try {
    const res = await fetch(`${api}/tv-link/${code}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ search }),
    })
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null
      result = `linked=0&reason=${encodeURIComponent(body?.error || 'The TV didn’t get the sign-in. Try again with a new code.')}`
    } else if (new URLSearchParams(search).has('error')) {
      result = `linked=0&reason=${encodeURIComponent(new URLSearchParams(search).get('error_description') || 'Sign-in was cancelled')}`
    }
  } catch {
    result = `linked=0&reason=${encodeURIComponent('No connection. Check your internet and try again with a new code.')}`
  }
  window.location.replace(`/activate?${result}`)
}
