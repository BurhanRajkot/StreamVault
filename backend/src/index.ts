import dotenv from 'dotenv'
dotenv.config()

import express from 'express'
import compression from 'compression'
import { getCacheStats } from './services/cache'

// CYBERSECURITY MIDDLEWARE (see ./cybersecurity for detailed documentation)
import {
  helmetMiddleware,
  corsMiddleware,
  corsPreflightHandler,
  apiRateLimiter
} from './cybersecurity'

import favoritesRouter from './routes/favorites'
import continueWatchingRouter from './routes/continueWatching'
import downloadsRouter from './routes/downloads'
import subscriptionsRouter from './routes/subscriptions'
import tmdbRouter from './routes/tmdb'
import adminRouter from './admin/routes'

const app = express()

// Trust proxy (required for Render/Vercel/Heroku reverse proxy)
app.set('trust proxy', true)

// SECURITY: Apply security middleware in order
// 1. Helmet - HTTP security headers
app.use(helmetMiddleware)

// 2. Compression - Apply BEFORE rate limiting for better performance
app.use(compression())

// 3. CORS - Must be BEFORE rate limiter so error responses include CORS headers
app.use(corsMiddleware)
app.options('/{*splat}', corsPreflightHandler)

// 4. Rate Limiting - Prevent API abuse (applied after compression)
app.use(apiRateLimiter)

app.post('/subscriptions/webhook', express.raw({ type: 'application/json' }))
app.use(express.json())

const PORT = process.env.PORT || 4000

// Log environment status for debugging
console.log('Environment check:')
console.log(`   - PORT: ${PORT}`)
console.log(`   - NODE_ENV: ${process.env.NODE_ENV || 'not set'}`)
console.log(`   - SUPABASE_URL: ${process.env.SUPABASE_URL ? '✓ set' : '✗ MISSING'}`)
console.log(`   - SUPABASE_SERVICE_ROLE_KEY: ${process.env.SUPABASE_SERVICE_ROLE_KEY ? '✓ set' : '✗ MISSING'}`)

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
app.use('/subscriptions', subscriptionsRouter)
app.use('/admin', adminRouter)

// START SERVER
const HOST = '0.0.0.0'
app.listen(Number(PORT), HOST, () => {
  console.log(`Backend running on http://${HOST}:${PORT}`)
})
