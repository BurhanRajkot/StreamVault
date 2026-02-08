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

    // In development, allow all origins
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

    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) {
      return callback(null, true)
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
 */
export const corsPreflightHandler = cors()

export default corsMiddleware
