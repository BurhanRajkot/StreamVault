/**
 * Who may use what, as set from the admin dashboard.
 *
 * Per account (the `User` row): Premium access ('none' | 'granted' |
 * 'paused') and whether the account is suspended. Site-wide (`AppSetting`
 * 'premium'): whether Premium is paused for everyone but the admin.
 *
 * Both are read on hot paths — every signed-in request checks suspension,
 * and the Premium player polls every few seconds — so answers are cached in
 * memory for a short while. A change made from the dashboard clears the
 * affected entry at once (the backend runs as one process).
 *
 * Before the 2026-11-15 migration is applied the columns don't exist: reads
 * then answer "no Premium, not suspended", i.e. Premium stays admin-only and
 * nobody is locked out.
 */

import { supabaseAdmin } from './supabase'
import { logger } from './logger'

export const PREMIUM_ACCESS_VALUES = ['none', 'granted', 'paused'] as const
export type PremiumAccess = (typeof PREMIUM_ACCESS_VALUES)[number]

export interface UserAccess {
  premiumAccess: PremiumAccess
  suspended: boolean
}

export type PremiumDecision =
  | 'granted'
  | 'sign-in-required'
  /** Signed in, but the admin hasn't given this account Premium. */
  | 'not-approved'
  /** The admin approved this account, then paused it. */
  | 'paused'
  /** Premium is paused for everyone but the admin. */
  | 'paused-for-all'
  | 'suspended'

/** The rule, on its own so it can be tested without a database. */
export function decidePremium(who: {
  admin: boolean
  signedIn: boolean
  access?: UserAccess
  pausedForAll: boolean
}): PremiumDecision {
  if (who.admin) return 'granted'
  if (!who.signedIn || !who.access) return 'sign-in-required'
  if (who.access.suspended) return 'suspended'
  if (who.access.premiumAccess === 'none') return 'not-approved'
  if (who.access.premiumAccess === 'paused') return 'paused'
  if (who.pausedForAll) return 'paused-for-all'
  return 'granted'
}

const NO_ACCESS: UserAccess = { premiumAccess: 'none', suspended: false }

const ACCESS_TTL_MS = 30_000
const ACCESS_CACHE_CAP = 10_000
const accessCache = new Map<string, { at: number; value: UserAccess }>()

/** A PostgREST error that means the migration hasn't been applied (missing column/table). */
export function isMissingSchema(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false
  return (
    ['42703', '42P01', 'PGRST204', 'PGRST205'].includes(error.code ?? '') ||
    /column .* does not exist|could not find the .* (column|table)/i.test(error.message ?? '')
  )
}

let warnedMissingSchema = false
function warnMissingSchemaOnce(): void {
  if (warnedMissingSchema) return
  warnedMissingSchema = true
  logger.warn(
    'User access columns missing — apply backend/supabase/migrations/20261115000000_user_access_controls.sql. Premium stays admin-only until then.'
  )
}

export async function getUserAccess(userId: string): Promise<UserAccess> {
  const hit = accessCache.get(userId)
  if (hit && Date.now() - hit.at < ACCESS_TTL_MS) return hit.value

  const { data, error } = await supabaseAdmin
    .from('User')
    .select('premiumAccess, suspendedAt')
    .eq('id', userId)
    .maybeSingle()

  if (error) {
    if (isMissingSchema(error)) warnMissingSchemaOnce()
    else logger.warn('User access lookup failed', { error: error.message })
    // Not cached: the next request asks again.
    return NO_ACCESS
  }

  const row = data as { premiumAccess?: string; suspendedAt?: string | null } | null
  const value: UserAccess = {
    premiumAccess: (PREMIUM_ACCESS_VALUES as readonly string[]).includes(row?.premiumAccess ?? '')
      ? (row!.premiumAccess as PremiumAccess)
      : 'none',
    suspended: !!row?.suspendedAt,
  }
  if (accessCache.size >= ACCESS_CACHE_CAP) accessCache.clear()
  accessCache.set(userId, { at: Date.now(), value })
  return value
}

export function forgetUserAccess(userId: string): void {
  accessCache.delete(userId)
}

// ---------------------------------------------------------------------------
// Site-wide Premium switch
// ---------------------------------------------------------------------------

const SETTINGS_TTL_MS = 30_000
let premiumSetting: { at: number; pausedForAll: boolean } | null = null

export async function isPremiumPausedForAll(): Promise<boolean> {
  if (premiumSetting && Date.now() - premiumSetting.at < SETTINGS_TTL_MS) return premiumSetting.pausedForAll

  const { data, error } = await supabaseAdmin.from('AppSetting').select('value').eq('key', 'premium').maybeSingle()
  if (error) {
    if (isMissingSchema(error)) warnMissingSchemaOnce()
    else logger.warn('Premium setting lookup failed', { error: error.message })
    return false
  }
  const pausedForAll = (data as { value?: { pausedForAll?: unknown } } | null)?.value?.pausedForAll === true
  premiumSetting = { at: Date.now(), pausedForAll }
  return pausedForAll
}

export async function setPremiumPausedForAll(pausedForAll: boolean): Promise<{ error: { code?: string; message?: string } | null }> {
  const { error } = await supabaseAdmin
    .from('AppSetting')
    .upsert({ key: 'premium', value: { pausedForAll }, updatedAt: new Date().toISOString() })
  if (!error) premiumSetting = { at: Date.now(), pausedForAll }
  return { error }
}

// ---------------------------------------------------------------------------
// Last seen + profile
// ---------------------------------------------------------------------------

const TOUCH_INTERVAL_MS = 60 * 60 * 1000
const lastTouched = new Map<string, number>()

/**
 * Note that the account was active, at most once an hour per account. Never
 * throws and never waits — it's bookkeeping for the Users panel.
 */
export function touchUser(userId: string): void {
  const now = Date.now()
  const last = lastTouched.get(userId)
  if (last && now - last < TOUCH_INTERVAL_MS) return
  if (lastTouched.size >= ACCESS_CACHE_CAP) lastTouched.clear()
  lastTouched.set(userId, now)
  void supabaseAdmin
    .from('User')
    .update({ lastSeenAt: new Date(now).toISOString() })
    .eq('id', userId)
    .then(({ error }) => {
      if (error && !isMissingSchema(error)) logger.warn('Could not record last seen', { error: error.message })
    })
}

export const __test = { accessCache, lastTouched }
