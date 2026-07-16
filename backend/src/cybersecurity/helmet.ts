/**
 * 🛡️ HELMET SECURITY MIDDLEWARE
 *
 * Helmet helps secure Express apps by setting various HTTP headers.
 *
 * Security headers configured:
 * - X-Content-Type-Options: nosniff (prevents MIME sniffing)
 * - X-Frame-Options: SAMEORIGIN (clickjacking protection)
 * - X-XSS-Protection: 0 (disabled - modern browsers handle this)
 * - Strict-Transport-Security (HSTS for HTTPS enforcement)
 * - Content-Security-Policy (CSP to prevent XSS attacks)
 * - X-Download-Options: noopen (IE8+ download protection)
 * - X-Permitted-Cross-Domain-Policies: none (Adobe product policies)
 * - Referrer-Policy: no-referrer (controls referrer information)
 *
 * @see https://helmetjs.github.io/
 */

import helmet from 'helmet'

const isProduction = process.env.NODE_ENV === 'production'

export const helmetMiddleware = helmet({
  // COEP disabled intentionally — required for cross-origin video player embeds
  // (peachify, vidup, 2embed, vidfast, vidlink, vidsrc, videasy, etc.)
  // lgtm[js/helmet-disable-security]
  crossOriginEmbedderPolicy: false,

  // Configure Referrer-Policy to allow domain verification for embedded players
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },

  // Content Security Policy - prevents XSS attacks
  // NOTE: This backend CSP is intentionally disabled. The frontend (Vercel/Netlify)
  // enforces CSP via deployment configs. Backend responses don't need CSP headers
  // because they serve JSON APIs, not HTML pages.
  contentSecurityPolicy: false, // Disabled - frontend handles CSP

  // HTTP Strict Transport Security - Force HTTPS
  hsts: isProduction ? {
    maxAge: 31536000, // 1 year in seconds
    includeSubDomains: true,
    preload: true,
  } : false, // Disable in development (localhost uses HTTP)

  // Additional security options (enabled by default):
  // - dnsPrefetchControl: controls DNS prefetching
  // - frameguard: prevents clickjacking
  // - hidePoweredBy: removes X-Powered-By header
  // - ieNoOpen: IE8+ download protection
  // - noSniff: prevents MIME sniffing
  // - xssFilter: XSS filter (disabled in modern Helmet)
})

export default helmetMiddleware
