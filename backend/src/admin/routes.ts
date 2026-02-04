/**
 * 🔑 ADMIN API ROUTES - DAILY CODE SYSTEM
 *
 * Endpoints for admin authentication using daily auto-generated codes.
 *
 * Routes:
 * - POST /admin/login - Authenticate with daily code
 * - POST /admin/verify - Verify admin token validity
 * - POST /admin/logout - Logout admin (client-side token removal)
 * - GET /admin/today-code - Get today's code (DEBUG ONLY)
 *
 * Security:
 * - Strict rate limiting (3 attempts per 15 minutes)
 * - IP-based brute force protection (5 failed = 15min block)
 * - Failed attempt logging
 * - Daily rotating codes
 */

import { Router, Request, Response } from 'express'
import rateLimit from 'express-rate-limit'
import { validateAdminCode, generateAdminToken, isAdminConfigured, getTodayCodeForDebug } from './auth'
import { requireAdminAuth } from './middleware'

const router = Router()

// Track failed login attempts by IP for additional security
const failedAttempts = new Map<string, { count: number; lastAttempt: number }>()

// Strict rate limiter for admin login endpoint
// 3 attempts per 15 minutes per IP
const adminLoginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 3, // 3 attempts
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many login attempts',
    message: 'Please wait 15 minutes before trying again',
    retryAfter: '15 minutes',
  },
  validate: { trustProxy: false },
})

/**
 * Clean up old failed attempt records (older than 1 hour)
 */
function cleanupFailedAttempts() {
  const oneHourAgo = Date.now() - 60 * 60 * 1000

  for (const [ip, data] of failedAttempts.entries()) {
    if (data.lastAttempt < oneHourAgo) {
      failedAttempts.delete(ip)
    }
  }
}

// Clean up every 10 minutes
setInterval(cleanupFailedAttempts, 10 * 60 * 1000)

/**
 * Check if IP is temporarily blocked due to too many failed attempts
 */
function isIPBlocked(ip: string): boolean {
  const attempts = failedAttempts.get(ip)

  if (!attempts) return false

  // Block after 5 failed attempts
  if (attempts.count >= 5) {
    const blockDuration = 15 * 60 * 1000 // 15 minutes
    const timeSinceLastAttempt = Date.now() - attempts.lastAttempt

    if (timeSinceLastAttempt < blockDuration) {
      return true
    } else {
      // Block expired, reset counter
      failedAttempts.delete(ip)
      return false
    }
  }

  return false
}

/**
 * Record failed login attempt
 */
function recordFailedAttempt(ip: string) {
  const existing = failedAttempts.get(ip)

  if (existing) {
    existing.count++
    existing.lastAttempt = Date.now()
  } else {
    failedAttempts.set(ip, {
      count: 1,
      lastAttempt: Date.now(),
    })
  }

  console.warn(`⚠️ Failed admin login attempt from IP: ${ip} (${failedAttempts.get(ip)?.count} attempts)`)
}

/**
 * POST /admin/login
 * Authenticate admin with daily code
 */
router.post('/login', adminLoginRateLimiter, async (req: Request, res: Response) => {
  try {
    // Check if admin system is configured
    if (!isAdminConfigured()) {
      return res.status(503).json({
        error: 'Service unavailable',
        message: 'Admin authentication is not configured',
      })
    }

    const { code } = req.body

    // Validate input
    if (!code) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'Admin code is required',
      })
    }

    // Get client IP
    const clientIP = (req.ip || req.socket.remoteAddress || 'unknown').toString()

    // Check if IP is blocked
    if (isIPBlocked(clientIP)) {
      console.warn(`🚫 Blocked login attempt from IP: ${clientIP}`)
      return res.status(429).json({
        error: 'Too many failed attempts',
        message: 'Your IP has been temporarily blocked. Please try again later.',
      })
    }

    // Validate code
    const isValid = validateAdminCode(code)

    if (!isValid) {
      // Record failed attempt
      recordFailedAttempt(clientIP)

      // Generic error message
      return res.status(401).json({
        error: 'Authentication failed',
        message: 'Invalid admin code',
      })
    }

    // Success - clear failed attempts for this IP
    failedAttempts.delete(clientIP)

    // Generate JWT token
    const token = generateAdminToken()

    console.log(`✅ Admin login successful from IP: ${clientIP}`)

    return res.status(200).json({
      success: true,
      token,
      expiresIn: '30m',
    })
  } catch (error) {
    console.error('Admin login error:', error)
    return res.status(500).json({
      error: 'Server error',
      message: 'An error occurred during authentication',
    })
  }
})

/**
 * GET /admin/today-code (DEBUG ONLY - Disabled in production)
 * Returns today's code for testing
 */
router.get('/today-code', (req: Request, res: Response) => {
  // Only allow in development
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ error: 'Not found' })
  }

  const code = getTodayCodeForDebug()
  return res.json({
    code,
    date: new Date().toLocaleDateString(),
    note: 'This endpoint is only available in development mode',
  })
})

/**
 * POST /admin/verify
 * Verify admin token validity
 */
router.post('/verify', requireAdminAuth, (req: Request, res: Response) => {
  // If middleware passes, token is valid
  return res.status(200).json({
    valid: true,
    admin: req.admin,
  })
})

/**
 * POST /admin/logout
 * Logout admin (client handles token removal)
 */
router.post('/logout', (req: Request, res: Response) => {
  // Token invalidation happens client-side
  // This endpoint exists for consistency and future server-side session management
  return res.status(200).json({
    success: true,
    message: 'Logged out successfully',
  })
})

export default router
