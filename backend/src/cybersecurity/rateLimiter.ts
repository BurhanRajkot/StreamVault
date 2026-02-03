/**
 * 🚦 RATE LIMITING MIDDLEWARE
 *
 * Protects the API from abuse by limiting the number of requests
 * a single IP address can make within a time window.
 *
 * Protection against:
 * - DDoS attacks (Distributed Denial of Service)
 * - Brute force attacks (password guessing)
 * - API scraping/abuse
 * - Resource exhaustion
 *
 * Configuration:
 * - windowMs: Time window in milliseconds
 * - max: Maximum requests per IP per window
 * - standardHeaders: Return rate limit info in headers
 * - skip: Routes to skip rate limiting (health checks)
 *
 * @see https://www.npmjs.com/package/express-rate-limit
 */

import rateLimit from 'express-rate-limit'

/**
 * General API rate limiter
 * 300 requests per 15 minutes per IP
 * Allows legitimate browsing while still protecting against abuse
 */
export const apiRateLimiter = rateLimit({
  // Time window: 15 minutes
  windowMs: 15 * 60 * 1000,

  // Maximum 300 requests per IP per window
  // Increased from 100 to allow legitimate browsing and favoriting
  // A user browsing 20 movies and favoriting 10 = ~50 requests
  // Plus loading images, continue watching, etc. = easily 100+ requests
  max: 300,

  // Return rate limit info in RateLimit-* headers
  standardHeaders: true,

  // Disable legacy X-RateLimit-* headers
  legacyHeaders: false,

  // Error message when limit is exceeded
  message: {
    error: 'Too many requests, please try again later.',
    retryAfter: '15 minutes'
  },

  // Skip rate limiting for health checks, cache stats, and static assets
  // These endpoints should not be throttled
  skip: (req) => {
    const path = req.path
    return (
      path === '/' ||
      path === '/health' ||
      path === '/cache-stats' ||
      path.startsWith('/static/') ||
      path.endsWith('.js') ||
      path.endsWith('.css') ||
      path.endsWith('.png') ||
      path.endsWith('.jpg') ||
      path.endsWith('.svg')
    )
  },

  // Disable validation warnings (we handle trust proxy correctly)
  validate: { trustProxy: false },
})

/**
 * Stricter rate limiter for sensitive endpoints (auth, payment)
 * 20 requests per 15 minutes per IP
 */
export const strictRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many attempts. Please wait before trying again.',
    retryAfter: '15 minutes'
  },
  validate: { trustProxy: false },
})

/**
 * Very strict limiter for login/signup endpoints
 * 5 requests per 15 minutes per IP (brute force protection)
 */
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many login attempts. Please wait 15 minutes.',
    retryAfter: '15 minutes'
  },
  validate: { trustProxy: false },
})

export default apiRateLimiter
