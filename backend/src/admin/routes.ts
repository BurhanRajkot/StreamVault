import { Router, Request, Response } from 'express'
import rateLimit from 'express-rate-limit'
import { validateAdminCode, generateAdminToken, isAdminConfigured } from './auth'
import { requireAdminAuth } from './middleware'

const router = Router()

const failedAttempts = new Map<string, { count: number; lastAttempt: number }>()

const adminLoginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many login attempts',
    message: 'Please wait 15 minutes before trying again',
    retryAfter: '15 minutes',
  },
  validate: { trustProxy: false },
})

function cleanupFailedAttempts() {
  const oneHourAgo = Date.now() - 60 * 60 * 1000

  for (const [ip, data] of failedAttempts.entries()) {
    if (data.lastAttempt < oneHourAgo) {
      failedAttempts.delete(ip)
    }
  }
}

setInterval(cleanupFailedAttempts, 10 * 60 * 1000)

function isIPBlocked(ip: string): boolean {
  const attempts = failedAttempts.get(ip)

  if (!attempts) return false

  if (attempts.count >= 5) {
    const blockDuration = 15 * 60 * 1000
    const timeSinceLastAttempt = Date.now() - attempts.lastAttempt

    if (timeSinceLastAttempt < blockDuration) {
      return true
    } else {
      failedAttempts.delete(ip)
      return false
    }
  }

  return false
}

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
}

router.post('/login', adminLoginRateLimiter, async (req: Request, res: Response) => {
  try {
    if (!isAdminConfigured()) {
      return res.status(503).json({
        error: 'Service unavailable',
        message: 'Admin authentication is not configured',
      })
    }

    const { code } = req.body

    if (!code) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'Admin code is required',
      })
    }

    const clientIP = (req.ip || req.socket.remoteAddress || 'unknown').toString()

    if (isIPBlocked(clientIP)) {
      return res.status(429).json({
        error: 'Too many failed attempts',
        message: 'Your IP has been temporarily blocked. Please try again later.',
      })
    }

    const isValid = validateAdminCode(code)

    if (!isValid) {
      recordFailedAttempt(clientIP)

      return res.status(401).json({
        error: 'Authentication failed',
        message: 'Invalid admin code',
      })
    }

    failedAttempts.delete(clientIP)

    const token = generateAdminToken()

    return res.status(200).json({
      success: true,
      token,
      expiresIn: '30m',
    })
  } catch (error) {
    return res.status(500).json({
      error: 'Server error',
      message: 'An error occurred during authentication',
    })
  }
})

router.post('/verify', requireAdminAuth, (req: Request, res: Response) => {
  return res.status(200).json({
    valid: true,
    admin: req.admin,
  })
})

router.post('/logout', (req: Request, res: Response) => {
  return res.status(200).json({
    success: true,
    message: 'Logged out successfully',
  })
})

export default router
