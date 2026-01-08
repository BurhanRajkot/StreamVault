import dotenv from 'dotenv'
dotenv.config()

import express from 'express'
import cors from 'cors'
import favoritesRouter from './routes/favorites'
import { checkJwt } from './middleware/auth'

const app = express()

const allowedOrigins = [
  'http://localhost:8080',
  'http://localhost:5173',
  'https://stream-vault-7u6q.vercel.app',
]

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true)

      if (allowedOrigins.includes(origin)) {
        return callback(null, true)
      }

      return callback(new Error('Not allowed by CORS'))
    },
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

app.listen(PORT, () => {
  console.log(`🚀 Backend running on port ${PORT}`)
})
