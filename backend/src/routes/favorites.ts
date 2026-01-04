import { Router, Request, Response } from 'express'
import { prisma } from '../lib/prisma'
import { checkJwt } from '../middleware/auth'

const router = Router()

/**
 * GET /favorites
 * Returns all favorites for the logged-in user
 */
router.get('/', checkJwt, async (req: Request, res: Response) => {
  const userId = req.auth!.payload.sub as string // ✅ Type assertion

  // Or with validation:
  // const userId = req.auth?.payload?.sub
  // if (!userId) {
  //   return res.status(401).json({ error: 'Unauthorized' })
  // }

  const favorites = await prisma.favorite.findMany({
    where: { userId },
    orderBy: { id: 'desc' },
  })

  res.json(favorites)
})

/**
 * POST /favorites
 * Body: { tmdbId: number, mediaType: "movie" | "tv" }
 */
router.post('/', checkJwt, async (req: Request, res: Response) => {
  const userId = req.auth!.payload.sub as string // ✅ Type assertion

  const { tmdbId, mediaType } = req.body as {
    tmdbId: number
    mediaType: 'movie' | 'tv'
  }

  if (typeof tmdbId !== 'number' || !mediaType) {
    return res.status(400).json({ error: 'Missing or invalid fields' })
  }

  try {
    const favorite = await prisma.favorite.create({
      data: {
        userId,
        tmdbId,
        mediaType,
      },
    })

    res.status(201).json(favorite)
  } catch (error: any) {
    // Prisma unique constraint violation (already favorited)
    if (error.code === 'P2002') {
      return res.status(409).json({ error: 'Already favorited' })
    }
    console.error('Error creating favorite:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * DELETE /favorites/:id
 * Deletes a favorite owned by the logged-in user
 */
router.delete('/:id', checkJwt, async (req: Request, res: Response) => {
  const userId = req.auth!.payload.sub as string // ✅ Type assertion
  const favoriteId = req.params.id

  try {
    const favorite = await prisma.favorite.findUnique({
      where: { id: favoriteId },
    })

    if (!favorite || favorite.userId !== userId) {
      return res.status(404).json({ error: 'Favorite not found' })
    }

    await prisma.favorite.delete({
      where: { id: favoriteId },
    })

    res.status(204).send()
  } catch (error) {
    console.error('Error deleting favorite:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
