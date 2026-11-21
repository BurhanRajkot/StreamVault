/**
 * Who may use what, as set from the admin dashboard.
 *
 * Per account (the `User` row): Premium access ('none' | 'granted' |
 * 'paused') and whether the account is suspended; per account but kept as a
 * site setting (`AppSetting` 'debrid-downloads-allowed'): whether it may save
 * Premium's file (off unless the admin allows it). Site-wide (`AppSetting` 'premium'): whether Premium is
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
  /** Approved, but asking from the website: an account's Premium plays in the StreamVault app only. */
  | 'app-only'
  /** Approved, asking from the app, but from a build too old for Premium (see lib/clientKind isOutdatedApp). */
  | 'update-required'

/**
 * The rule, on its own so it can be tested without a database. The admin
 * plays anywhere; an approved account only from the app (see lib/clientKind).
 */
export function decidePremium(who: {
  admin: boolean
  signedIn: boolean
  access?: UserAccess
  pausedForAll: boolean
  fromApp: boolean
  /** The app build asking is older than Premium allows. */
  outdatedApp?: boolean
}): PremiumDecision {
  if (who.admin) return 'granted'
  if (!who.signedIn || !who.access) return 'sign-in-required'
  if (who.access.suspended) return 'suspended'
  if (who.access.premiumAccess === 'none') return 'not-approved'
  if (who.access.premiumAccess === 'paused') return 'paused'
  if (who.pausedForAll) return 'paused-for-all'
  if (!who.fromApp) return 'app-only'
  if (who.outdatedApp) return 'update-required'
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
// Premium streams the file from its Real-Debrid link. Saving that file
// (offline download, "Download", "Open in another player") is off for every
// account unless the admin allows it for that account in the dashboard; the
// admin's own sign-in always may. Kept as one site setting —
// AppSetting 'debrid-downloads-allowed' → { allowedFor: [user ids] } — so it
// needs no migration. (Until 2026-11-22 it was the reverse, a list of paused
// accounts under 'debrid-downloads'; that row is no longer read, so nobody
// keeps downloads from it.) Magnet-link downloads (GET /releases) are a
// different thing and stay open.

const DOWNLOADS_KEY = 'debrid-downloads-allowed'
let downloadsSetting: { at: number; allowedFor: ReadonlySet<string> } | null = null

type DbError = { code?: string; message?: string }

/** The allowed list after allowing (or not) `userId`'s downloads: sorted, no repeats. */
export function updatedAllowedList(allowedFor: Iterable<string>, userId: string, allowed: boolean): string[] {
  const next = new Set(allowedFor)
  if (allowed) next.add(userId)
  else next.delete(userId)
  return [...next].sort()
}

async function readDownloadsSetting(): Promise<{ allowedFor: ReadonlySet<string>; error: DbError | null }> {
  const { data, error } = await supabaseAdmin.from('AppSetting').select('value').eq('key', DOWNLOADS_KEY).maybeSingle()
  if (error) return { allowedFor: new Set(), error }
  const list = (data as { value?: { allowedFor?: unknown } } | null)?.value?.allowedFor
  return { allowedFor: new Set(Array.isArray(list) ? list.filter((id): id is string => typeof id === 'string') : []), error: null }
}

/**
 * Accounts the admin allowed to save Premium's file. When the setting can't
 * be read, none: downloads are only ever on by the admin's explicit choice.
 */
export async function getDownloadsAllowedFor(): Promise<ReadonlySet<string>> {
  if (downloadsSetting && Date.now() - downloadsSetting.at < SETTINGS_TTL_MS) return downloadsSetting.allowedFor
  const { allowedFor, error } = await readDownloadsSetting()
  if (error) {
    if (isMissingSchema(error)) warnMissingSchemaOnce()
    else logger.warn('Download setting lookup failed', { error: error.message })
    return allowedFor
  }
  downloadsSetting = { at: Date.now(), allowedFor }
  return allowedFor
}

/** May this account save Premium's file — only when the admin allowed it (the admin's own sign-in always may). */
export async function debridDownloadsAllowed(userId: string): Promise<boolean> {
  return (await getDownloadsAllowedFor()).has(userId)
}

export async function setDebridDownloads(userId: string, allowed: boolean): Promise<{ error: DbError | null }> {
  // Read fresh, not from the cache: the list is rewritten whole.
  const current = await readDownloadsSetting()
  if (current.error) return { error: current.error }
  const allowedFor = updatedAllowedList(current.allowedFor, userId, allowed)
  const { error } = await supabaseAdmin
    .from('AppSetting')
    .upsert({ key: DOWNLOADS_KEY, value: { allowedFor }, updatedAt: new Date().toISOString() })
  if (!error) downloadsSetting = { at: Date.now(), allowedFor: new Set(allowedFor) }
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
