// ============================================================
// CineMatch AI — Recommendations API Route
// Backend serving layer — equivalent to X's Feed Serving API
//
// Endpoints:
//   GET  /recommendations        → personalized (auth required)
//   GET  /recommendations/guest  → cold-start (no auth)
//   POST /recommendations/interaction → log user event
// ============================================================

import { Router, Request, Response } from 'express'
import { checkJwt } from '../middleware/auth'
import { getRecommendations, getGuestRecommendations } from '../cinematch/homeMixer'
import { logInteraction } from '../cinematch/interactionTracker'
import { EventType, MediaType } from '../cinematch/types'
import * as cache from '../services/cache'

const router = Router()

// ── Validation helpers ────────────────────────────────────────
const VALID_MEDIA_TYPES: MediaType[] = ['movie', 'tv']
const VALID_EVENT_TYPES: EventType[] = ['watch', 'favorite', 'click', 'search', 'rate']

// ── GET /recommendations ──────────────────────────────────────
// Personalized recommendations for authenticated user
// Pipeline: user profile → candidates → filters → ranking → cache → serve
router.get('/', checkJwt, async (req: Request, res: Response) => {
  const userId = (req as any).auth?.payload?.sub as string | undefined
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  try {
    const forceRefresh = req.query.refresh === 'true'
    const limit = Math.min(Number(req.query.limit) || 40, 100)

    // L1 cache check (at route level for ultra-fast responses)
    const cacheKey = cache.generateCacheKey('recommendations', userId, String(limit))
    if (!forceRefresh) {
      const cached = cache.userData.get(cacheKey)
      if (cached) {
        res.setHeader('X-Cache', 'HIT')
        res.setHeader('X-CineMatch-Pipeline', 'cache')
        return res.json(cached)
      }
    }

    const result = await getRecommendations(userId, { limit, forceRefresh })

    // Cache for 5 minutes
    cache.userData.set(cacheKey, result, 300)
    res.setHeader('X-Cache', 'MISS')
    res.setHeader('X-CineMatch-Pipeline', 'live')
    res.setHeader('Cache-Control', 'private, max-age=300')
    return res.json(result)
  } catch (err: any) {
    console.error('[CineMatch] Recommendation error:', err?.message)
    return res.status(500).json({ error: 'Recommendation service error' })
  }
})

// ── GET /recommendations/guest ────────────────────────────────
// Cold-start / unauthenticated users get trending + popular blend
router.get('/guest', async (_req: Request, res: Response) => {
  try {
    const cacheKey = 'recommendations:guest'
    const cached = cache.tmdb.get(cacheKey)
    if (cached) {
      res.setHeader('X-Cache', 'HIT')
      return res.json(cached)
    }

    const result = await getGuestRecommendations()

    // Cache 30 minutes for guest (same content for everyone)
    cache.tmdb.set(cacheKey, result, 1800)
    res.setHeader('X-Cache', 'MISS')
    res.setHeader('Cache-Control', 'public, max-age=1800, stale-while-revalidate=3600')
    return res.json(result)
  } catch (err: any) {
    console.error('[CineMatch] Guest recommendation error:', err?.message)
    return res.status(500).json({ error: 'Recommendation service error' })
  }
})

// ── POST /recommendations/interaction ─────────────────────────
// Log user interaction event — triggers cache invalidation + profile update
// This is the real-time event pipeline equivalent
router.post('/interaction', checkJwt, async (req: Request, res: Response) => {
  const userId = (req as any).auth?.payload?.sub as string | undefined
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const { tmdbId, mediaType, eventType, progress, rating } = req.body

  // Validate inputs
  const parsedTmdbId = Number(tmdbId)
  if (!Number.isInteger(parsedTmdbId) || parsedTmdbId <= 0) {
    return res.status(400).json({ error: 'Invalid tmdbId' })
  }
  if (!VALID_MEDIA_TYPES.includes(mediaType)) {
    return res.status(400).json({ error: `Invalid mediaType. Must be: ${VALID_MEDIA_TYPES.join(', ')}` })
  }
  if (!VALID_EVENT_TYPES.includes(eventType)) {
    return res.status(400).json({ error: `Invalid eventType. Must be: ${VALID_EVENT_TYPES.join(', ')}` })
  }
  if (progress !== undefined && (typeof progress !== 'number' || progress < 0 || progress > 1)) {
    return res.status(400).json({ error: 'Invalid progress: must be 0..1' })
  }
  if (rating !== undefined && (typeof rating !== 'number' || rating < 1 || rating > 5)) {
    return res.status(400).json({ error: 'Invalid rating: must be 1..5' })
  }

  try {
    // Fire-and-forget pattern — don't block the response on DB write
    // The UI gets instant feedback; the pipeline updates asynchronously
    logInteraction({
      userId,
      tmdbId: parsedTmdbId,
      mediaType,
      eventType,
      progress,
      rating,
    }).catch(err => console.error('[CineMatch] Interaction log failed:', err))

    // Invalidate route-level cache immediately
    const cacheKey = cache.generateCacheKey('recommendations', userId, '40')
    cache.userData.del(cacheKey)

    return res.status(202).json({ accepted: true })
  } catch (err: any) {
    console.error('[CineMatch] Interaction error:', err?.message)
    return res.status(500).json({ error: 'Failed to log interaction' })
  }
})

export default router
