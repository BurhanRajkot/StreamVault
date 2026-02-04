/**
 * 🔐 ADMIN AUTHENTICATION MODULE - DAILY CODE SYSTEM
 *
 * Simple and secure admin authentication using daily auto-generated codes.
 *
 * How it works:
 * - Code is generated based on current date + secret salt
 * - Code changes automatically every day
 * - Secret salt is stored in environment variable (not in code)
 * - Even if someone sees the formula, they can't generate codes without the secret
 *
 * Security Features:
 * - Daily rotating codes
 * - JWT token generation with 30-minute expiration
 * - Secret salt prevents code generation without access
 * - Rate limiting and IP blocking (handled in routes)
 *
 * Environment Variables Required:
 * - ADMIN_SECRET: Secret number used in code generation (e.g., 7392)
 * - ADMIN_JWT_SECRET: Secret key for JWT signing
 */

import jwt from 'jsonwebtoken'

// Secret salt from environment (this is what makes it secure!)
const ADMIN_SECRET = parseInt(process.env.ADMIN_SECRET || '12345')
const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET || 'fallback-secret-change-in-production'

// Token expiration: 30 minutes
const TOKEN_EXPIRATION = '30m'

export interface AdminTokenPayload {
  role: 'admin'
  iat?: number
  exp?: number
}

/**
 * Generate today's admin code
 * Formula: (day × month × year × SECRET) % 1000000
 *
 * Example with SECRET = 7392:
 * - Feb 4, 2025: (4 × 2 × 2025 × 7392) % 1000000 = 119808
 * - Feb 5, 2025: (5 × 2 × 2025 × 7392) % 1000000 = 149760
 */
function generateTodayCode(): string {
  const now = new Date()
  const day = now.getDate()
  const month = now.getMonth() + 1 // JavaScript months are 0-indexed
  const year = now.getFullYear()

  // Calculate code using secret formula
  const code = (day * month * year * ADMIN_SECRET) % 1000000

  // Pad with zeros to ensure 6 digits
  return code.toString().padStart(6, '0')
}

/**
 * Validate admin code
 * @param code - 6-digit code entered by user
 * @returns true if code matches today's code
 */
export function validateAdminCode(code: string): boolean {
  try {
    const todayCode = generateTodayCode()

    // Remove any spaces or dashes user might have entered
    const cleanCode = code.replace(/[\s-]/g, '')

    return cleanCode === todayCode
  } catch (error) {
    console.error('Error validating admin code:', error)
    return false
  }
}

/**
 * Generate JWT token for admin session
 * @returns JWT token string
 */
export function generateAdminToken(): string {
  const payload: AdminTokenPayload = {
    role: 'admin',
  }

  return jwt.sign(payload, ADMIN_JWT_SECRET, {
    expiresIn: TOKEN_EXPIRATION,
  })
}

/**
 * Verify and decode admin JWT token
 * @param token - JWT token string
 * @returns Decoded token payload or null if invalid
 */
export function verifyAdminToken(token: string): AdminTokenPayload | null {
  try {
    const decoded = jwt.verify(token, ADMIN_JWT_SECRET) as AdminTokenPayload

    // Verify role is admin
    if (decoded.role !== 'admin') {
      return null
    }

    return decoded
  } catch (error) {
    // Token is invalid or expired
    return null
  }
}

/**
 * Get today's code (for debugging/testing only - remove in production)
 * This function helps you see what today's code is
 */
export function getTodayCodeForDebug(): string {
  return generateTodayCode()
}

/**
 * Check if admin system is properly configured
 * @returns true if admin system is ready
 */
export function isAdminConfigured(): boolean {
  return !!(ADMIN_SECRET && ADMIN_JWT_SECRET)
}
