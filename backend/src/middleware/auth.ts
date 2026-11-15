import '../lib/loadEnv'

import { auth } from 'express-oauth2-jwt-bearer'
import type { AuthResult } from 'express-oauth2-jwt-bearer'
import { Request, Response, NextFunction, RequestHandler } from 'express'

let checkJwt: RequestHandler | ((...args: unknown[]) => Promise<void>)

/**
 * Dev fallback when Auth0 issuer/audience are not configured.
 *
 * We still need a stable `sub` to associate data to a user.
 * - Use Auth0's `/userinfo` endpoint to securely resolve `sub` with the Bearer token.
 *
 * Routes should enforce auth by checking `req.auth?.payload.sub`.
 */
function getBearerToken(req: Request): string | undefined {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) return
  return header.slice('Bearer '.length).trim()
}

async function attachAuthFromBearerWithoutVerification(req: Request) {
  const token = getBearerToken(req)
  if (!token) return

  // Fallback for access tokens: resolve via /userinfo
  const domain = process.env.AUTH0_DOMAIN
  if (!domain) return

  try {
    const res = await fetch(`https://${domain}/userinfo`, {
      headers: { Authorization: `Bearer ${token}` },
    })

    if (!res.ok) return

    const info = (await res.json()) as { sub?: string }
    if (info?.sub) {
      // Dev-only: we only need `sub`; cast to satisfy the full VerifyJwtResult shape.
      ;(req as Request & { auth?: AuthResult }).auth = {
        payload: { sub: info.sub },
        header: {},
        token: '',
      } as AuthResult
    }
  } catch {
    // ignore
  }
}

if (process.env.AUTH0_ISSUER_BASE_URL && process.env.AUTH0_AUDIENCE) {
  checkJwt = auth({
    issuerBaseURL: process.env.AUTH0_ISSUER_BASE_URL,
    audience: process.env.AUTH0_AUDIENCE,
  })
} else {
  // ⚠️  SAFETY GUARD: never allow unverified tokens in production.
  // If AUTH0_ISSUER_BASE_URL / AUTH0_AUDIENCE are missing in a production
  // environment, fail hard at startup rather than silently accepting any JWT.
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      '[auth] FATAL: AUTH0_ISSUER_BASE_URL and AUTH0_AUDIENCE must be set in production. ' +
      'The unverified-JWT dev fallback is NOT safe for production use.'
    )
  }

  // Dev mode only: skip validation, but still attach `sub` (via /userinfo fallback)
  checkJwt = async (req: Request, _res: Response, next: NextFunction) => {
    await attachAuthFromBearerWithoutVerification(req)
    next()
  }
}

import { getUserId } from '../utils/auth'
import { getUserAccess, touchUser } from '../lib/userAccess'

/**
 * A signed-in viewer's routes: the Auth0 check, then the admin's controls —
 * a suspended account is refused (403, `code: 'account_suspended'`) — and
 * the account's "last seen" for the dashboard.
 */
function signedInUser({ allowSuspended }: { allowSuspended: boolean }): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    ;(checkJwt as RequestHandler)(req, res, (err?: unknown) => {
      if (err) return next(err)
      const userId = getUserId(req)
      if (!userId) return res.status(401).json({ error: 'Unauthorized' })
      touchUser(userId)
      if (allowSuspended) return next()
      getUserAccess(userId).then((access) => {
        if (access.suspended) {
          return res.status(403).json({ error: 'This account has been suspended.', code: 'account_suspended' })
        }
        next()
      }, next)
    })
  }
}

/** Every signed-in feature (My List, continue watching, recommendations, ...). */
export const requireUser = signedInUser({ allowSuspended: false })

/** For the one route that has to answer a suspended account too: "what may I do?". */
export const requireUserAllowSuspended = signedInUser({ allowSuspended: true })

export { checkJwt }
