/**
 * Who an account is — its email and name — for the admin's Users panel.
 *
 * The app and the site send them once a session (POST /me/profile), but that
 * can miss: a device whose sign-in carries no email, a request that fails.
 * So when the backend still has no email for a signed-in account, it asks
 * Auth0 itself: the viewer's own access token also opens Auth0's /userinfo
 * (it's issued for the "openid profile email" scopes), which answers with the
 * email and name. Asked at most every few hours per account, and never to
 * replace what's already there.
 */

import { supabaseAdmin } from './supabase'
import { logger } from './logger'

/** How long after a lookup (found or not) the same account isn't asked about again. */
const RETRY_AFTER_MS = 6 * 60 * 60 * 1000
const TRIED_CAP = 10_000
const tried = new Map<string, number>()

function auth0Origin(): string | null {
  const domain = process.env.AUTH0_DOMAIN?.trim()
  if (!domain) return null
  return domain.startsWith('http') ? domain.replace(/\/+$/, '') : `https://${domain.replace(/\/+$/, '')}`
}

export interface Auth0Profile {
  email: string | null
  name: string | null
}

/** The account's email and name from Auth0's /userinfo, read with its own access token. */
export async function fetchAuth0Profile(token: string): Promise<Auth0Profile | null> {
  const origin = auth0Origin()
  if (!origin) return null
  const res = await fetch(`${origin}/userinfo`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(5000),
  })
  if (!res.ok) throw new Error(`Auth0 userinfo answered ${res.status}`)
  const body = (await res.json()) as { email?: unknown; name?: unknown; nickname?: unknown }
  const text = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null)
  const email = text(body.email, 254)
  const name = text(body.name, 120) ?? text(body.nickname, 120)
  return { email: email && looksLikeEmail(email) ? email.toLowerCase() : null, name }
}

/** One @, something before it, and a dotted domain after it, with no spaces. */
function looksLikeEmail(value: string): boolean {
  const at = value.indexOf('@')
  if (at < 1 || at !== value.lastIndexOf('@') || /\s/.test(value)) return false
  const domain = value.slice(at + 1)
  const dot = domain.lastIndexOf('.')
  return dot > 0 && dot < domain.length - 1
}

/** The bearer token of a request, if it has one. */
export function bearerToken(authorization: string | undefined): string | null {
  // \S right after the spaces, so the two parts can't trade characters (no backtracking blow-up)
  const m = /^Bearer\s+(\S.*)$/i.exec(authorization ?? '')
  return m ? m[1].trim() : null
}

/**
 * Fill in the account's email (and name, if missing) from Auth0 when the
 * backend has none. Never throws; never overwrites a stored value.
 */
export async function fillMissingProfile(userId: string, token: string | null): Promise<void> {
  if (!token) return
  const last = tried.get(userId)
  if (last !== undefined && Date.now() - last < RETRY_AFTER_MS) return
  if (tried.size >= TRIED_CAP) tried.delete(tried.keys().next().value as string)
  tried.set(userId, Date.now())

  try {
    const { data: row, error } = await supabaseAdmin.from('User').select('email,name').eq('id', userId).maybeSingle()
    if (error || !row || row.email) return
    const profile = await fetchAuth0Profile(token)
    if (!profile?.email) return
    const update: Record<string, string> = { email: profile.email }
    if (!row.name && profile.name) update.name = profile.name
    await supabaseAdmin.from('User').update(update).eq('id', userId).is('email', null)
  } catch (err: unknown) {
    logger.warn('Could not fill in account profile', { error: err instanceof Error ? err.message : String(err) })
  }
}

export function resetProfileLookupsForTests(): void {
  tried.clear()
}
