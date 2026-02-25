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
  // Allow iframe embeds for video player
  crossOriginEmbedderPolicy: false,

  // Content Security Policy - prevents XSS attacks
  contentSecurityPolicy: isProduction ? {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"], // Allow inline scripts for React
      styleSrc: ["'self'", "'unsafe-inline'"], // Allow inline styles
      imgSrc: ["'self'", "data:", "https:", "blob:"], // Allow images from TMDB, etc.
      connectSrc: ["'self'", "https://api.themoviedb.org", process.env.FRONTEND_URL || ""].filter(src => src !== ""),
      fontSrc: ["'self'", "data:"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'", "blob:", "https:"],
      // Allow all streaming provider iframes
      frameSrc: [
        "'self'",
        "https://vidsrc.to",
        "https://vidsrc.icu",
        "https://vidfast.pro",
        "https://vidlink.pro",
        "https://vidsrc.cc",
        "https://player.videasy.net",
        "https://vidsrc.net",
        "https://v2.vidsrc.me",
      ],
    },
  } : false, // Disable CSP in development for easier debugging

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
