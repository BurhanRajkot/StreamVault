import dotenv from 'dotenv'
dotenv.config()

import express from 'express'
import cors from 'cors'
import compression from 'compression'
import { getCacheStats } from './services/cache'

import favoritesRouter from './routes/favorites'
import continueWatchingRouter from './routes/continueWatching'
import downloadsRouter from './routes/downloads'
import subscriptionsRouter from './routes/subscriptions'
import tmdbRouter from './routes/tmdb'

const app = express()

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
app.listen(PORT, () => {
  console.log(`🚀 Backend running on port ${PORT}`)
})
