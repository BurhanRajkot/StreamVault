// ============================================================
// CineMatch AI — Recommendations API Route
// Backend serving layer — equivalent to X's Feed Serving API
//
// Endpoints:
//   GET  /recommendations              → personalized (auth required)
//   GET  /recommendations/guest        → cold-start (no auth)
//   GET  /recommendations/profile      → user taste profile (auth required) [NEW]
//   POST /recommendations/interaction  → log user event (auth required)
//   DELETE /recommendations/history   → reset recommendation history [NEW]
//   GET  /recommendations/debug/:userId → pipeline debug (admin only) [NEW]
// ============================================================

// ── Dependencies ────────────────────────────────────────────
import { Router, Request, Response } from 'express'
import rateLimit from 'express-rate-limit'
import { checkJwt } from '../middleware/auth'
import { requireAdminAuth } from '../admin/middleware'
import { getRecommendations, getGuestRecommendations, invalidateRecommendationCache } from '../cinematch/homeMixer'
import { logInteraction } from '../cinematch/interactionTracker'
import { getUserProfile } from '../cinematch/featureStore'
import { EventType, MediaType, TMDB_GENRES, UserTasteProfile } from '../cinematch/types'
import { supabaseAdmin } from '../lib/supabase'
import * as cache from '../services/cache'
import { logger } from '../lib/logger'

const router = Router()

// ── Validation constants ──────────────────────────────────
const VALID_MEDIA_TYPES: MediaType[] = ['movie', 'tv']
const VALID_EVENT_TYPES: EventType[] = ['watch', 'favorite', 'click', 'search', 'rate', 'dislike']

// ── Dedicated rate limiter for interaction events ─────────
// Stricter than global (20 req/min vs. global 100/min)
// Prevents interaction-flooding attacks that could corrupt profile
const interactionRateLimiter = rateLimit({
  windowMs: 60 * 1000,    // 1 minute
  max: 20,                 // 20 interactions per minute per user
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many interaction events. Slow down.' },
  // Key by userId (from JWT) so authenticated users get their own limit bucket.
  // Fall back to a static key — express-rate-limit itself handles IP keying safely.
  keyGenerator: (req: Request) => {
    const userId = (req as any).auth?.payload?.sub as string | undefined
    return userId ?? 'anonymous'
  },
})

// ── GET /recommendations ──────────────────────────────────
// Personalized recommendations for authenticated user.
// Pipeline: user profile → candidates → filters → ranking → cache → serve.
router.get('/', checkJwt, async (req: Request, res: Response) => {
  const userId = (req as any).auth?.payload?.sub as string | undefined
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  try {
    const forceRefresh = req.query.refresh === 'true'
    const limit = Math.min(Number(req.query.limit) || 40, 100)

    // L1 route-level cache check (before pipeline — ~0ms)
    const cacheKey = cache.generateCacheKey('recommendations', userId, String(limit))
    if (!forceRefresh) {
      const cached = cache.userData.get(cacheKey)
      if (cached) {
        res.setHeader('X-Cache', 'HIT')
        res.setHeader('X-CineMatch-Pipeline', 'route-cache')
        return res.json(cached)
      }
    }

    const result = await getRecommendations(userId, { limit, forceRefresh })

    cache.userData.set(cacheKey, result, 300)
    res.setHeader('X-Cache', 'MISS')
    res.setHeader('X-CineMatch-Pipeline', result.pipelineMs !== undefined ? `live-${result.pipelineMs}ms` : 'live')
    res.setHeader('Cache-Control', 'private, max-age=300')
    return res.json(result)
  } catch (err: any) {
    logger.error('CineMatch recommendation error', { error: err?.message })
    return res.status(500).json({ error: 'Recommendation service error' })
  }
})

// ── GET /recommendations/guest ────────────────────────────
// Cold-start / unauthenticated users — trending + popular blend.
router.get('/guest', async (_req: Request, res: Response) => {
  try {
    const cacheKey = 'recommendations:guest'
    const cached = cache.tmdb.get(cacheKey)
    if (cached) {
      res.setHeader('X-Cache', 'HIT')
      return res.json(cached)
    }

    const result = await getGuestRecommendations()

    cache.tmdb.set(cacheKey, result, 1800)
    res.setHeader('X-Cache', 'MISS')
    res.setHeader('Cache-Control', 'public, max-age=1800, stale-while-revalidate=3600')
    return res.json(result)
  } catch (err: any) {
    logger.error('CineMatch guest recommendation error', { error: err?.message })
    return res.status(500).json({ error: 'Recommendation service error' })
  }
})

// ── GET /recommendations/profile ─────────────────────────
// Returns user's computed taste vectors (genre, keyword, cast).
// Powers a "Your Taste Profile" UI card.
router.get('/profile', checkJwt, async (req: Request, res: Response) => {
  const userId = (req as any).auth?.payload?.sub as string | undefined
  if (!userId) return res.status(401).json({ error: 'Unauthorized' })

  try {
    const profile = await getUserProfile(userId)

    // Get last interaction timestamp
    const { data: lastInteraction } = await supabaseAdmin
      .from('UserInteractions')
      .select('createdAt')
      .eq('userId', userId)
      .order('createdAt', { ascending: false })
      .limit(1)
      .single()

    const { count: interactionCount } = await supabaseAdmin
      .from('UserInteractions')
      .select('*', { count: 'exact', head: true })
      .eq('userId', userId)

    // Format top genres with human-readable names
    const topGenres = Object.entries(profile.genreVector)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([genreId, weight]) => ({
        genreId: Number(genreId),
        name: TMDB_GENRES[Number(genreId)] || `Genre ${genreId}`,
        weight: Math.round(weight * 100) / 100,
      }))

    const topKeywords = Object.entries(profile.keywordVector)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([kwId, weight]) => ({
        keywordId: Number(kwId),
        weight: Math.round(weight * 100) / 100,
      }))

    const topCastIds = Object.entries(profile.castVector)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([personId, weight]) => ({
        personId: Number(personId),
        weight: Math.round(weight * 100) / 100,
      }))

    const tasteProfile: UserTasteProfile = {
      userId,
      interactionCount: interactionCount || 0,
      topGenres,
      topKeywords,
      topCastIds,
      isNewUser: profile.isNewUser,
      lastUpdated: lastInteraction?.createdAt || null,
    }

    res.setHeader('Cache-Control', 'private, max-age=60')
    return res.json(tasteProfile)
  } catch (err: any) {
    logger.error('CineMatch profile error', { error: err?.message })
    return res.status(500).json({ error: 'Failed to build taste profile' })
  }
})

// ── POST /recommendations/interaction ─────────────────────
// Log a user interaction event — triggers cache invalidation.
// Rate-limited to 20/min per user to prevent flooding.
router.post('/interaction', checkJwt, interactionRateLimiter, async (req: Request, res: Response) => {
  const userId = (req as any).auth?.payload?.sub as string | undefined
  if (!userId) return res.status(401).json({ error: 'Unauthorized' })

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
    // Fire-and-forget — don't block the response on DB write
    logInteraction({ userId, tmdbId: parsedTmdbId, mediaType, eventType, progress, rating })
      .catch(err => logger.error('CineMatch interaction log failed', { error: err?.message }))

    // Invalidate route-level cache immediately (profile update is async)
    const cacheKey = cache.generateCacheKey('recommendations', userId, '40')
    cache.userData.del(cacheKey)

    return res.status(202).json({ accepted: true })
  } catch (err: any) {
    logger.error('CineMatch interaction error', { error: err?.message })
    return res.status(500).json({ error: 'Failed to log interaction' })
  }
})

// ── DELETE /recommendations/history ──────────────────────
// GDPR-compliant "Reset my recommendations" — deletes all user interactions
// and both cache layers. Next request will be treated as a new user.
router.delete('/history', checkJwt, async (req: Request, res: Response) => {
  const userId = (req as any).auth?.payload?.sub as string | undefined
  if (!userId) return res.status(401).json({ error: 'Unauthorized' })

  try {
    // Delete all interaction events
    const { error: intError } = await supabaseAdmin
      .from('UserInteractions')
      .delete()
      .eq('userId', userId)

    if (intError) throw intError

    // Delete genre profile
    await supabaseAdmin
      .from('UserGenreProfile')
      .delete()
      .eq('userId', userId)

    // Invalidate all caches
    invalidateRecommendationCache(userId)
    cache.userData.invalidateUser(userId)

    logger.info('CineMatch history reset', { userId })
    return res.status(200).json({ message: 'Recommendation history cleared.' })
  } catch (err: any) {
    logger.error('CineMatch history delete error', { error: err?.message })
    return res.status(500).json({ error: 'Failed to clear history' })
  }
})

// ── GET /recommendations/debug/:userId ───────────────────
// Admin-only: full pipeline breakdown for a given user.
// Shows raw candidate count, filter drop, and top 20 ranked items with
// all 6 sub-scores. Essential for diagnosing bad recommendation quality.
router.get('/debug/:userId', requireAdminAuth, async (req: Request, res: Response) => {
  const { userId } = req.params
  if (!userId) return res.status(400).json({ error: 'userId required' })

  try {
    // Force a fresh pipeline run (bypass all caches)
    const result = await getRecommendations(userId, { forceRefresh: true, limit: 20 })

    const profile = await getUserProfile(userId)

    return res.json({
      userId,
      pipelineMs: result.pipelineMs,
      isPersonalized: result.isPersonalized,
      isNewUser: profile.isNewUser,
      genreVectorSample: Object.entries(profile.genreVector)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([g, w]) => ({ genre: TMDB_GENRES[Number(g)] || g, weight: w })),
      keywordVectorSize: Object.keys(profile.keywordVector).length,
      castVectorSize: Object.keys(profile.castVector).length,
      recentlyWatched: profile.recentlyWatched,
      sectionTitles: result.sections.map(s => `${s.title} (${s.items.length} items)`),
      topRanked: result.items.slice(0, 20).map(item => ({
        title: item.title,
        source: item.source,
        score: Math.round(item.score * 1000) / 1000,
        genreAffinityScore: Math.round(item.genreAffinityScore * 100) / 100,
        keywordAffinityScore: Math.round(item.keywordAffinityScore * 100) / 100,
        castAffinityScore: Math.round(item.castAffinityScore * 100) / 100,
        popularityScore: Math.round(item.popularityScore * 100) / 100,
        freshnessScore: Math.round(item.freshnessScore * 100) / 100,
        qualityScore: Math.round(item.qualityScore * 100) / 100,
        sourceReason: item.sourceReason,
      })),
    })
  } catch (err: any) {
    logger.error('CineMatch debug error', { error: err?.message })
    return res.status(500).json({ error: 'Pipeline debug failed' })
  }
})

export default router
