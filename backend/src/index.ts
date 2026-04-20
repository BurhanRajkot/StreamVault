import './lib/loadEnv'

import express from 'express'
import compression from 'compression'
import { logger } from './lib/logger'
import { seedTrieBackground } from './cinematch/search/trieAutocomplete'
import { getGuestRecommendations } from './cinematch/mixer/homeTimeline'

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
import { requireAdminAuth } from './admin/middleware'
import { getCacheStatus } from './services/cache'

const app = express()

// Trust exactly one upstream proxy (Render/Vercel/Heroku load balancer)
app.set('trust proxy', 1)

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
app.use(express.json({ limit: '1mb' })) // Tight limit to prevent DoS
app.use(express.urlencoded({ extended: true, limit: '1mb' }))

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

// CACHE STATS ENDPOINT (FOR MONITORING - ADMIN ONLY)
app.get('/cache-stats', requireAdminAuth, (_req, res) => {
  const cacheStatus = getCacheStatus()

  const status = cacheStatus.fallbackActive
    ? 'Redis degraded, memory fallback active'
    : cacheStatus.redisReady
      ? 'Redis active'
      : 'Redis unavailable'

  res.status(200).json({
    status,
    backend: cacheStatus.backend,
    redisReady: cacheStatus.redisReady,
    redisOpen: cacheStatus.redisOpen,
    fallbackActive: cacheStatus.fallbackActive,
    redisCommandTimeoutMs: cacheStatus.redisCommandTimeoutMs,
    localKeys: cacheStatus.localKeys,
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
  
  // Asynchronously seed the Autocomplete Trie without blocking startup
  seedTrieBackground().catch(err => 
    logger.error('Failed to seed Trie', { error: err.message })
  )

  // Pre-warm guest recommendation cache 3s after startup.
  // This ensures the first guest page load hits L1 in-memory cache (~1ms)
  // instead of triggering a cold pipeline run (5-10s of TMDB API calls).
  setTimeout(() => {
    getGuestRecommendations()
      .then(() => logger.info('Guest recommendation cache pre-warmed'))
      .catch(err => logger.warn('Guest cache warm-up failed (non-critical)', { error: err?.message }))
  }, 3000)
})
