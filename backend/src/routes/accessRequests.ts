/**
 * Premium access requests — how an account asks the admin for ⚡ Premium.
 *
 * Nothing is paid. In the app, a signed-in viewer may star the GitHub repo or
 * donate (both optional), then sends a request: their GitHub username (the
 * star is checked against GitHub, see lib/githubStars), a donation's UPI
 * reference, a note — all optional. The admin approves it (Premium is switched
 * on for the account, in the app only — see lib/clientKind) or deletes it.
 *
 *   GET    /me/access-request                       — this account's request, if any
 *   POST   /me/access-request                       — { github?, reference?, note?, email? }, app only
 *   GET    /admin/access-requests                   — every request, pending first (admin)
 *   POST   /admin/access-requests/:userId/approve   — grant Premium (admin)
 *   DELETE /admin/access-requests/:userId           — drop the request (admin)
 *
 * One request per account, kept as an AppSetting row `access-request:<user
 * id>` — the table the 2026-11-15 migration made — so no new migration.
 */

import { Router, Request, Response } from 'express'
import { requireUser } from '../middleware/auth'
import { requireAdminAuth } from '../admin/middleware'
import { getUserId } from '../utils/auth'
import { ensureUser } from '../lib/ensureUser'
import { supabaseAdmin } from '../lib/supabase'
import { logger } from '../lib/logger'
import { strictRateLimiter } from '../cybersecurity/rateLimiter'
import { isAppRequest } from '../lib/clientKind'
import { GITHUB_USERNAME_RE, STAR_REPO, hasStarred } from '../lib/githubStars'
import { forgetUserAccess, getUserAccess, isMissingSchema } from '../lib/userAccess'
import { USER_ID_RE } from './adminUsers'

export const KEY_PREFIX = 'access-request:'

export interface AccessRequest {
  userId: string
  email: string | null
  name: string | null
  /** GitHub username they gave, if any. */
  github: string | null
  /** Whether that account has starred the repo: null = no username, or GitHub couldn't be asked. */
  starred: boolean | null
  /** UPI reference (UTR) of a donation, if they made one. */
  reference: string | null
  note: string | null
  status: 'pending' | 'approved'
  createdAt: string
  reviewedAt: string | null
}

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/
/** A UPI UTR is 12 digits; other apps' references are letters and digits — 6 to 35 of them. */
const REFERENCE_RE = /^[A-Za-z0-9]{6,35}$/

/** Printable, single-spaced, capped — or null. */
export function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  // eslint-disable-next-line no-control-regex
  const text = value.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, max)
  return text || null
}

export interface RequestInput {
  github: string | null
  reference: string | null
  note: string | null
  email: string | null
}

/** The request body, checked; a string is the error to show. */
export function parseRequestInput(body: unknown): RequestInput | string {
  const raw = (body ?? {}) as Record<string, unknown>
  const github = cleanText(raw.github, 60)?.replace(/^@/, '').replace(/^https?:\/\/github\.com\//i, '').replace(/\/.*$/, '') || null
  if (github && !GITHUB_USERNAME_RE.test(github)) return 'That doesn’t look like a GitHub username.'
  const reference = cleanText(raw.reference, 60)?.replace(/[\s-]/g, '') || null
  if (reference && !REFERENCE_RE.test(reference)) return 'The payment reference should be the 12-digit UTR from your UPI app.'
  const email = cleanText(raw.email, 254)?.toLowerCase() ?? null
  return {
    github,
    reference,
    note: cleanText(raw.note, 300),
    email: email && EMAIL_RE.test(email) ? email : null,
  }
}

/** A stored row back into a request; anything malformed is dropped. */
export function toRequest(value: unknown): AccessRequest | null {
  const v = value as Partial<AccessRequest> | null
  if (!v || typeof v.userId !== 'string' || !USER_ID_RE.test(v.userId) || typeof v.createdAt !== 'string') return null
  const str = (x: unknown) => (typeof x === 'string' ? x : null)
  return {
    userId: v.userId,
    email: str(v.email),
    name: str(v.name),
    github: str(v.github),
    starred: typeof v.starred === 'boolean' ? v.starred : null,
    reference: str(v.reference),
    note: str(v.note),
    status: v.status === 'approved' ? 'approved' : 'pending',
    createdAt: v.createdAt,
    reviewedAt: str(v.reviewedAt),
  }
}

async function readRequest(userId: string): Promise<{ request: AccessRequest | null; error: { code?: string; message?: string } | null }> {
  const { data, error } = await supabaseAdmin.from('AppSetting').select('value').eq('key', KEY_PREFIX + userId).maybeSingle()
  if (error) return { request: null, error }
  return { request: toRequest((data as { value?: unknown } | null)?.value), error: null }
}

async function writeRequest(request: AccessRequest) {
  return supabaseAdmin
    .from('AppSetting')
    .upsert({ key: KEY_PREFIX + request.userId, value: request, updatedAt: new Date().toISOString() })
}

function unavailable(res: Response, error: { code?: string; message?: string }, what: string) {
  if (isMissingSchema(error)) {
    return res.status(503).json({ error: 'Access requests need the 2026-11-15 database migration.', code: 'migration_required' })
  }
  logger.error(`Access request ${what} failed`, { error: error.message })
  return res.status(500).json({ error: `Could not ${what} the request` })
}

// ---------------------------------------------------------------------------
// The viewer's own request
// ---------------------------------------------------------------------------

export const userAccessRequestRouter = Router()

userAccessRequestRouter.get('/access-request', requireUser, async (req: Request, res: Response) => {
  const { request, error } = await readRequest(getUserId(req)!)
  if (error) return unavailable(res, error, 'load')
  res.set('Cache-Control', 'private, no-store')
  return res.json({ request, repo: STAR_REPO })
})

userAccessRequestRouter.post('/access-request', strictRateLimiter, requireUser, async (req: Request, res: Response) => {
  if (!isAppRequest(req)) {
    return res.status(403).json({ error: 'Request Premium from the StreamVault app.', code: 'app_only' })
  }
  const userId = getUserId(req)!
  const input = parseRequestInput(req.body)
  if (typeof input === 'string') return res.status(400).json({ error: input })

  const [{ request: existing, error }, access] = await Promise.all([readRequest(userId), getUserAccess(userId)])
  if (error) return unavailable(res, error, 'save')
  if (access.premiumAccess === 'granted') return res.status(409).json({ error: 'Your account already has Premium.', code: 'already_granted' })

  try {
    await ensureUser(userId)
    const { data: profile } = await supabaseAdmin.from('User').select('email, name').eq('id', userId).maybeSingle()
    const row = profile as { email?: string | null; name?: string | null } | null
    const request: AccessRequest = {
      userId,
      email: row?.email || input.email,
      name: row?.name ?? null,
      github: input.github,
      starred: input.github ? await hasStarred(input.github) : null,
      reference: input.reference,
      note: input.note,
      status: 'pending',
      // Sending it again (say, after starring) updates it but keeps its place in the queue.
      createdAt: existing?.status === 'pending' ? existing.createdAt : new Date().toISOString(),
      reviewedAt: null,
    }
    const { error: writeError } = await writeRequest(request)
    if (writeError) return unavailable(res, writeError, 'save')
    logger.info('Premium access requested', { userId, github: request.github, starred: request.starred })
    return res.json({ request, repo: STAR_REPO })
  } catch (err: unknown) {
    logger.error('Access request failed', { error: err instanceof Error ? err.message : String(err) })
    return res.status(500).json({ error: 'Could not save the request' })
  }
})

// ---------------------------------------------------------------------------
// The admin's queue
// ---------------------------------------------------------------------------

export const adminAccessRequestRouter = Router()

export function sortRequests(requests: AccessRequest[]): AccessRequest[] {
  return [...requests].sort((a, b) =>
    a.status !== b.status ? (a.status === 'pending' ? -1 : 1) : b.createdAt.localeCompare(a.createdAt)
  )
}

adminAccessRequestRouter.get('/access-requests', requireAdminAuth, async (_req: Request, res: Response) => {
  const { data, error } = await supabaseAdmin.from('AppSetting').select('value').like('key', `${KEY_PREFIX}%`).limit(500)
  if (error) return unavailable(res, error, 'load')
  const requests = sortRequests(((data ?? []) as { value: unknown }[]).map((row) => toRequest(row.value)).filter((r): r is AccessRequest => !!r))

  // Pending requests' stars as they are now: someone may have starred after
  // asking. Answers are cached, so a refresh costs GitHub little.
  const stars = new Map<string, boolean | null>()
  await Promise.all(
    requests
      .filter((r) => r.status === 'pending' && r.github)
      .slice(0, 25)
      .map(async (r) => stars.set(r.userId, await hasStarred(r.github!)))
  )
  const ids = requests.map((r) => r.userId)
  const { data: users } = ids.length
    ? await supabaseAdmin.from('User').select('id, email, name, premiumAccess').in('id', ids)
    : { data: [] }
  const byId = new Map(((users ?? []) as { id: string; email?: string | null; name?: string | null; premiumAccess?: string }[]).map((u) => [u.id, u]))

  res.set('Cache-Control', 'private, no-store')
  return res.json({
    repo: STAR_REPO,
    requests: requests.map((r) => {
      const user = byId.get(r.userId)
      return {
        ...r,
        email: user?.email || r.email,
        name: user?.name || r.name,
        starred: stars.get(r.userId) ?? r.starred,
        premiumAccess: user?.premiumAccess ?? 'none',
      }
    }),
  })
})

adminAccessRequestRouter.post('/access-requests/:userId/approve', requireAdminAuth, async (req: Request, res: Response) => {
  const userId = String(req.params.userId)
  if (!USER_ID_RE.test(userId)) return res.status(400).json({ error: 'Invalid user id' })
  const { request, error } = await readRequest(userId)
  if (error) return unavailable(res, error, 'approve')
  if (!request) return res.status(404).json({ error: 'Request not found' })

  try {
    await ensureUser(userId)
    const { error: grantError } = await supabaseAdmin.from('User').update({ premiumAccess: 'granted' }).eq('id', userId)
    if (grantError) return unavailable(res, grantError, 'approve')
    forgetUserAccess(userId)
    const approved: AccessRequest = { ...request, status: 'approved', reviewedAt: new Date().toISOString() }
    const { error: writeError } = await writeRequest(approved)
    if (writeError) logger.warn('Premium granted, but the request could not be marked approved', { userId, error: writeError.message })
    logger.info('Premium access request approved', { userId })
    return res.json({ request: approved })
  } catch (err: unknown) {
    logger.error('Access request approval failed', { error: err instanceof Error ? err.message : String(err) })
    return res.status(500).json({ error: 'Could not approve the request' })
  }
})

adminAccessRequestRouter.delete('/access-requests/:userId', requireAdminAuth, async (req: Request, res: Response) => {
  const userId = String(req.params.userId)
  if (!USER_ID_RE.test(userId)) return res.status(400).json({ error: 'Invalid user id' })
  const { error } = await supabaseAdmin.from('AppSetting').delete().eq('key', KEY_PREFIX + userId)
  if (error) return unavailable(res, error, 'delete')
  logger.info('Premium access request deleted', { userId })
  return res.json({ ok: true })
})
