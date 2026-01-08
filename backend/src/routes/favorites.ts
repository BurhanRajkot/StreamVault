import { Router, Request, Response } from 'express'
import { prisma } from '../lib/prisma'
import { checkJwt } from '../middleware/auth'

const router = Router()

/**
 * Ensure user exists in DB
 */
async function ensureUser(userId: string) {
  await prisma.user.upsert({
    where: { id: userId },
    update: {},
    create: { id: userId },
  })
}

/**
 * GET /favorites
 */
router.get('/', checkJwt, async (req: Request, res: Response) => {
  const userId = req.auth!.payload.sub as string

  await ensureUser(userId)

  const favorites = await prisma.favorite.findMany({
    where: { userId },
    orderBy: { id: 'desc' },
  })

  res.json(favorites)
})

/**
 * POST /favorites
 */
router.post('/', checkJwt, async (req: Request, res: Response) => {
  const userId = req.auth!.payload.sub as string
  const { tmdbId, mediaType } = req.body as {
    tmdbId: number
    mediaType: 'movie' | 'tv'
  }

  if (typeof tmdbId !== 'number' || !mediaType) {
    return res.status(400).json({ error: 'Invalid data' })
  }

  try {
    await ensureUser(userId)

    const favorite = await prisma.favorite.create({
      data: { userId, tmdbId, mediaType },
    })

    res.status(201).json(favorite)
  } catch (error: any) {
    if (error.code === 'P2002') {
      return res.status(409).json({ error: 'Already favorited' })
    }

    console.error('Favorite create error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

/**
 * DELETE /favorites/:id
 */
router.delete('/:id', checkJwt, async (req: Request, res: Response) => {
  const userId = req.auth!.payload.sub as string
  const { id } = req.params

  await ensureUser(userId)

  const fav = await prisma.favorite.findUnique({ where: { id } })

  if (!fav || fav.userId !== userId) {
    return res.status(404).json({ error: 'Not found' })
  }

  await prisma.favorite.delete({ where: { id } })
  res.status(204).send()
})

export default router
