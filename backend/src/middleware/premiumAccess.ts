import { Request, Response, NextFunction, RequestHandler } from 'express'
import jwt from 'jsonwebtoken'
import { verifyAdminToken } from '../admin/auth'
import { checkJwt } from './auth'
import { getUserId } from '../utils/auth'
import { isAppRequest, isOutdatedApp } from '../lib/clientKind'
import { decidePremium, getUserAccess, isPremiumPausedForAll, touchUser, type PremiumDecision } from '../lib/userAccess'

/** What a refused viewer is told, by reason — the player shows the `code`'s own screen. */
const REFUSALS: Record<Exclude<PremiumDecision, 'granted'>, { status: number; error: string }> = {
  'sign-in-required': { status: 401, error: 'Premium needs an approved account or the admin sign-in.' },
  'not-approved': { status: 403, error: "Your account doesn't have Premium access." },
  paused: { status: 403, error: 'Your Premium access is paused.' },
  'paused-for-all': { status: 403, error: 'Premium is paused right now.' },
  suspended: { status: 403, error: 'This account has been suspended.' },
  'app-only': { status: 403, error: 'Your Premium plays in the StreamVault app — open it there.' },
  'update-required': { status: 403, error: 'Update the StreamVault app to keep using Premium.' },
}

function refuse(res: Response, decision: Exclude<PremiumDecision, 'granted'>) {
  const { status, error } = REFUSALS[decision]
  return res.status(status).json({ error, code: `premium_${decision.replace(/-/g, '_')}` })
}

/**
 * The ⚡ Premium gate: the admin (TOTP sign-in) always; otherwise a signed-in
 * account the admin granted Premium in the dashboard, while it isn't paused,
 * suspended, or Premium paused for everyone — and only from the app. See
 * lib/userAccess and lib/clientKind.
 */
export const requirePremiumAccess: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) return refuse(res, 'sign-in-required')
  const token = header.slice('Bearer '.length).trim()

  const admin = verifyAdminToken(token)
  if (admin) {
    req.admin = admin
    return next()
  }
  // An HS256 token that failed admin verification (expired, rotated secret)
  // can't be an Auth0 token either; Auth0's verifier would throw on it.
  const alg = jwt.decode(token, { complete: true })?.header?.alg
  if (alg && /^HS(256|384|512)$/.test(alg)) {
    return res.status(401).json({ error: 'Your admin session has expired. Sign in again.', code: 'admin_session_expired' })
  }

  ;(checkJwt as RequestHandler)(req, res, (err?: unknown) => {
    if (err) return next(err)
    const userId = getUserId(req)
    if (!userId) return refuse(res, 'sign-in-required')
    touchUser(userId)
    Promise.all([getUserAccess(userId), isPremiumPausedForAll()]).then(([access, pausedForAll]) => {
      const decision = decidePremium({ admin: false, signedIn: true, access, pausedForAll, fromApp: isAppRequest(req), outdatedApp: isOutdatedApp(req) })
      if (decision === 'granted') return next()
      return refuse(res, decision)
    }, next)
  })
}
