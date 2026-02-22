import dotenv from 'dotenv'
dotenv.config()

import express from 'express'
import compression from 'compression'
import { getCacheStats } from './services/cache'
import { logger } from './lib/logger'

// CYBERSECURITY MIDDLEWARE (see ./cybersecurity for detailed documentation)
import {
  helmetMiddleware,
  corsMiddleware,
  corsPreflightHandler,
  apiRateLimiter
} from './cybersecurity'
import { httpsEnforcement } from './cybersecurity/httpsEnforcement'

import subscriptionAdminRouter from './routes/admin'
import favoritesRouter from './routes/favorites'
import continueWatchingRouter from './routes/continueWatching'
import downloadsRouter from './routes/downloads'
import subscriptionsRouter from './routes/subscriptions'
import tmdbRouter from './routes/tmdb'
import adminRouter from './admin/routes'
import recommendationsRouter from './routes/recommendations'
import dislikesRouter from './routes/dislikes'

const app = express()

// Trust proxy (required for Render/Vercel/Heroku reverse proxy)
app.set('trust proxy', true)

// SECURITY: Apply security middleware in order
// 1. HTTPS Enforcement - Redirect HTTP to HTTPS in production
app.use(httpsEnforcement)

// 2. Helmet - HTTP security headers
app.use(helmetMiddleware)

// 3. Compression - Apply BEFORE rate limiting for better performance
app.use(compression())

// 4. CORS - Must be BEFORE rate limiter so error responses include CORS headers
app.use(corsMiddleware)
app.options('/{*splat}', corsPreflightHandler)

// 5. Rate Limiting - Prevent API abuse (applied after compression)
app.use(apiRateLimiter)

// 6. Body parsing with size limits (prevent DoS attacks)
app.post('/subscriptions/webhook', express.raw({ type: 'application/json', limit: '1mb' }))
app.use(express.json({ limit: '10mb' })) // Reasonable limit for API requests
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

const PORT = process.env.PORT || 4000

// Log environment status for debugging
logger.info('Environment check', {
  port: PORT,
  nodeEnv: process.env.NODE_ENV || 'not set',
  supabaseConfigured: !!process.env.SUPABASE_URL,
  supabaseKeyConfigured: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
})

// ROOT ENDPOINT (FOR RENDER'S DEFAULT HEALTH CHECK)
app.get('/', (_req, res) => {
  res.status(200).json({ status: 'ok', service: 'streamvault-backend' })
})

// HEALTH ENDPOINT (FOR UPTIMEROBOT + WARMUP)
app.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    uptime: process.uptime(),
    time: new Date().toISOString(),
  })
})

// CACHE STATS ENDPOINT (FOR MONITORING)
app.get('/cache-stats', (_req, res) => {
  const stats = getCacheStats()
  res.status(200).json({
    stats,
    timestamp: new Date().toISOString(),
  })
})

// ROUTES
app.use('/tmdb', tmdbRouter)
app.use('/downloads', downloadsRouter)
app.use('/favorites', favoritesRouter)
app.use('/continue-watching', continueWatchingRouter)
app.use('/subscriptions/admin', subscriptionAdminRouter) // Mount specific admin routes first
app.use('/subscriptions', subscriptionsRouter)
app.use('/admin', adminRouter)
app.use('/recommendations', recommendationsRouter)
app.use('/dislikes', dislikesRouter)

// START SERVER
const HOST = '0.0.0.0'
app.listen(Number(PORT), HOST, () => {
  logger.info('Backend server started', { host: HOST, port: PORT })
})
