import { logger } from './logger'

/**
 * Real-Debrid streaming is free for everyone until this instant — a six-month
 * promotion that started 2026-10-11 (guests included since 2026-10-16, for
 * the player routes; see debridAccess). After it passes, the
 * subscription check applies again on its own; no deploy is needed to end it.
 *
 * `DEBRID_FREE_UNTIL` (any string `Date` parses, e.g. "2027-04-11") overrides
 * it — set a past date to end the promotion early, or a later one to extend it.
 */
const DEFAULT_FREE_UNTIL = '2027-04-11T00:00:00Z'

function parseFreeUntil(raw: string | undefined): Date {
  if (raw) {
    const parsed = new Date(raw)
    if (!Number.isNaN(parsed.getTime())) return parsed
    logger.warn('Ignoring unparseable DEBRID_FREE_UNTIL', { value: raw })
  }
  return new Date(DEFAULT_FREE_UNTIL)
}

const freeUntil = parseFreeUntil(process.env.DEBRID_FREE_UNTIL)

/** When the free promotion ends, or null once it has. */
export function debridFreeUntil(now = Date.now()): Date | null {
  return now < freeUntil.getTime() ? freeUntil : null
}

export function isDebridFreeForEveryone(now = Date.now()): boolean {
  return debridFreeUntil(now) !== null
}

export type DebridAccess = 'granted' | 'sign-in-required' | 'subscription-required'

/**
 * Who may use Real-Debrid, short of the subscription lookup itself.
 *
 * Admins always may. While the promotion runs every signed-in user may, and
 * so may guests on the routes that allow them (`guestsAllowed` — the player's,
 * not the shared account's library). Otherwise a guest has to sign in and a
 * signed-in user needs an active subscription.
 */
export function debridAccess(
  who: { admin: boolean; signedIn: boolean; guestsAllowed: boolean },
  now = Date.now()
): DebridAccess {
  if (who.admin) return 'granted'
  const free = isDebridFreeForEveryone(now)
  if (!who.signedIn) return free && who.guestsAllowed ? 'granted' : 'sign-in-required'
  return free ? 'granted' : 'subscription-required'
}

export const __test = { parseFreeUntil, DEFAULT_FREE_UNTIL }
