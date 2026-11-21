/**
 * The admin dashboard's Users panel and site switches. Admin token only.
 *
 *   GET   /admin/users?q=&limit=&offset=    — accounts, most recently active first
 *   PATCH /admin/users/:id                  — { premiumAccess?, suspended?, debridDownloads? }
 *   GET   /admin/settings                   — { premiumPausedForAll }
 *   PUT   /admin/settings/premium           — { pausedForAll: boolean }
 *
 * Until the 2026-11-15 migration is applied these answer 503 with
 * `code: 'migration_required'`, and the dashboard says what to run.
 */

import { Router, Request, Response } from 'express'
import { requireAdminAuth } from '../admin/middleware'
import { supabaseAdmin } from '../lib/supabase'
import { logger } from '../lib/logger'
import {
  PREMIUM_ACCESS_VALUES,
  forgetUserAccess,
  getDownloadsAllowedFor,
  isMissingSchema,
  isPremiumPausedForAll,
  setDebridDownloads,
  setPremiumPausedForAll,
  type PremiumAccess,
} from '../lib/userAccess'

const router = Router()
// Per route, not router.use: this router is mounted at /admin, beside the
// login route, which must stay open.

export const MIGRATION_FILE = 'backend/supabase/migrations/20261115000000_user_access_controls.sql'

function migrationRequired(res: Response) {
  return res.status(503).json({
    error: `The user-access columns don't exist yet. Run ${MIGRATION_FILE} in the Supabase SQL editor.`,
    code: 'migration_required',
  })
}

/** Auth0 user ids: "auth0|abc", "google-oauth2|123", ... */
export const USER_ID_RE = /^[\w.:@-]{1,64}\|[\w.:@-]{1,128}$/

const USER_COLUMNS = 'id, email, name, createdAt, lastSeenAt, premiumAccess, suspendedAt, subscriptionStatus'

/** A search term safe to put inside a PostgREST `or=(...)` filter. */
export function searchTerm(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const term = raw.replace(/[^\w@.+\- |]/g, '').trim().slice(0, 80)
  return term.length >= 2 ? term : null
}

router.get('/users', requireAdminAuth, async (req: Request, res: Response) => {
  const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? '50'), 10) || 50, 1), 100)
  const offset = Math.max(parseInt(String(req.query.offset ?? '0'), 10) || 0, 0)
  const term = searchTerm(req.query.q)

  let query = supabaseAdmin
    .from('User')
    .select(USER_COLUMNS, { count: 'exact' })
    .order('lastSeenAt', { ascending: false, nullsFirst: false })
    .order('createdAt', { ascending: false })
    .range(offset, offset + limit - 1)
  if (term) query = query.or(`email.ilike.*${term}*,name.ilike.*${term}*,id.ilike.*${term}*`)

  const [{ data, error, count }, downloadsAllowed] = await Promise.all([query, getDownloadsAllowedFor()])
  if (error) {
    if (isMissingSchema(error)) return migrationRequired(res)
    logger.error('Admin user list failed', { error: error.message })
    return res.status(500).json({ error: 'Could not load users' })
  }
  const users = (data ?? []).map((user) => ({ ...user, debridDownloads: downloadsAllowed.has(user.id) }))
  return res.json({ users, total: count ?? 0 })
})

router.patch('/users/:id', requireAdminAuth, async (req: Request, res: Response) => {
  const { id } = req.params
  if (!USER_ID_RE.test(id)) return res.status(400).json({ error: 'Invalid user id' })

  const body = (req.body ?? {}) as { premiumAccess?: unknown; suspended?: unknown; debridDownloads?: unknown }
  if (body.debridDownloads !== undefined && typeof body.debridDownloads !== 'boolean') {
    return res.status(400).json({ error: 'debridDownloads must be true or false' })
  }
  const debridDownloads = body.debridDownloads as boolean | undefined
  const update: { premiumAccess?: PremiumAccess; suspendedAt?: string | null; updatedAt: string } = {
    updatedAt: new Date().toISOString(),
  }
  if (body.premiumAccess !== undefined) {
    if (!(PREMIUM_ACCESS_VALUES as readonly unknown[]).includes(body.premiumAccess)) {
      return res.status(400).json({ error: `premiumAccess must be one of: ${PREMIUM_ACCESS_VALUES.join(', ')}` })
    }
    update.premiumAccess = body.premiumAccess as PremiumAccess
  }
  if (body.suspended !== undefined) {
    if (typeof body.suspended !== 'boolean') return res.status(400).json({ error: 'suspended must be true or false' })
    update.suspendedAt = body.suspended ? new Date().toISOString() : null
  }
  const changesRow = update.premiumAccess !== undefined || update.suspendedAt !== undefined
  if (!changesRow && debridDownloads === undefined) {
    return res.status(400).json({ error: 'Nothing to change' })
  }

  // The row is updated when its own columns change, else only read (to answer with it).
  const { data, error } = changesRow
    ? await supabaseAdmin.from('User').update(update).eq('id', id).select(USER_COLUMNS).maybeSingle()
    : await supabaseAdmin.from('User').select(USER_COLUMNS).eq('id', id).maybeSingle()
  if (error) {
    if (isMissingSchema(error)) return migrationRequired(res)
    logger.error('Admin user update failed', { error: error.message })
    return res.status(500).json({ error: 'Could not update user' })
  }
  if (!data) return res.status(404).json({ error: 'User not found' })

  if (debridDownloads !== undefined) {
    const { error: downloadsError } = await setDebridDownloads(id, debridDownloads)
    if (downloadsError) {
      if (isMissingSchema(downloadsError)) return migrationRequired(res)
      logger.error('Admin download setting update failed', { error: downloadsError.message })
      return res.status(500).json({ error: 'Could not change downloads for this account' })
    }
  }

  forgetUserAccess(id)
  logger.info('Admin changed user access', {
    userId: id,
    premiumAccess: update.premiumAccess,
    suspended: update.suspendedAt === undefined ? undefined : update.suspendedAt !== null,
    debridDownloads,
  })
  const downloadsAllowed = await getDownloadsAllowedFor()
  return res.json({ user: { ...data, debridDownloads: downloadsAllowed.has(id) } })
})

router.get('/settings', requireAdminAuth, async (_req: Request, res: Response) => {
  return res.json({ premiumPausedForAll: await isPremiumPausedForAll() })
})

router.put('/settings/premium', requireAdminAuth, async (req: Request, res: Response) => {
  const { pausedForAll } = (req.body ?? {}) as { pausedForAll?: unknown }
  if (typeof pausedForAll !== 'boolean') return res.status(400).json({ error: 'pausedForAll must be true or false' })
  const { error } = await setPremiumPausedForAll(pausedForAll)
  if (error) {
    if (isMissingSchema(error)) return migrationRequired(res)
    logger.error('Premium setting update failed', { error: error.message })
    return res.status(500).json({ error: 'Could not save the setting' })
  }
  logger.info('Admin set Premium pause for everyone', { pausedForAll })
  return res.json({ premiumPausedForAll: pausedForAll })
})

export default router
