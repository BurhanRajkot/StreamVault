import { Router } from 'express'
import { supabaseAdmin } from '../lib/supabase'
import { checkJwt } from '../middleware/auth'
import * as cache from '../services/cache'
import { ensureUser } from '../lib/ensureUser'

const router = Router()

router.get('/', checkJwt, async (req, res) => {
  const userId = req.auth?.payload.sub
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  // Provision User row for brand-new accounts (prevents FK constraint errors)
  await ensureUser(userId)

  // Check cache first
  const cacheKey = cache.generateCacheKey('continue-watching', userId)
  const cached = await cache.userData.get(cacheKey)

  if (cached && typeof cached === 'object' && !Array.isArray(cached) && 'data' in cached && 'fetchedAt' in cached) {
    res.setHeader('X-Cache', 'HIT')
    const cachedItem = cached as { data: any, fetchedAt: number }
    const isStale = Date.now() - cachedItem.fetchedAt > 60000 // 1 minute stale threshold

    if (isStale) {
      // Serve immediately, but trigger background refresh
      setImmediate(async () => {
        const { data } = await supabaseAdmin
          .from('ContinueWatching')
          .select('*')
          .eq('userId', userId)
          .order('updatedAt', { ascending: false })
          .limit(20)

        if (data) {
          await cache.userData.set(cacheKey, { data, fetchedAt: Date.now() }, 300) // 5 minute TTL
        }
      })
    }

    return res.json(cachedItem.data)
  }

  const { data, error } = await supabaseAdmin
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
  await cache.userData.set(cacheKey, { data: data || [], fetchedAt: Date.now() }, 300) // 5 minute TTL
  res.setHeader('X-Cache', 'MISS')
  res.json(data || [])
})

router.post('/', checkJwt, async (req, res) => {
  const userId = req.auth?.payload.sub
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  // Provision User row for brand-new accounts (prevents FK constraint errors)
  await ensureUser(userId)

  const { tmdbId, mediaType, season, episode, progress, server } = req.body

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

  // Sanitize server field: allow only known provider keys (alphanumeric + underscore, max 50 chars)
  const sanitizedServer = (typeof server === 'string' && /^[a-z0-9_]{1,50}$/.test(server))
    ? server
    : null

  // Validate season and episode are positive integers if provided
  if (season !== undefined && season !== null) {
    const parsedSeason = Number(season)
    if (!Number.isInteger(parsedSeason) || parsedSeason <= 0 || parsedSeason > 1000) {
      return res.status(400).json({ error: 'Invalid season: must be a positive integer' })
    }
  }
  if (episode !== undefined && episode !== null) {
    const parsedEpisode = Number(episode)
    if (!Number.isInteger(parsedEpisode) || parsedEpisode <= 0 || parsedEpisode > 10000) {
      return res.status(400).json({ error: 'Invalid episode: must be a positive integer' })
    }
  }

  const { data: existing } = await supabaseAdmin
    .from('ContinueWatching')
    .select('id')
    .eq('userId', userId)
    .eq('tmdbId', parsedTmdbId)
    .eq('mediaType', mediaType)
    .single()

  let result
  if (existing) {
    const { data, error } = await supabaseAdmin
      .from('ContinueWatching')
      .update({
        season: season ?? null,
        episode: episode ?? null,
        progress,
        server: sanitizedServer,
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
    const { data, error } = await supabaseAdmin
      .from('ContinueWatching')
      .insert({
        userId,
        tmdbId: parsedTmdbId,
        mediaType,
        season: season ?? null,
        episode: episode ?? null,
        progress,
        server: sanitizedServer,
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
  await cache.userData.del(cacheKey)

  res.json(result)
})

router.delete('/:tmdbId/:mediaType', checkJwt, async (req, res) => {
  const userId = req.auth?.payload.sub
  const tmdbId = Number(req.params.tmdbId)
  const mediaType = req.params.mediaType

  if (!userId || !tmdbId || !mediaType) {
    return res.status(400).json({ error: 'Invalid request' })
  }

  const { error } = await supabaseAdmin
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
  await cache.userData.del(cacheKey)

  res.json({ success: true })
})

router.get('/:tmdbId/:mediaType', checkJwt, async (req, res) => {
  const userId = req.auth?.payload.sub
  const tmdbId = Number(req.params.tmdbId)
  const mediaType = req.params.mediaType

  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  if (!tmdbId || (mediaType !== 'movie' && mediaType !== 'tv')) {
    return res.status(400).json({ error: 'Invalid parameters' })
  }

  // Provision User row for brand-new accounts
  await ensureUser(userId)

  const { data, error } = await supabaseAdmin
    .from('ContinueWatching')
    .select('*')
    .eq('userId', userId)
    .eq('tmdbId', tmdbId)
    .eq('mediaType', mediaType)
    .single()

  if (error && error.code !== 'PGRST116') { // PGRST116 is "no rows returned"
    console.error('Continue watching fetch single item error:', error)
    return res.status(500).json({ error: 'Server error' })
  }

  return res.json(data || null)
})

export default router
