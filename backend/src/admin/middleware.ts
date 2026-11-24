/**
 * 🛡️ ADMIN AUTHENTICATION MIDDLEWARE
 *
 * Middleware to verify admin JWT tokens and protect admin-only routes.
 *
 * Usage:
 * - Apply to routes that require admin authentication
 * - Attaches admin payload to req.admin if token is valid
 * - Returns 401 if token is missing or invalid
 */

import { Request, Response, NextFunction } from 'express'
import { verifyAdminToken, AdminTokenPayload } from './auth'

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
 * Extract Bearer token from Authorization header
 */
function extractBearerToken(req: Request): string | null {
  const authHeader = req.headers.authorization

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null
  }

  return authHeader.substring(7) // Remove 'Bearer ' prefix
}

/**
 * Middleware to verify admin authentication
 * Checks for valid admin JWT token in Authorization header
 */
export function requireAdminAuth(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const token = extractBearerToken(req)

  if (!token) {
    res.status(401).json({
      error: 'Authentication required',
      message: 'Admin token missing',
    })
    return
  }

  const payload = verifyAdminToken(token)

  if (!payload) {
    res.status(401).json({
      error: 'Authentication failed',
      message: 'Invalid or expired admin token',
    })
    return
  }

  // Attach admin payload to request
  req.admin = payload
  next()
}
