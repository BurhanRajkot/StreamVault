import { Router } from 'express'
import { prisma } from '../lib/prisma'
import { checkJwt } from '../middleware/auth'

const router = Router()

// ==============================
// GET: fetch continue watching
// ==============================
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

// ==============================
// POST: update progress
// ==============================
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

// ==============================
// DELETE: remove from continue watching
// ==============================
router.delete('/:tmdbId/:mediaType', checkJwt, async (req, res) => {
  const userId = req.auth?.payload.sub
  const tmdbId = Number(req.params.tmdbId)
  const mediaType = req.params.mediaType

  if (!userId || !tmdbId || !mediaType) {
    return res.status(400).json({ error: 'Invalid request' })
  }

  await prisma.continueWatching.deleteMany({
    where: {
      userId,
      tmdbId,
      mediaType,
    },
  })

  res.json({ success: true })
})

export default router
