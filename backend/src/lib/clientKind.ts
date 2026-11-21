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

/**
 * The oldest app that may play Premium for an approved account. Older builds
 * still run, and every free server still works in them, but they predate
 * gates the admin relies on (the per-account "downloads paused" switch first
 * shipped in 1.0.21), so they are asked to update rather than let through.
 * The admin's own sign-in isn't held to it. Raise it (env
 * PREMIUM_MIN_APP_VERSION) whenever a release adds a gate that matters.
 */
export const DEFAULT_MIN_PREMIUM_APP_VERSION = '1.0.21'

/** The app's version from the header (`app/1.0.21` → "1.0.21"); null for the website or a header without one. */
export function appVersion(req: Request): string | null {
  const match = /^app\/(\d+(?:\.\d+){0,3})\b/.exec(req.get(CLIENT_HEADER) ?? '')
  return match ? match[1] : null
}

/** -1, 0 or 1 as dotted version `a` is older than, the same as, or newer than `b`. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0)
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d !== 0) return d < 0 ? -1 : 1
  }
  return 0
}

/**
 * An app call from a build older than PREMIUM_MIN_APP_VERSION — or one that
 * names no version at all (every release has sent one). False for the
 * website, which `app-only` already turns away.
 */
export function isOutdatedApp(req: Request, minimum: string = process.env.PREMIUM_MIN_APP_VERSION?.trim() || DEFAULT_MIN_PREMIUM_APP_VERSION): boolean {
  if (!isAppRequest(req)) return false
  const version = appVersion(req)
  return version === null || compareVersions(version, minimum) < 0
}
