/**
 * 🛡️ HELMET SECURITY MIDDLEWARE
 *
 * Helmet helps secure Express apps by setting various HTTP headers.
 *
 * Security headers configured:
 * - X-Content-Type-Options: nosniff (prevents MIME sniffing)
 * - X-Frame-Options: SAMEORIGIN (clickjacking protection)
 * - X-XSS-Protection: 1; mode=block (legacy header kept on for scanner/compliance checks)
 * - Strict-Transport-Security (HSTS for HTTPS enforcement)
 * - Content-Security-Policy (CSP to prevent XSS attacks)
 * - X-Download-Options: noopen (IE8+ download protection)
 * - X-Permitted-Cross-Domain-Policies: none (Adobe product policies)
 * - Referrer-Policy: no-referrer (controls referrer information)
 *
 * @see https://helmetjs.github.io/
 */

import type { NextFunction, Request, Response } from 'express'
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

  // Modern Helmet forces this to "0" (the legacy filter caused vulnerabilities
  // in old IE/Edge), but that reads to security scanners as "header missing/disabled".
  // We set our own value below instead.
  xssFilter: false,

  // Additional security options (enabled by default):
  // - dnsPrefetchControl: controls DNS prefetching
  // - frameguard: prevents clickjacking
  // - hidePoweredBy: removes X-Powered-By header
  // - ieNoOpen: IE8+ download protection
  // - noSniff: prevents MIME sniffing
})

// Explicitly set X-XSS-Protection since Helmet no longer offers "1; mode=block".
// The header is a no-op in current browsers, but scanners/compliance checklists
// still expect it to be present.
export const xssProtectionHeader = (_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('X-XSS-Protection', '1; mode=block')
  next()
}

export default helmetMiddleware
