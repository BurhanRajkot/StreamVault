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

// 🔒 SECURITY: Rate limiting to prevent abuse
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per windowMs per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
})
app.use(limiter)

// 🔥 COMPRESSION MIDDLEWARE (gzip/brotli)
app.use(compression())

app.use(
  cors({
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
)

app.post('/subscriptions/webhook', express.raw({ type: 'application/json' }))
app.use(express.json())

const PORT = process.env.PORT || 4000

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
