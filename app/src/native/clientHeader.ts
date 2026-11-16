import { APP_VERSION } from './platform'

/**
 * Every call this app makes to the StreamVault backend says it comes from the
 * app (`X-StreamVault-Client: app/<version>`). The website and the app both
 * run as https://stream-vault.site, so this is how the backend tells them
 * apart — an approved account's Premium plays in the app only (see
 * backend/src/lib/clientKind.ts). Calls to anywhere else are left alone.
 */
export const CLIENT_HEADER = 'X-StreamVault-Client'

export function markAppRequests(apiBase: string = import.meta.env.VITE_API_URL): void {
  if (!apiBase || typeof window === 'undefined') return
  const original = window.fetch.bind(window)
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (!url.startsWith(apiBase)) return original(input, init)
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined))
    headers.set(CLIENT_HEADER, `app/${APP_VERSION}`)
    return original(input, { ...init, headers })
  }
}
