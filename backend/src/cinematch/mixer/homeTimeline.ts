// ============================================================
// CineMatch AI — Home Mixer (Orchestration Layer)
// X Algorithm equivalent: Home Mixer
//
// Full recommendation pipeline in order:
//   1. getUserProfile    (Query Hydration)
//   2. fetchAllSources   (5 parallel candidate sources)
//   3. applyFilters      (Pre-Scoring Filters)
//   4. rankCandidates    (6-signal Phoenix Scoring + Diversity)
//   5. selectTopK        (Final Selection)
//   6. buildSections     (Post-Selection UI grouping)
//   7. persistCache      (Side Effect)
// ============================================================

import { supabaseAdmin } from '../../lib/supabase'
import NodeCache from 'node-cache'
import { getUserProfile, invalidateUserProfile } from '../features'
import { fetchAllSources } from '../candidates'
import { applyFilters } from '../filtering'
import { rankCandidates } from '../ranking'
import {
  ScoredCandidate,
  RecommendationResult,
  RecommendationSection,
  UserProfile,
} from '../types'
import { buildSections } from './sectionBuilder'

// L1 in-memory cache — fastest serving layer (5 min TTL)
const recCache = new NodeCache({ stdTTL: 300, checkperiod: 60 })

const TOP_K = 300           // Total candidates to return
const CACHE_TTL_DB = 300    // Seconds to persist in Supabase RecommendationCache
const STALE_WHILE_REVALIDATE_TTL = 600  // Serve stale cache up to 10 min, recompute in bg


// ── Supabase Cache Persistence ────────────────────────────
async function persistToDb(userId: string, ranked: ScoredCandidate[]): Promise<void> {
  try {
    await supabaseAdmin
      .from('RecommendationCache')
      .upsert({
        userId,
        recommendations: ranked,
        computedAt: new Date().toISOString(),
        ttlSeconds: CACHE_TTL_DB,
      }, { onConflict: 'userId' })
  } catch {
    // Non-critical — in-memory cache still works
  }
}

// ── Read from Supabase cache (with stale-while-revalidate support) ──────────
interface DbCacheResult {
  candidates: ScoredCandidate[]
  isStale: boolean
}

async function readFromDb(userId: string): Promise<DbCacheResult | null> {
  try {
    const { data } = await supabaseAdmin
      .from('RecommendationCache')
      .select('recommendations, computedAt, ttlSeconds')
      .eq('userId', userId)
      .single()

    if (!data) return null
    const ageSeconds = (Date.now() - new Date(data.computedAt).getTime()) / 1000

    // Hard-expired: too stale to serve even as fallback
    if (ageSeconds > STALE_WHILE_REVALIDATE_TTL) return null

    return {
      candidates: data.recommendations as ScoredCandidate[],
      isStale: ageSeconds > data.ttlSeconds,  // true = past TTL but within SWR window
    }
  } catch {
    return null
  }
}

// ── MAIN PIPELINE ─────────────────────────────────────────
export async function getRecommendations(
  userId: string,
  options: { limit?: number; forceRefresh?: boolean; useVectorML?: boolean } = {}
): Promise<RecommendationResult> {
  const limit = options.limit ?? TOP_K
  const startTime = Date.now()

  // L1: In-memory cache (fastest path — ~1ms)
  if (!options.forceRefresh) {
    const cached = recCache.get<ScoredCandidate[]>(userId)
    if (cached) {
      const profile = await getUserProfile(userId)
      return {
        userId,
        items: cached.slice(0, limit),
        sections: buildSections(cached.slice(0, limit), profile),
        computedAt: new Date().toISOString(),
        isPersonalized: !profile.isNewUser,
      }
    }
  }

  // Step 1: Query Hydration — build user profile
  const profile = await getUserProfile(userId)

  // L2: Supabase cache with stale-while-revalidate
  // — FRESH:  serve from DB, promote to L1, done (fast path ~50ms)
  // — STALE:  serve immediately from DB, trigger background rebuild
  // — ABSENT: fall through to full pipeline
  if (!options.forceRefresh && !profile.isNewUser) {
    const dbResult = await readFromDb(userId)
    if (dbResult) {
      recCache.set(userId, dbResult.candidates)  // promote to L1

      if (dbResult.isStale) {
        // Fire-and-forget recompute so next request hits fresh L1/L2
        setImmediate(async () => {
          try {
            const rawCandidates = await fetchAllSources(profile)
            const filtered = applyFilters(rawCandidates, profile)
            const ranked = await rankCandidates(filtered, profile)
            const topK = ranked.slice(0, limit)
            recCache.set(userId, topK)
            persistToDb(userId, topK).catch(() => {})
          } catch { /* non-critical background refresh */ }
        })
      }

      return {
        userId,
        items: dbResult.candidates.slice(0, limit),
        sections: buildSections(dbResult.candidates.slice(0, limit), profile),
        computedAt: new Date().toISOString(),
        isPersonalized: true,
      }
    }
  }

  // Step 2: Candidate Sourcing (all sources in parallel, with 6s timeout guard)
  // The timeout ensures slow sources (collaborative, graphTraversal) never block
  // the response. They simply contribute 0 candidates for this request.
  const sourcesPromise = fetchAllSources(profile, options.useVectorML)
  const rawCandidates = await Promise.race([
    sourcesPromise,
    new Promise<Awaited<ReturnType<typeof fetchAllSources>>>(resolve =>
      setTimeout(() => resolve([]), 6000)
    ),
  ])

  // Step 3: Pre-Scoring Filters
  const filtered = applyFilters(rawCandidates, profile)

  // Step 4: 6-Signal Ranking Engine
  const ranked = await rankCandidates(filtered, profile)

  // Step 5: Select Top-K
  const topK = ranked.slice(0, limit)

  // Step 6: Persist to caches (async, non-blocking)
  const pipelineMs = Date.now() - startTime
  recCache.set(userId, topK)
  persistToDb(userId, topK).catch(() => {})

  // Profiling removed for production

  return {
    userId,
    items: topK,
    sections: buildSections(topK, profile),
    computedAt: new Date().toISOString(),
    isPersonalized: !profile.isNewUser,
    pipelineMs,
  }
}

// ── Guest Recommendations (Cold-Start / No Auth) ──────────
// Globally trending + popular blend for unauthenticated users.
// Cached globally for 30 minutes (same content for everyone).
export async function getGuestRecommendations(): Promise<RecommendationResult> {
  const GUEST_CACHE_KEY = '__guest__'
  const cached = recCache.get<ScoredCandidate[]>(GUEST_CACHE_KEY)

  if (cached) {
    const trendingItems = cached.filter(c => c.source === 'trending').slice(0, 40)
    const popularItems = cached.filter(c => c.source === 'popular_fallback').slice(0, 40)
    const topRated = [...cached].sort((a, b) => b.qualityScore - a.qualityScore).slice(0, 40)
    const genreItems = cached.filter(c => c.source === 'genre_discovery').slice(0, 40)
    return {
      userId: null,
      items: cached,
      sections: [
        ...(trendingItems.length >= 5 ? [{ title: 'Trending This Week', items: trendingItems, source: 'trending' as const }] : []),
        ...(popularItems.length >= 5 ? [{ title: 'Most Popular Right Now', items: popularItems, source: 'popular_fallback' as const }] : []),
        ...(topRated.length >= 5 ? [{ title: 'Top Rated All Time', items: topRated, source: 'tmdb_recommendations' as const }] : []),
        ...(genreItems.length >= 5 ? [{ title: 'Discover New Favourites', items: genreItems, source: 'genre_discovery' as const }] : []),
      ],
      computedAt: new Date().toISOString(),
      isPersonalized: false,
    }
  }

  const guestProfile = {
    userId: 'guest',
    genreVector: {} as Record<number, number>,
    keywordVector: {} as Record<number, number>,
    castVector: {} as Record<number, number>,
    directorVector: {} as Record<string, number>,
    decadeVector: {} as Record<string, number>,
    watchedIds: new Set<number>(),
    favoritedIds: new Set<number>(),
    dislikedIds: new Set<number>(),
    categoryDislikeCounts: {} as Record<string, number>,
    recentlyWatched: [],
    isNewUser: true,
  }

  const rawCandidates = await fetchAllSources(guestProfile)
  const filtered = applyFilters(rawCandidates, guestProfile)
  const ranked = await rankCandidates(filtered, guestProfile)
  const topK = ranked.slice(0, TOP_K)

  recCache.set(GUEST_CACHE_KEY, topK, 1800)  // 30 min global cache

  // For guests: build richer sections from available content
  const trendingItems = topK.filter(c => c.source === 'trending').slice(0, 40)
  const popularItems = topK.filter(c => c.source === 'popular_fallback').slice(0, 40)
  const topRatedItems = [...topK].sort((a, b) => b.qualityScore - a.qualityScore).slice(0, 40)
  const genreItems = topK.filter(c => c.source === 'genre_discovery').slice(0, 40)

  const guestSections = [
    trendingItems.length >= 5 ? { title: 'Trending This Week', items: trendingItems, source: 'trending' as const } : null,
    popularItems.length >= 5 ? { title: 'Most Popular Right Now', items: popularItems, source: 'popular_fallback' as const } : null,
    topRatedItems.length >= 5 ? { title: 'Top Rated All Time', items: topRatedItems, source: 'tmdb_recommendations' as const } : null,
    genreItems.length >= 5 ? { title: 'Discover New Favourites', items: genreItems, source: 'genre_discovery' as const } : null,
  ].filter((s): s is NonNullable<typeof s> => s !== null)

  return {
    userId: null,
    items: topK,
    sections: guestSections,
    computedAt: new Date().toISOString(),
    isPersonalized: false,
  }
}

// ── Cache Invalidation ────────────────────────────────────
export function invalidateRecommendationCache(userId: string): void {
  recCache.del(userId)
  invalidateUserProfile(userId)
  // Also delete stale Supabase cache (async, non-blocking)
  void (async () => {
    try {
      await supabaseAdmin
        .from('RecommendationCache')
        .delete()
        .eq('userId', userId)
    } catch {
      // Non-critical side-effect
    }
  })()
}
