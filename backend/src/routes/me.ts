/**
 * The signed-in viewer's own account.
 *
 *   GET  /me/access   — what this viewer may use (Premium, suspended?)
 *   POST /me/profile  — the app sends the account's email and name after
 *                       sign-in, so the admin's Users panel can show who's who
 *
 * Both need an Auth0 token. The admin's TOTP session isn't an account; the
 * frontend knows an admin may use everything without asking.
 */

import { Router, Request, Response } from 'express'
import { requireUserAllowSuspended } from '../middleware/auth'
import { getUserId } from '../utils/auth'
import { ensureUser } from '../lib/ensureUser'
import { supabaseAdmin } from '../lib/supabase'
import { logger } from '../lib/logger'
import { decidePremium, getUserAccess, isMissingSchema, isPremiumPausedForAll } from '../lib/userAccess'
import { strictRateLimiter } from '../cybersecurity/rateLimiter'

const router = Router()

router.get('/access', requireUserAllowSuspended, async (req: Request, res: Response) => {
  const userId = getUserId(req)!
  const [access, pausedForAll] = await Promise.all([getUserAccess(userId), isPremiumPausedForAll()])
  const premium = decidePremium({ admin: false, signedIn: true, access, pausedForAll })
  res.set('Cache-Control', 'private, no-store')
  return res.json({ premium: premium === 'granted', premiumReason: premium, suspended: access.suspended })
})

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/

/** Clean a display string: printable, single-spaced, capped. */
function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  // eslint-disable-next-line no-control-regex
  const text = value.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, max)
  return text || null
}

router.post('/profile', strictRateLimiter, requireUserAllowSuspended, async (req: Request, res: Response) => {
  const userId = getUserId(req)!
  const body = (req.body ?? {}) as { email?: unknown; name?: unknown }
  const email = cleanText(body.email, 254)
  const name = cleanText(body.name, 120)
  if (email !== null && !EMAIL_RE.test(email)) return res.status(400).json({ error: 'Invalid email' })

  try {
    await ensureUser(userId)
    const { error } = await supabaseAdmin
      .from('User')
      .update({ email: email?.toLowerCase() ?? null, name, lastSeenAt: new Date().toISOString() })
      .eq('id', userId)
    if (error && !isMissingSchema(error)) throw new Error(error.message)
    return res.status(204).end()
  } catch (err: unknown) {
    logger.warn('Profile update failed', { error: err instanceof Error ? err.message : String(err) })
    return res.status(500).json({ error: 'Could not save profile' })
  }
})

export default router
