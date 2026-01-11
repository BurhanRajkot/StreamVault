import { Router } from 'express'
import { prisma } from '../lib/prisma'
import { checkJwt } from '../middleware/auth'

const router = Router()

// GET: fetch continue watching for logged-in user
router.get('/', checkJwt, async (req, res) => {
  const userId = req.auth?.payload.sub
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const items = await prisma.continueWatching.findMany({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
    take: 20,
  })

  res.json(items)
})

// POST: update progress
router.post('/', checkJwt, async (req, res) => {
  const userId = req.auth?.payload.sub
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const { tmdbId, mediaType, season, episode, progress } = req.body

  if (!tmdbId || !mediaType || progress === undefined) {
    return res.status(400).json({ error: 'Missing required fields' })
  }

  const record = await prisma.continueWatching.upsert({
    where: {
      userId_tmdbId_mediaType: {
        userId,
        tmdbId,
        mediaType,
      },
    },
    update: {
      season,
      episode,
      progress,
    },
    create: {
      userId,
      tmdbId,
      mediaType,
      season,
      episode,
      progress,
    },
  })

  res.json(record)
})

export default router
