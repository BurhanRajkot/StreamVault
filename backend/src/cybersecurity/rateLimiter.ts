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

/** GET /torbox/hls/:sessionId/playlist.m3u8 and /torbox/hls/:sessionId/seg_NNNNN.ts */
export const HLS_MEDIA_PATH = /^\/torbox\/hls\/[0-9a-f-]{36}\/(playlist\.m3u8|seg_\d{5}\.ts)$/i

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

  // Skip rate limiting for liveness/readiness probes only.
  //
  // This deliberately does NOT exempt static-asset extensions: this service
  // returns JSON exclusively (static files are served by the CDN), so those
  // rules matched nothing legitimate while letting any caller opt out of
  // throttling just by suffixing a path with `.png`. /cache-stats is likewise
  // no longer exempt — it is admin-authenticated, which is precisely the kind
  // of endpoint that needs a brute-force ceiling.
  //
  // TorBox HLS playlist/segment fetches are exempt too: the player makes one
  // every few seconds of video (~20 a minute), so a single movie used to
  // exhaust the budget mid-playback and every segment after that 429'd —
  // endless buffering. The pattern is exact (a session UUID plus a playlist
  // or segment name), so it can't be used to smuggle other paths past the
  // limiter, and the route answers anything else with a cheap 400/404.
  skip: (req: import('express').Request) => {
    const path = req.path
    if (path === '/' || path === '/health' || path === '/ping') return true
    return req.method === 'GET' && HLS_MEDIA_PATH.test(path)
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
