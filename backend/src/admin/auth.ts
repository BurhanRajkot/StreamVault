import jwt from 'jsonwebtoken'

// Validate required environment variables
if (!process.env.ADMIN_SECRET && !process.env.ADMIN_SECRET_CODE) {
  throw new Error('ADMIN_SECRET or ADMIN_SECRET_CODE environment variable is required')
}

if (!process.env.ADMIN_JWT_SECRET) {
  throw new Error('ADMIN_JWT_SECRET environment variable is required')
}

const ADMIN_SECRET = parseInt(process.env.ADMIN_SECRET || process.env.ADMIN_SECRET_CODE!)
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
  return (day * month * year * ADMIN_SECRET).toString()
}

export function validateAdminCode(code: string): boolean {
  try {
    // Input validation: prevent DoS and timing attacks
    if (!code || typeof code !== 'string') return false
    if (code.length > 50) return false // Reasonable max length
    if (!/^[\d\s-]+$/.test(code)) return false // Only digits, spaces, hyphens

    const cleanCode = code.replace(/[\s-]/g, '')

    // Prevent empty codes after cleaning
    if (!cleanCode) return false

    const now = new Date()

    if (cleanCode === getCodeForDate(now)) return true

    const yesterday = new Date(now)
    yesterday.setDate(yesterday.getDate() - 1)
    if (cleanCode === getCodeForDate(yesterday)) return true

    const tomorrow = new Date(now)
    tomorrow.setDate(tomorrow.getDate() + 1)
    if (cleanCode === getCodeForDate(tomorrow)) return true

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
