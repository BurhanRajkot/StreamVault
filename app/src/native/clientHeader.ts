import { APP_VERSION } from './platform'

/**
 * Signed-in calls this app makes to the StreamVault backend say they come
 * from the app (`X-StreamVault-Client: app/<version>`). The website and the
 * app both run as https://stream-vault.site, so this is how the backend tells
 * them apart — an approved account's Premium plays in the app only (see
 * backend/src/lib/clientKind.ts). Calls to anywhere else are left alone.
 *
 * Only calls that already carry an Authorization header are marked: every
 * check of the header sits behind a sign-in, and those calls make a CORS
 * preflight anyway. Adding a custom header to the anonymous ones (search,
 * title details, browse rows) would cost each a preflight of its own — a
 * second round trip that Chromium can't cache across URLs, which doubled
 * every search and title load.
 */
export const CLIENT_HEADER = 'X-StreamVault-Client'

export function markAppRequests(apiBase: string = import.meta.env.VITE_API_URL): void {
  if (!apiBase || typeof window === 'undefined') return
  const original = window.fetch.bind(window)
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (!url.startsWith(apiBase)) return original(input, init)
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined))
    if (!headers.has('Authorization')) return original(input, init)
    headers.set(CLIENT_HEADER, `app/${APP_VERSION}`)
    return original(input, { ...init, headers })
  }
}
