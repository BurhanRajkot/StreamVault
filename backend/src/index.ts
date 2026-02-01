import dotenv from 'dotenv'
dotenv.config()

import express from 'express'
import cors from 'cors'
import compression from 'compression'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import { getCacheStats } from './services/cache'

import favoritesRouter from './routes/favorites'
import continueWatchingRouter from './routes/continueWatching'
import downloadsRouter from './routes/downloads'
import subscriptionsRouter from './routes/subscriptions'
import tmdbRouter from './routes/tmdb'

const app = express()

// 🔒 SECURITY: Helmet sets various HTTP headers for protection
app.use(helmet({
  crossOriginEmbedderPolicy: false, // Allow iframe embeds
  contentSecurityPolicy: false, // We handle CSP in frontend _headers
}))

// 🔒 SECURITY: Rate limiting to prevent abuse (skip health checks)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per windowMs per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
  skip: (req) => req.path === '/' || req.path === '/health',
})
app.use(limiter)

// 🔥 COMPRESSION MIDDLEWARE (gzip/brotli)
app.use(compression())

// 🔒 CORS MIDDLEWARE - Allow all origins with explicit configuration
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow all origins (including no origin for direct API access)
      console.log(`📡 CORS request from origin: ${origin || 'direct access'}`)
      callback(null, true)
    },
    credentials: true,
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS', 'PUT', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    exposedHeaders: ['Content-Length', 'X-Request-Id'],
    maxAge: 86400, // 24 hours - cache preflight responses
  })
)

// Additional explicit OPTIONS handling for preflight requests
app.options('/{*splat}', cors())

app.post('/subscriptions/webhook', express.raw({ type: 'application/json' }))
app.use(express.json())

const PORT = process.env.PORT || 4000

// Log environment status for debugging
console.log('🔧 Environment check:')
console.log(`   - PORT: ${PORT}`)
console.log(`   - NODE_ENV: ${process.env.NODE_ENV || 'not set'}`)
console.log(`   - SUPABASE_URL: ${process.env.SUPABASE_URL ? '✓ set' : '✗ MISSING'}`)
console.log(`   - SUPABASE_SERVICE_ROLE_KEY: ${process.env.SUPABASE_SERVICE_ROLE_KEY ? '✓ set' : '✗ MISSING'}`)

// 🔥 ROOT ENDPOINT (FOR RENDER'S DEFAULT HEALTH CHECK)
app.get('/', (_req, res) => {
  res.status(200).json({ status: 'ok', service: 'streamvault-backend' })
})

// 🔥 HEALTH ENDPOINT (FOR UPTIMEROBOT + WARMUP)
app.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    uptime: process.uptime(),
    time: new Date().toISOString(),
  })
})

// 🔥 CACHE STATS ENDPOINT (FOR MONITORING)
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

// 🚀 START SERVER
const HOST = '0.0.0.0'
app.listen(Number(PORT), HOST, () => {
  console.log(`🚀 Backend running on http://${HOST}:${PORT}`)
})
