// ============================================================
// CineMatch AI — Home Mixer (Orchestration Layer)
// X Algorithm equivalent: Home Mixer
//
// Assembles the full recommendation pipeline in order:
//   1. getUserProfile    (Query Hydration)
//   2. fetchAllSources   (Candidate Sourcing — parallel)
//   3. hydrateFeatures   (already done in featureStore)
//   4. applyFilters      (Pre-Scoring Filters)
//   5. rankCandidates    (Phoenix Scoring → Weighted → Diversity)
//   6. selectTopK        (Final Selection)
//   7. persistCache      (Side Effect)
//   8. Return sections   (Post-Selection: group into UI sections)
// ============================================================

import { createClient } from '@supabase/supabase-js'
import NodeCache from 'node-cache'
import { getUserProfile, invalidateUserProfile } from './featureStore'
import { fetchAllSources } from './candidateSources'
import { applyFilters } from './filters'
import { rankCandidates } from './rankingEngine'
import {
  ScoredCandidate,
  RecommendationResult,
  RecommendationSection,
  UserProfile,
} from './types'

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
)

// L1 in-memory cache — fastest serving layer (5 min TTL)
const recCache = new NodeCache({ stdTTL: 300, checkperiod: 60 })

const TOP_K = 40            // Total candidates to return
const SECTION_SIZE = 15     // Items per UI section
const CACHE_TTL_DB = 300    // Seconds to persist in Supabase RecommendationCache

// ── Section Grouping ──────────────────────────────────────────
// Groups ranked candidates into named UI sections
// "Because you watched X", "Trending this week", etc.
function buildSections(
  ranked: ScoredCandidate[],
  profile: UserProfile,
): RecommendationSection[] {
  const sections: RecommendationSection[] = []

  // "Because you watched X" sections — one per recent watch seed
  const seedTitles = profile.recentlyWatched.slice(0, 2).map(r => r.title)

  for (const seedTitle of seedTitles) {
    const similar = ranked
      .filter(c =>
        (c.source === 'tmdb_similar' || c.source === 'tmdb_recommendations') &&
        c.sourceReason.includes(seedTitle)
      )
      .slice(0, SECTION_SIZE)

    if (similar.length >= 3) {
      sections.push({
        title: `Because you watched ${seedTitle}`,
        items: similar,
        source: 'tmdb_similar',
      })
    }
  }

  // "Trending this week"
  const trending = ranked
    .filter(c => c.source === 'trending')
    .slice(0, SECTION_SIZE)
  if (trending.length >= 3) {
    sections.push({ title: 'Trending This Week', items: trending, source: 'trending' })
  }

  // "Recommended for you" — top scored regardless of source
  const topPicks = ranked.slice(0, SECTION_SIZE)
  sections.unshift({ title: 'Recommended For You', items: topPicks, source: 'tmdb_recommendations' })

  return sections
}

// ── Supabase Cache Persistence ────────────────────────────────
async function persistToDb(userId: string, ranked: ScoredCandidate[]): Promise<void> {
  try {
    await supabase
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

// ── Read from Supabase cache ──────────────────────────────────
async function readFromDb(userId: string): Promise<ScoredCandidate[] | null> {
  try {
    const { data } = await supabase
      .from('RecommendationCache')
      .select('recommendations, computedAt, ttlSeconds')
      .eq('userId', userId)
      .single()

    if (!data) return null

    const ageSeconds = (Date.now() - new Date(data.computedAt).getTime()) / 1000
    if (ageSeconds > data.ttlSeconds) return null  // Stale

    return data.recommendations as ScoredCandidate[]
  } catch {
    return null
  }
}

// ── MAIN PIPELINE ─────────────────────────────────────────────
export async function getRecommendations(
  userId: string,
  options: { limit?: number; forceRefresh?: boolean } = {}
): Promise<RecommendationResult> {
  const limit = options.limit ?? TOP_K
  const startTime = Date.now()

  // L1: In-memory cache hit (fastest path)
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

  // L2: Supabase cache hit (fast path for returning users)
  if (!options.forceRefresh && !profile.isNewUser) {
    const dbCached = await readFromDb(userId)
    if (dbCached) {
      recCache.set(userId, dbCached)
      return {
        userId,
        items: dbCached.slice(0, limit),
        sections: buildSections(dbCached.slice(0, limit), profile),
        computedAt: new Date().toISOString(),
        isPersonalized: true,
      }
    }
  }

  // Step 2: Candidate Sourcing (Thunder + Phoenix retrieval in parallel)
  const rawCandidates = await fetchAllSources(profile)

  // Step 3: Pre-Scoring Filters
  const filtered = applyFilters(rawCandidates, profile)

  // Step 4: Phoenix-equivalent Ranking Engine
  const ranked = await rankCandidates(filtered, profile)

  // Step 5: Select Top-K
  const topK = ranked.slice(0, limit)

  // Step 6: Side Effects — persist to cache (async, don't block response)
  recCache.set(userId, topK)
  persistToDb(userId, topK).catch(() => {})  // Fire and forget

  const computedAt = new Date().toISOString()

  console.log(`[CineMatch] Pipeline completed in ${Date.now() - startTime}ms | ` +
    `${rawCandidates.length} candidates → ${filtered.length} filtered → ${topK.length} ranked`)

  return {
    userId,
    items: topK,
    sections: buildSections(topK, profile),
    computedAt,
    isPersonalized: !profile.isNewUser,
  }
}

// ── Guest Recommendations (Cold-Start / No Auth) ──────────────
// Equivalent to X's "For You" for logged-out users — globally trending + popular
export async function getGuestRecommendations(): Promise<RecommendationResult> {
  const GUEST_CACHE_KEY = '__guest__'
  const cached = recCache.get<ScoredCandidate[]>(GUEST_CACHE_KEY)

  if (cached) {
    const emptyProfile = {
      userId: 'guest',
      genreVector: {},
      watchedIds: new Set<number>(),
      favoritedIds: new Set<number>(),
      recentlyWatched: [],
      isNewUser: true,
    }
    return {
      userId: null,
      items: cached,
      sections: [
        { title: 'Trending This Week', items: cached.slice(0, SECTION_SIZE), source: 'trending' },
        { title: 'Popular Right Now', items: cached.slice(SECTION_SIZE, SECTION_SIZE * 2), source: 'popular_fallback' },
      ],
      computedAt: new Date().toISOString(),
      isPersonalized: false,
    }
  }

  const emptyProfile = {
    userId: 'guest',
    genreVector: {},
    watchedIds: new Set<number>(),
    favoritedIds: new Set<number>(),
    recentlyWatched: [],
    isNewUser: true,
  }

  const rawCandidates = await fetchAllSources(emptyProfile)
  const filtered = applyFilters(rawCandidates, emptyProfile)
  const ranked = await rankCandidates(filtered, emptyProfile)
  const topK = ranked.slice(0, TOP_K)

  // Cache globally for 30 minutes (same as TMDB cache)
  recCache.set(GUEST_CACHE_KEY, topK, 1800)

  return {
    userId: null,
    items: topK,
    sections: [
      { title: 'Trending This Week', items: topK.slice(0, SECTION_SIZE), source: 'trending' },
      { title: 'Popular Right Now', items: topK.slice(SECTION_SIZE, SECTION_SIZE * 2), source: 'popular_fallback' },
    ],
    computedAt: new Date().toISOString(),
    isPersonalized: false,
  }
}

// ── Cache Invalidation ────────────────────────────────────────
// Called when user posts a new interaction
export function invalidateRecommendationCache(userId: string): void {
  recCache.del(userId)
  invalidateUserProfile(userId)
  // Also invalidate in Supabase (async)
  supabase
    .from('RecommendationCache')
    .delete()
    .eq('userId', userId)
    .then(() => {})
    .catch(() => {})
}
