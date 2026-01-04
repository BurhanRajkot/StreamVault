import dotenv from 'dotenv'
dotenv.config() // ✅ MUST BE FIRST

import express from 'express'
import cors from 'cors'
import { checkJwt } from './middleware/auth'
import favoritesRouter from './routes/favorites'

const app = express()

app.use(cors())
app.use(express.json())

const PORT = process.env.PORT || 4000

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' })
})

app.get('/protected', checkJwt, (req, res) => {
  res.json({
    message: 'Protected route accessed',
    user: req.auth?.payload.sub,
  })
})
app.use('/favorites', favoritesRouter)

app.listen(PORT, () => {
  console.log(`🚀 Backend running on http://localhost:${PORT}`)
})
