import { Router, Request, Response } from 'express'
import { supabase } from '../lib/supabase'
import { checkJwt } from '../middleware/auth'
import { v4 as uuidv4 } from 'uuid'
import * as cache from '../services/cache'

const router = Router()

async function ensureUser(userId: string) {
  const { data: existing } = await supabase
    .from('User')
    .select('id')
    .eq('id', userId)
    .single()

  if (!existing) {
    await supabase.from('User').insert({ id: userId })
  }
}

function getUserId(req: Request) {
  return (req as any).auth?.payload?.sub as string | undefined
}

router.get('/', checkJwt, async (req: Request, res: Response) => {
  const userId = getUserId(req)
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  await ensureUser(userId)

  // Check cache first
  const cacheKey = cache.generateCacheKey('favorites', userId)
  const cached = cache.userData.get(cacheKey)

  if (cached) {
    res.setHeader('X-Cache', 'HIT')
    return res.json(cached)
  }

  const { data, error } = await supabase
    .from('Favorite')
    .select('*')
    .eq('userId', userId)
    .order('id', { ascending: false })

  if (error) {
    console.error('Favorites fetch error:', error)
    return res.status(500).json({ error: 'Server error' })
  }

  // Cache the result
  cache.userData.set(cacheKey, data || [], 60) // 1 minute TTL
  res.setHeader('X-Cache', 'MISS')
  res.json(data || [])
})

router.post('/', checkJwt, async (req: Request, res: Response) => {
  const userId = getUserId(req)
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const { tmdbId, mediaType } = req.body as {
    tmdbId: number
    mediaType: 'movie' | 'tv'
  }

  if (typeof tmdbId !== 'number' || !mediaType) {
    return res.status(400).json({ error: 'Invalid data' })
  }

  try {
    await ensureUser(userId)

    const { data: existing } = await supabase
      .from('Favorite')
      .select('id')
      .eq('userId', userId)
      .eq('tmdbId', tmdbId)
      .eq('mediaType', mediaType)
      .single()

    if (existing) {
      return res.status(409).json({ error: 'Already favorited' })
    }

    const newFavorite = {
      id: uuidv4(),
      userId,
      tmdbId,
      mediaType,
    }

    const { data, error } = await supabase
      .from('Favorite')
      .insert(newFavorite)
      .select()
      .single()

    if (error) {
      console.error('Favorite create error:', error)
      return res.status(500).json({ error: 'Server error' })
    }

    // Invalidate cache for this user
    const cacheKey = cache.generateCacheKey('favorites', userId)
    cache.userData.del(cacheKey)

    res.status(201).json(data)
  } catch (error: any) {
    console.error('Favorite create error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

router.delete('/:id', checkJwt, async (req: Request, res: Response) => {
  const userId = getUserId(req)
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const { id } = req.params

  await ensureUser(userId)

  const { data: fav } = await supabase
    .from('Favorite')
    .select('userId')
    .eq('id', id)
    .single()

  if (!fav || fav.userId !== userId) {
    return res.status(404).json({ error: 'Not found' })
  }

  const { error } = await supabase.from('Favorite').delete().eq('id', id)

  if (error) {
    console.error('Favorite delete error:', error)
    return res.status(500).json({ error: 'Server error' })
  }

  // Invalidate cache for this user
  const cacheKey = cache.generateCacheKey('favorites', userId)
  cache.userData.del(cacheKey)

  res.status(204).send()
})

export default router
