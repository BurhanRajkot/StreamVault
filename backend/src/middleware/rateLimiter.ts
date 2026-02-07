import rateLimit from 'express-rate-limit'

// Rate limiter for file downloads
// Prevents abuse and excessive bandwidth usage
export const downloadRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // 50 downloads per 15 minutes per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many download requests',
    message: 'Please wait before downloading more files',
    retryAfter: '15 minutes',
  },
  validate: { trustProxy: false },
})
