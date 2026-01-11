import dotenv from 'dotenv'
dotenv.config()
import continueWatchingRouter from './routes/continueWatching'
import express from 'express'
import cors from 'cors'
import favoritesRouter from './routes/favorites'
import { checkJwt } from './middleware/auth'

const app = express()

/**
 * ✅ PRODUCTION-SAFE CORS
 * - Works with Express 5
 * - Fixes preflight (OPTIONS)
 * - Works for Vercel, localhost, previews
 */
app.use(
  cors({
    origin: true, // 👈 IMPORTANT: echo requesting origin
    credentials: true,
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
)

app.use(express.json())

const PORT = process.env.PORT || 4000

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' })
})

app.get('/protected', checkJwt, (req, res) => {
  res.json({
    message: 'Protected route',
    user: req.auth?.payload.sub,
  })
})

app.use('/favorites', favoritesRouter)

app.use('/continue-watching', continueWatchingRouter)

app.listen(PORT, () => {
  console.log(`🚀 Backend running on port ${PORT}`)
})
