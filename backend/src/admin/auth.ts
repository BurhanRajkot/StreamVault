import jwt from 'jsonwebtoken'
import { authenticator } from 'otplib'

// Validate required environment variables
if (!process.env.ADMIN_TOTP_SECRET) {
  throw new Error('ADMIN_TOTP_SECRET environment variable is required')
}

if (!process.env.ADMIN_JWT_SECRET) {
  throw new Error('ADMIN_JWT_SECRET environment variable is required')
}

const ADMIN_TOTP_SECRET = process.env.ADMIN_TOTP_SECRET
const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET

// 30m made sense for a "verify a code, do one admin task" session, but the
// site owner uses this token as their everyday logged-in state — browsing,
// watching, streaming — where the frontend has no refresh flow. Once it
// expired mid-session, the token stayed in localStorage (still "present", so
// isAdminAuthenticated() kept reporting true) while every actual API call
// silently fell through to the regular Auth0/guest path and got hit with
// consumer-facing "sign in" / "upgrade to premium" errors — confusing for
// someone who should have unrestricted access. A long-lived token here still
// requires the TOTP secret to obtain in the first place; this just makes the
// resulting session actually last as long as normal usage does.
export const TOKEN_EXPIRATION = '30d'

// Tolerate one 30s step of clock drift on either side of the current one.
authenticator.options = { window: 1 }

export interface AdminTokenPayload {
  role: 'admin'
  iat?: number
  exp?: number
}

export function validateAdminCode(code: string): boolean {
  try {
    if (!code || typeof code !== 'string') return false
    if (!/^\d{6}$/.test(code.trim())) return false

    return authenticator.verify({ token: code.trim(), secret: ADMIN_TOTP_SECRET })
  } catch (_error) {
    return false
  }
}

export function generateAdminToken(): string {
  const payload: AdminTokenPayload = {
    role: 'admin',
  }

  return jwt.sign(payload, ADMIN_JWT_SECRET, {
    expiresIn: TOKEN_EXPIRATION,
  })
}

export function verifyAdminToken(token: string): AdminTokenPayload | null {
  try {
    const decoded = jwt.verify(token, ADMIN_JWT_SECRET) as AdminTokenPayload

    if (decoded.role !== 'admin') {
      return null
    }

    return decoded
  } catch (_error) {
    return null
  }
}

export function isAdminConfigured(): boolean {
  return !!(ADMIN_TOTP_SECRET && ADMIN_JWT_SECRET)
}
