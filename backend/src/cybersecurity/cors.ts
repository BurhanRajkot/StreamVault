/**
 * CORS (Cross-Origin Resource Sharing) MIDDLEWARE
 *
 * CORS is a security feature that restricts web pages from making requests
 * to a different domain than the one that served the original page.
 *
 * Configuration:
 * - origin: Which domains can access the API
 * - credentials: Allow cookies/auth headers to be sent
 * - methods: Allowed HTTP methods
 * - allowedHeaders: Headers the client can send
 * - exposedHeaders: Headers the client can read from response
 * - maxAge: How long to cache preflight responses
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS
 */

import cors from 'cors'

/**
 * Main CORS middleware configuration
 * Production: Whitelists specific domains
 * Development: Allows all origins for easier testing
 */
export const corsMiddleware = cors({
  origin: (origin, callback) => {
    const isDevelopment = process.env.NODE_ENV !== 'production'

    // In development, allow all origins (including no-origin for Postman/curl)
    if (isDevelopment) {
      return callback(null, true)
    }

    // Production: Whitelist specific domains
    const allowedOrigins = [
      process.env.FRONTEND_URL,
      'https://stream-vault-7u6q.vercel.app', // Vercel production
      'https://streamvault-backend-bq9p.onrender.com', // Render backend (for admin panel)
      // Add any preview/staging URLs as needed
    ].filter(Boolean) // Remove undefined values

    // Production: block requests with no Origin (Postman, curl, server-to-server).
    // All legitimate browser requests always include the Origin header.
    // If you need server-to-server calls in production, use a dedicated service key instead.
    if (!origin) {
      return callback(new Error('CORS policy: Requests without an Origin are not allowed in production'))
    }

    if (allowedOrigins.includes(origin)) {
      callback(null, true)
    } else {
      callback(new Error(`CORS policy: Origin ${origin} is not allowed`))
    }
  },

  // Allow cookies and authentication headers
  credentials: true,

  // Allowed HTTP methods
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS', 'PUT', 'PATCH'],

  // Headers the client is allowed to send
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],

  // Headers the client can read from the response
  exposedHeaders: ['Content-Length', 'X-Request-Id'],

  // Cache preflight responses for 7 days (604800s) - reduces OPTIONS requests significantly
  maxAge: 604800,
})

/**
 * Preflight handler for OPTIONS requests
 * Required for complex requests (POST with JSON, custom headers, etc.)
 * Uses the same origin whitelist as corsMiddleware — no open wildcards.
 */
export const corsPreflightHandler = corsMiddleware

export default corsMiddleware
