/**
 * 🌐 CORS (Cross-Origin Resource Sharing) MIDDLEWARE
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
 * Allows requests from any origin (for public API access)
 */
export const corsMiddleware = cors({
  origin: (origin, callback) => {
    // Allow all origins (including no origin for direct API access)
    // In production, you might want to whitelist specific domains:
    // const allowedOrigins = ['https://yourdomain.com', 'https://staging.yourdomain.com']
    // if (!origin || allowedOrigins.includes(origin)) callback(null, true)
    // else callback(new Error('CORS not allowed'))

    console.log(`📡 CORS request from origin: ${origin || 'direct access'}`)
    callback(null, true)
  },

  // Allow cookies and authentication headers
  credentials: true,

  // Allowed HTTP methods
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS', 'PUT', 'PATCH'],

  // Headers the client is allowed to send
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],

  // Headers the client can read from the response
  exposedHeaders: ['Content-Length', 'X-Request-Id'],

  // Cache preflight responses for 24 hours (reduces OPTIONS requests)
  maxAge: 86400,
})

/**
 * Preflight handler for OPTIONS requests
 * Required for complex requests (POST with JSON, custom headers, etc.)
 */
export const corsPreflightHandler = cors()

export default corsMiddleware
