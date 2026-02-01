/**
 * 🔐 CYBERSECURITY MODULE
 *
 * This module exports all security-related middleware for the StreamVault API.
 *
 * Security Layers:
 * 1. Helmet - HTTP security headers
 * 2. CORS - Cross-origin request protection
 * 3. Rate Limiting - Request throttling
 *
 * Usage in main app:
 * ```typescript
 * import { helmetMiddleware, corsMiddleware, apiRateLimiter } from './cybersecurity'
 *
 * app.use(helmetMiddleware)
 * app.use(corsMiddleware)
 * app.use(apiRateLimiter)
 * ```
 *
 * Additional Security Recommendations:
 * - Use HTTPS in production (handled by Render/Vercel)
 * - Validate and sanitize all user inputs
 * - Use parameterized queries (Supabase handles this)
 * - Keep dependencies updated (npm audit)
 * - Implement proper authentication (Supabase Auth)
 * - Log security events for monitoring
 */

// HTTP Security Headers
export { helmetMiddleware } from './helmet'

// CORS Configuration
export { corsMiddleware, corsPreflightHandler } from './cors'

// Rate Limiting
export {
  apiRateLimiter,
  strictRateLimiter,
  authRateLimiter
} from './rateLimiter'
