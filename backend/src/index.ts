import dotenv from 'dotenv'
dotenv.config()

import express from 'express'
import cors from 'cors'
import favoritesRouter from './routes/favorites'
import { checkJwt } from './middleware/auth'

const app = express()

/**
 * ✅ CORS CONFIG (DEV + PROD)
 * Replace STREAMVAULT_VERCEL_URL after deploy
 */
app.use(
  cors({
    origin: [
      'http://localhost:8080',
      'http://localhost:3000',
      'https://stream-vault-7u6q.vercel.app/', // ⬅️ change if your Vercel URL differs
    ],
    credentials: true,
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

app.listen(PORT, () => {
  console.log(`🚀 Backend running on port ${PORT}`)
})
