import './lib/loadEnv'

import express from 'express'
import compression from 'compression'
import { logger } from './lib/logger'
import { seedTrieBackground } from './cinematch/search/trieAutocomplete'
import { getGuestRecommendations } from './cinematch/mixer/homeTimeline'
import { startWeightsRefreshLoop } from './cinematch/ranking/weightsRefreshJob'

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
import { closeRedis } from './services/cache/redisPrimary'

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

// HEALTH ENDPOINT (FOR RENDER HEALTH CHECKS - DO NOT REMOVE OR RENAME)
app.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    uptime: process.uptime(),
    time: new Date().toISOString(),
  })
})

// PING ENDPOINT (ALIAS - used by frontend warmup to bypass adblockers)
app.get('/ping', (_req, res) => {
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

// 404 — must come after every route so it only catches genuinely unknown paths.
app.use((req, res) => {
  res.status(404).json({ error: 'Not found', path: req.path })
})

// Global error handler. Express only treats a 4-arg middleware as an error
// handler, so `_next` must stay in the signature even though it is unused.
app.use((err: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = err instanceof Error ? err.message : String(err)

  logger.error('Unhandled request error', {
    method: req.method,
    path: req.path,
    error: message,
    stack: err instanceof Error ? err.stack : undefined,
  })

  if (res.headersSent) {
    // Response already started — the only correct move is to abort the socket.
    res.destroy()
    return
  }

  // A rejected CORS origin surfaces here; answer 403 rather than a generic 500.
  if (message.startsWith('CORS policy:')) {
    res.status(403).json({ error: 'Origin not allowed' })
    return
  }

  // Never leak internals to the client.
  res.status(500).json({ error: 'Internal server error' })
})

// START SERVER
const HOST = '0.0.0.0'
let warmupTimer: ReturnType<typeof setTimeout> | undefined

const server = app.listen(Number(PORT), HOST, () => {
  logger.info('Backend server started', { host: HOST, port: PORT })

  // Asynchronously seed the Autocomplete Trie without blocking startup
  seedTrieBackground().catch(err =>
    logger.error('Failed to seed Trie', { error: err.message })
  )

  // Apply what the position-bias learner has measured. Impressions are logged
  // on every recommendation render; without this loop those records accumulate
  // but never influence ranking.
  startWeightsRefreshLoop()

  // Pre-warm guest recommendation cache 3s after startup.
  // This ensures the first guest page load hits L1 in-memory cache (~1ms)
  // instead of triggering a cold pipeline run (5-10s of TMDB API calls).
  warmupTimer = setTimeout(() => {
    getGuestRecommendations()
      .then(() => logger.info('Guest recommendation cache pre-warmed'))
      .catch(err => logger.warn('Guest cache warm-up failed (non-critical)', { error: err?.message }))
  }, 3000)
})

server.on('error', (err: NodeJS.ErrnoException) => {
  // EADDRINUSE and friends arrive here; without a handler they become an
  // uncaught exception with no useful context.
  logger.error('HTTP server error', { code: err.code, error: err.message })
  process.exit(1)
})

/**
 * Graceful shutdown.
 *
 * Kubernetes sends SIGTERM and waits terminationGracePeriodSeconds before
 * SIGKILL. Without this the process dies instantly on every rollout, cutting
 * off in-flight requests and leaving the Redis socket half-open.
 */
let shuttingDown = false

async function shutdown(signal: string) {
  if (shuttingDown) return
  shuttingDown = true

  logger.info('Shutdown signal received, draining connections', { signal })

  if (warmupTimer) clearTimeout(warmupTimer)

  // Stop accepting new connections, then wait for in-flight ones to finish.
  const closed = new Promise<void>((resolve) => server.close(() => resolve()))

  // server.close() waits for every open socket, including idle keep-alive ones
  // that will never send another byte. Without this the drain always stalls
  // until the force-exit timer fires.
  server.closeIdleConnections?.()

  // Hard cap so a slow in-flight request can't outlast the grace period.
  const forceExit = setTimeout(() => {
    logger.warn('Graceful shutdown timed out, closing remaining connections')
    server.closeAllConnections?.()
  }, 10_000)
  forceExit.unref()

  try {
    await closed
    logger.info('HTTP connections drained')

    // Redis may be mid-reconnect, in which case quit() blocks waiting for a
    // connection that will never arrive. Cap it rather than hang the drain.
    await Promise.race([closeRedis(), delay(2_000)])
    logger.info('Shutdown complete')
  } catch (err) {
    logger.error('Error during shutdown', { error: err instanceof Error ? err.message : String(err) })
    process.exitCode = 1
  } finally {
    clearTimeout(forceExit)
    process.exit(process.exitCode ?? 0)
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms)
    t.unref()
  })
}

process.on('SIGTERM', () => void shutdown('SIGTERM'))
process.on('SIGINT', () => void shutdown('SIGINT'))

process.on('unhandledRejection', (reason) => {
  // Log instead of crashing: one rejected background promise (a TMDB prefetch,
  // a telemetry write) should not take down a server that is serving traffic.
  logger.error('Unhandled promise rejection', {
    error: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
  })
})

process.on('uncaughtException', (err) => {
  // The process is in an undefined state here, so drain and exit; the
  // orchestrator restarts us.
  logger.error('Uncaught exception, shutting down', { error: err.message, stack: err.stack })
  void shutdown('uncaughtException')
})

