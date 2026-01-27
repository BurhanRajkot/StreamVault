import dotenv from 'dotenv'
dotenv.config()

import express from 'express'
import cors from 'cors'

import favoritesRouter from './routes/favorites'
import continueWatchingRouter from './routes/continueWatching'
import downloadsRouter from './routes/downloads'
import subscriptionsRouter from './routes/subscriptions'

const app = express()

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

// ROUTES
app.use('/downloads', downloadsRouter)
app.use('/favorites', favoritesRouter)
app.use('/continue-watching', continueWatchingRouter)
app.use('/subscriptions', subscriptionsRouter)

// 🚀 START SERVER
app.listen(PORT, () => {
  console.log(`🚀 Backend running on port ${PORT}`)
})
