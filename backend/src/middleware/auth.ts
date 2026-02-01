import dotenv from 'dotenv'
dotenv.config() // MUST be first

import { auth } from 'express-oauth2-jwt-bearer'
import { Request, Response, NextFunction } from 'express'

let checkJwt: any

/**
 * Dev fallback when Auth0 issuer/audience are not configured.
 *
 * We still need a stable `sub` to associate data to a user.
 * - If the Bearer token is a JWT, decode its payload (NO verification) and attach it as `req.auth.payload`.
 * - If the Bearer token is opaque, use Auth0's `/userinfo` endpoint to resolve `sub`.
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

  // 1) Try JWT decode
  const parts = token.split('.')
  if (parts.length >= 2) {
    try {
      const payloadJson = Buffer.from(parts[1], 'base64url').toString('utf8')
      const payload = JSON.parse(payloadJson)

      if (payload?.sub) {
        ;(req as any).auth = { payload }
        return
      }
    } catch {
      // ignore malformed token
    }
  }

  // 2) Fallback for opaque access tokens: resolve via /userinfo
  const domain = process.env.AUTH0_DOMAIN
  if (!domain) return

  try {
    const res = await fetch(`https://${domain}/userinfo`, {
      headers: { Authorization: `Bearer ${token}` },
    })

    if (!res.ok) return

    const info = (await res.json()) as { sub?: string }
    if (info?.sub) {
      ;(req as any).auth = { payload: { sub: info.sub } }
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
  // Dev mode: skip validation, but still attach `sub` (JWT decode or /userinfo)
  checkJwt = async (req: Request, _res: Response, next: NextFunction) => {
    await attachAuthFromBearerWithoutVerification(req)
    next()
  }
}

export { checkJwt }
