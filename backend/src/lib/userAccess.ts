/**
 * Who may use what, as set from the admin dashboard.
 *
 * Per account (the `User` row): Premium access ('none' | 'granted' |
 * 'paused') and whether the account is suspended; per account but kept as a
 * site setting (`AppSetting` 'debrid-downloads'): whether it may save
 * Premium's file. Site-wide (`AppSetting` 'premium'): whether Premium is
 * paused for everyone but the admin.
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
// Real-Debrid downloads, per account
// ---------------------------------------------------------------------------
//
// Premium plays the file from its Real-Debrid link, and the player also
// offers that link to save the file or open it in VLC. The admin can switch
// the offer off for an account that keeps streaming; magnet-link downloads
// (GET /releases) are a different thing and stay open. Kept as one site
// setting — AppSetting 'debrid-downloads' → { pausedFor: [user ids] } — so it
// needs no migration beyond the 2026-11-15 one.

const DOWNLOADS_KEY = 'debrid-downloads'
let downloadsSetting: { at: number; pausedFor: ReadonlySet<string> } | null = null

type DbError = { code?: string; message?: string }

/** The paused list after allowing (or pausing) `userId`'s downloads: sorted, no repeats. */
export function updatedPausedList(pausedFor: Iterable<string>, userId: string, allowed: boolean): string[] {
  const next = new Set(pausedFor)
  if (allowed) next.delete(userId)
  else next.add(userId)
  return [...next].sort()
}

async function readDownloadsSetting(): Promise<{ pausedFor: ReadonlySet<string>; error: DbError | null }> {
  const { data, error } = await supabaseAdmin.from('AppSetting').select('value').eq('key', DOWNLOADS_KEY).maybeSingle()
  if (error) return { pausedFor: new Set(), error }
  const list = (data as { value?: { pausedFor?: unknown } } | null)?.value?.pausedFor
  return { pausedFor: new Set(Array.isArray(list) ? list.filter((id): id is string => typeof id === 'string') : []), error: null }
}

/**
 * Accounts whose Real-Debrid downloads the admin paused. When the setting
 * can't be read, none: a database hiccup mustn't take downloads from everyone.
 */
export async function getDownloadsPausedFor(): Promise<ReadonlySet<string>> {
  if (downloadsSetting && Date.now() - downloadsSetting.at < SETTINGS_TTL_MS) return downloadsSetting.pausedFor
  const { pausedFor, error } = await readDownloadsSetting()
  if (error) {
    if (isMissingSchema(error)) warnMissingSchemaOnce()
    else logger.warn('Download setting lookup failed', { error: error.message })
    return pausedFor
  }
  downloadsSetting = { at: Date.now(), pausedFor }
  return pausedFor
}

/** May this account save Premium's file (the admin always may). */
export async function debridDownloadsAllowed(userId: string): Promise<boolean> {
  return !(await getDownloadsPausedFor()).has(userId)
}

export async function setDebridDownloads(userId: string, allowed: boolean): Promise<{ error: DbError | null }> {
  // Read fresh, not from the cache: the list is rewritten whole.
  const current = await readDownloadsSetting()
  if (current.error) return { error: current.error }
  const pausedFor = updatedPausedList(current.pausedFor, userId, allowed)
  const { error } = await supabaseAdmin
    .from('AppSetting')
    .upsert({ key: DOWNLOADS_KEY, value: { pausedFor }, updatedAt: new Date().toISOString() })
  if (!error) downloadsSetting = { at: Date.now(), pausedFor: new Set(pausedFor) }
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
