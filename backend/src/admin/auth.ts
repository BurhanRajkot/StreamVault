import jwt from 'jsonwebtoken'
import crypto from 'crypto'

// Validate required environment variables
if (!process.env.ADMIN_SECRET && !process.env.ADMIN_SECRET_CODE) {
  throw new Error('ADMIN_SECRET or ADMIN_SECRET_CODE environment variable is required')
}

if (!process.env.ADMIN_JWT_SECRET) {
  throw new Error('ADMIN_JWT_SECRET environment variable is required')
}

const ADMIN_SECRET = process.env.ADMIN_SECRET || process.env.ADMIN_SECRET_CODE!
const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET

const TOKEN_EXPIRATION = '30m'

export interface AdminTokenPayload {
  role: 'admin'
  iat?: number
  exp?: number
}

const getCodeForDate = (date: Date): string => {
  const day = date.getDate()
  const month = date.getMonth() + 1
  const year = date.getFullYear()
  // Use a stable date format for the HMAC message
  const dateString = `${year}-${month}-${day}`
  return crypto.createHmac('sha256', ADMIN_SECRET).update(dateString).digest('hex')
}

export function validateAdminCode(code: string): boolean {
  try {
    // Input validation: prevent DoS and timing attacks
    if (!code || typeof code !== 'string') return false
    if (code.length > 128) return false // Increased for HMAC hex string
    if (!/^[0-9a-fA-F\s-]+$/.test(code)) return false // Hex digits, spaces, hyphens

    const cleanCode = code.replace(/[\s-]/g, '').toLowerCase()

    // Prevent empty codes after cleaning
    if (!cleanCode) return false

    const now = new Date()

    const codesToTry = [
      getCodeForDate(now),
      getCodeForDate(new Date(now.getTime() - 24 * 60 * 60 * 1000)), // yesterday
      getCodeForDate(new Date(now.getTime() + 24 * 60 * 60 * 1000)), // tomorrow
    ]

    const inputBuffer = Buffer.from(cleanCode)

    for (const validCode of codesToTry) {
      const validBuffer = Buffer.from(validCode)
      if (inputBuffer.length === validBuffer.length && crypto.timingSafeEqual(inputBuffer, validBuffer)) {
        return true
      }
    }

    return false
  } catch (error) {
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
  } catch (error) {
    return null
  }
}

export function isAdminConfigured(): boolean {
  return !!(ADMIN_SECRET && ADMIN_JWT_SECRET)
}
