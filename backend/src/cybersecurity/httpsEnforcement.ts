/**
 *  HTTPS ENFORCEMENT MIDDLEWARE
 *
 * Redirects all HTTP requests to HTTPS in production
 * Ensures all traffic is encrypted
 */

import { Request, Response, NextFunction } from 'express'

export function httpsEnforcement(req: Request, res: Response, next: NextFunction) {
  const isProduction = process.env.NODE_ENV === 'production'

  // Skip in development (localhost uses HTTP)
  if (!isProduction) {
    return next()
  }

  // Check if request is already HTTPS
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https'

  if (!isHttps) {
    // Redirect to HTTPS
    const httpsUrl = `https://${req.hostname}${req.url}`
    return res.redirect(301, httpsUrl)
  }

  next()
}

export default httpsEnforcement
