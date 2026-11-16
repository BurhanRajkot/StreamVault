import type { Request } from 'express'

/**
 * The StreamVault app (Android, Linux, Windows) marks every call it makes to
 * this backend with `X-StreamVault-Client: app/<version>`; the website sends
 * nothing. Both run as https://stream-vault.site, so the Origin can't tell
 * them apart.
 *
 * It is how an approved account's Premium is kept to the app. A header is a
 * soft line, not a lock — someone determined can send it from a browser
 * extension — but the website itself never offers Premium to anyone but the
 * admin, and the backend refuses the website's calls.
 */
export const CLIENT_HEADER = 'X-StreamVault-Client'

export function isAppRequest(req: Request): boolean {
  return /^app(\/|$)/.test(req.get(CLIENT_HEADER) ?? '')
}
