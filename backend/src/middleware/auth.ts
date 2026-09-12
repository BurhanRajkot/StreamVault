import '../lib/loadEnv'

import { auth } from 'express-oauth2-jwt-bearer'
import type { AuthResult } from 'express-oauth2-jwt-bearer'
import { Request, Response, NextFunction, RequestHandler } from 'express'
import jwt from 'jsonwebtoken'

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

import { verifyAdminToken, AdminTokenPayload } from '../admin/auth'

// Extend Express Request type to include admin payload
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      admin?: AdminTokenPayload
    }
  }
}

/**
 * Unified Authentication Middleware
 *
 * 1. Checks for Admin Token (HS256) first.
 *    - If valid, sets req.admin and calls next().
 *    - Skips Auth0 check contentiously to avoid "Invalid alg" errors.
 *
 * 2. If not Admin, falls back to Auth0 (RS256).
 *    - Sets req.auth on success.
 *    - Returns 401 on failure (via checkJwt).
 */
export async function checkAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization
  if (header?.startsWith('Bearer ')) {
    const token = header.slice('Bearer '.length).trim()

    // 1. Try Admin Token
    const adminPayload = verifyAdminToken(token)
    if (adminPayload) {
      req.admin = adminPayload
      return next()
    }

    // Admin tokens are always HS256. If this token was signed with a
    // symmetric algorithm but failed verification above (expired, wrong
    // secret, wrong role), it can never be a valid Auth0 access token —
    // Auth0's JWKS-based verifier only supports asymmetric algorithms and
    // throws an "Unsupported algorithm" error rather than a clean 401 if we
    // hand it one. Reject it here instead of falling through to checkJwt.
    const decoded = jwt.decode(token, { complete: true })
    const alg = decoded?.header?.alg
    if (alg && /^HS(256|384|512)$/.test(alg)) {
      return res.status(401).json({
        error: 'Authentication failed',
        message: 'Invalid or expired admin token',
      })
    }
  }

  // 2. Fallback to Auth0
  return checkJwt(req, res, next)
}

export { checkJwt }
