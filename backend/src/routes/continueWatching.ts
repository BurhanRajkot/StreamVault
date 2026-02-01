import { Router } from 'express'
import { supabase } from '../lib/supabase'
import { checkJwt } from '../middleware/auth'
import * as cache from '../services/cache'

const router = Router()

router.get('/', checkJwt, async (req, res) => {
  const userId = req.auth?.payload.sub
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  // Check cache first
  const cacheKey = cache.generateCacheKey('continue-watching', userId)
  const cached = cache.userData.get(cacheKey)

  if (cached) {
    res.setHeader('X-Cache', 'HIT')
    return res.json(cached)
  }

  const { data, error } = await supabase
    .from('ContinueWatching')
    .select('*')
    .eq('userId', userId)
    .order('updatedAt', { ascending: false })
    .limit(20)

  if (error) {
    console.error('Continue watching fetch error:', error)
    return res.status(500).json({ error: 'Server error' })
  }

  // Cache the result
  cache.userData.set(cacheKey, data || [], 60) // 1 minute TTL
  res.setHeader('X-Cache', 'MISS')
  res.json(data || [])
})

router.post('/', checkJwt, async (req, res) => {
  const userId = req.auth?.payload.sub
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const { tmdbId, mediaType, season, episode, progress } = req.body

  // Input validation
  const parsedTmdbId = Number(tmdbId)
  if (!Number.isInteger(parsedTmdbId) || parsedTmdbId <= 0) {
    return res.status(400).json({ error: 'Invalid tmdbId: must be a positive integer' })
  }

  if (mediaType !== 'movie' && mediaType !== 'tv') {
    return res.status(400).json({ error: 'Invalid mediaType: must be "movie" or "tv"' })
  }

  if (typeof progress !== 'number' || progress < 0 || progress > 1) {
    return res.status(400).json({ error: 'Invalid progress: must be a number between 0 and 1' })
  }

  const { data: existing } = await supabase
    .from('ContinueWatching')
    .select('id')
    .eq('userId', userId)
    .eq('tmdbId', tmdbId)
    .eq('mediaType', mediaType)
    .single()

  let result
  if (existing) {
    const { data, error } = await supabase
      .from('ContinueWatching')
      .update({
        season,
        episode,
        progress,
        updatedAt: new Date().toISOString(),
      })
      .eq('id', existing.id)
      .select()
      .single()

    if (error) {
      console.error('Continue watching update error:', error)
      return res.status(500).json({ error: 'Server error' })
    }
    result = data
  } else {
    const { data, error } = await supabase
      .from('ContinueWatching')
      .insert({
        userId,
        tmdbId,
        mediaType,
        season,
        episode,
        progress,
        updatedAt: new Date().toISOString(),
      })
      .select()
      .single()

    if (error) {
      console.error('Continue watching create error:', error)
      return res.status(500).json({ error: 'Server error' })
    }
    result = data
  }

  // Invalidate cache for this user
  const cacheKey = cache.generateCacheKey('continue-watching', userId)
  cache.userData.del(cacheKey)

  res.json(result)
})

router.delete('/:tmdbId/:mediaType', checkJwt, async (req, res) => {
  const userId = req.auth?.payload.sub
  const tmdbId = Number(req.params.tmdbId)
  const mediaType = req.params.mediaType

  if (!userId || !tmdbId || !mediaType) {
    return res.status(400).json({ error: 'Invalid request' })
  }

  const { error } = await supabase
    .from('ContinueWatching')
    .delete()
    .eq('userId', userId)
    .eq('tmdbId', tmdbId)
    .eq('mediaType', mediaType)

  if (error) {
    console.error('Continue watching delete error:', error)
    return res.status(500).json({ error: 'Server error' })
  }

  // Invalidate cache for this user
  const cacheKey = cache.generateCacheKey('continue-watching', userId)
  cache.userData.del(cacheKey)

  res.json({ success: true })
})

export default router
