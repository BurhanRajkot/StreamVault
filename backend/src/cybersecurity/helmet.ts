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
 * - X-Download-Options: noopen (IE8+ download protection)
 * - X-Permitted-Cross-Domain-Policies: none (Adobe product policies)
 * - Referrer-Policy: no-referrer (controls referrer information)
 *
 * @see https://helmetjs.github.io/
 */

import helmet from 'helmet'

export const helmetMiddleware = helmet({
  // Allow iframe embeds for video player
  crossOriginEmbedderPolicy: false,

  // We handle CSP in frontend _headers file
  contentSecurityPolicy: false,

  // Additional security options (enabled by default):
  // - dnsPrefetchControl: controls DNS prefetching
  // - frameguard: prevents clickjacking
  // - hidePoweredBy: removes X-Powered-By header
  // - hsts: HTTP Strict Transport Security
  // - ieNoOpen: IE8+ download protection
  // - noSniff: prevents MIME sniffing
  // - xssFilter: XSS filter (disabled in modern Helmet)
})

export default helmetMiddleware
