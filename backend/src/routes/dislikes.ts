import { Router, Request, Response } from 'express'
import { supabaseAdmin } from '../lib/supabase'
import { checkJwt } from '../middleware/auth'
import { logInteraction } from '../cinematch/tracking/events'
import { invalidateUserProfile } from '../cinematch/features/userProfile'
import { invalidateRecommendationCache } from '../cinematch/mixer/homeTimeline'
import * as cache from '../services/cache'
import { v4 as uuidv4 } from 'uuid'
import { ensureUser } from '../lib/ensureUser'

const router = Router()

function getUserId(req: Request) {
  return (req as any).auth?.payload?.sub as string | undefined
}

// ── GET /dislikes ───────────────────────────────────────────
// Returns a list of the user's current disliked items
router.get('/', checkJwt, async (req: Request, res: Response) => {
  const userId = getUserId(req)
  if (!userId) return res.status(401).json({ error: 'Unauthorized' })

  // Provision User row for brand-new accounts
  await ensureUser(userId)

  // Check cache first
  const cacheKey = cache.generateCacheKey('dislikes', userId)
  const cached = await cache.userData.get(cacheKey)

  if (cached) {
    res.setHeader('X-Cache', 'HIT')
    return res.json(cached)
  }

  // Fetch from UserInteractions where eventType = 'dislike'
  const { data, error } = await supabaseAdmin
    .from('UserInteractions')
    .select('tmdbId, mediaType, id')
    .eq('userId', userId)
    .eq('eventType', 'dislike')
    .order('createdAt', { ascending: false })

  if (error) {
    console.error('Dislikes fetch error:', error)
    return res.status(500).json({ error: 'Server error' })
  }

  await cache.userData.set(cacheKey, data || [], 60) // 1 minute TTL
  res.setHeader('X-Cache', 'MISS')
  res.json(data || [])
})

// ── POST /dislikes ───────────────────────────────────────────
// Registers a new dislike. We use the existing logInteraction to
// handle the ML profile updates and cache invalidation automatically.
router.post('/', checkJwt, async (req: Request, res: Response) => {
  const userId = getUserId(req)
  if (!userId) return res.status(401).json({ error: 'Unauthorized' })

  // Provision User row for brand-new accounts
  await ensureUser(userId)

  const { tmdbId, mediaType } = req.body

  const parsedTmdbId = Number(tmdbId)
  if (!Number.isInteger(parsedTmdbId) || parsedTmdbId <= 0) {
    return res.status(400).json({ error: 'Invalid tmdbId' })
  }

  if (mediaType !== 'movie' && mediaType !== 'tv') {
    return res.status(400).json({ error: 'Invalid mediaType' })
  }

  try {
    // 1. Check if already disliked to prevent duplicate logs
    // Use maybeSingle() instead of single() — single() throws PGRST116 when no
    // row is found, which would be caught as a 500 error below.
    const { data: existing, error: lookupError } = await supabaseAdmin
      .from('UserInteractions')
      .select('id')
      .eq('userId', userId)
      .eq('tmdbId', parsedTmdbId)
      .eq('mediaType', mediaType)
      .eq('eventType', 'dislike')
      .maybeSingle()

    if (lookupError) {
      console.error('Dislike lookup error:', lookupError)
      return res.status(500).json({ error: 'Server error' })
    }

    if (existing) {
      // Already disliked — return the existing record as a success so the
      // frontend stays in sync without showing an error.
      return res.status(200).json({ id: existing.id, tmdbId: parsedTmdbId, mediaType })
    }

    // 2. Log interaction (this updates ML profiles & wipes recommendation caches)
    await logInteraction({
      userId,
      tmdbId: parsedTmdbId,
      mediaType,
      eventType: 'dislike'
    })

    // 3. Clear the GET /dislikes cache
    const cacheKey = cache.generateCacheKey('dislikes', userId)
    await cache.userData.del(cacheKey)

    // Return a mock object so the frontend knows it succeeded and has an ID to track
    res.status(201).json({ id: uuidv4(), tmdbId: parsedTmdbId, mediaType })

  } catch (err: any) {
    console.error('Dislike create error:', err)
    return res.status(500).json({ error: 'Server error' })
  }
})

// ── DELETE /dislikes/:mediaType/:tmdbId ───────────────────────────
// Reverses a dislike.
router.delete('/:mediaType/:tmdbId', checkJwt, async (req: Request, res: Response) => {
  const userId = getUserId(req)
  if (!userId) return res.status(401).json({ error: 'Unauthorized' })

  const { mediaType, tmdbId } = req.params

  const parsedTmdbId = Number(tmdbId)
  if (!Number.isInteger(parsedTmdbId) || parsedTmdbId <= 0) {
    return res.status(400).json({ error: 'Invalid tmdbId' })
  }

  if (mediaType !== 'movie' && mediaType !== 'tv') {
    return res.status(400).json({ error: 'Invalid mediaType' })
  }

  try {
    // Delete all dislike events for this media for this user
    const { error } = await supabaseAdmin
      .from('UserInteractions')
      .delete()
      .eq('userId', userId)
      .eq('tmdbId', parsedTmdbId)
      .eq('mediaType', mediaType)
      .eq('eventType', 'dislike')

    if (error) {
      console.error('Dislike delete error:', error)
      return res.status(500).json({ error: 'Server error' })
    }

    // Reversing a dislike means their profile changed, so we must invalidate ML caches
    invalidateUserProfile(userId)
    invalidateRecommendationCache(userId)

    const cacheKey = cache.generateCacheKey('dislikes', userId)
    await cache.userData.del(cacheKey)

    res.status(204).send()
  } catch (err: any) {
    console.error('Dislike delete error:', err)
    return res.status(500).json({ error: 'Server error' })
  }
})

export default router
