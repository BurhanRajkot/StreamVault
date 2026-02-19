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
//   6. buildSectionsV2   (Post-Selection UI grouping)
//   7. persistCache      (Side Effect)
// ============================================================

import { supabaseAdmin } from '../lib/supabase'
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

// L1 in-memory cache — fastest serving layer (5 min TTL)
const recCache = new NodeCache({ stdTTL: 300, checkperiod: 60 })

const TOP_K = 50            // Total candidates to return (increased from 40)
const SECTION_SIZE = 15     // Items per UI section
const CACHE_TTL_DB = 300    // Seconds to persist in Supabase RecommendationCache

// ── Section Builder V2 ────────────────────────────────────
// Produces named, intent-driven UI row groups for the homepage.
// Sections are ordered from most-personalized to least-personalized.
function buildSectionsV2(
  ranked: ScoredCandidate[],
  profile: UserProfile,
): RecommendationSection[] {
  const sections: RecommendationSection[] = []

  // ── "Recommended For You" — always first (top overall score) ──
  const topPicks = ranked.slice(0, SECTION_SIZE)
  sections.push({
    title: 'Recommended For You',
    items: topPicks,
    source: 'tmdb_recommendations',
  })

  // ── "Because you watched X" — one section per seed title ──────
  // Uses source = tmdb_similar, grouped by seed title match
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

  // ── "Fans Like You Also Watched" — collaborative source ───────
  const collaborative = ranked
    .filter(c => c.source === 'collaborative')
    .slice(0, SECTION_SIZE)
  if (collaborative.length >= 3) {
    sections.push({
      title: 'Fans Like You Also Watched',
      items: collaborative,
      source: 'collaborative',
    })
  }

  // ── "Hidden Gems" — high quality, low mainstream popularity ───
  // Quality signal > 0.70 AND popularity score < 0.35
  // These are critically well-received but not algorithmically dominant
  const hiddenGems = ranked
    .filter(c => c.qualityScore > 0.70 && c.popularityScore < 0.35)
    .sort((a, b) => b.qualityScore - a.qualityScore)
    .slice(0, SECTION_SIZE)
  if (hiddenGems.length >= 3) {
    sections.push({
      title: 'Hidden Gems',
      items: hiddenGems,
      source: 'tmdb_recommendations',
    })
  }

  // ── "New Releases" — content from the last 6 months ──────────
  const sixMonthsAgo = new Date(Date.now() - 180 * 86_400_000)
  const newReleases = ranked
    .filter(c => c.releaseDate && new Date(c.releaseDate) > sixMonthsAgo)
    .sort((a, b) => new Date(b.releaseDate).getTime() - new Date(a.releaseDate).getTime())
    .slice(0, SECTION_SIZE)
  if (newReleases.length >= 3) {
    sections.push({
      title: 'New Releases',
      items: newReleases,
      source: 'trending',
    })
  }

  // ── "Trending This Week" — always present ─────────────────────
  const trending = ranked
    .filter(c => c.source === 'trending')
    .slice(0, SECTION_SIZE)
  if (trending.length >= 3) {
    sections.push({ title: 'Trending This Week', items: trending, source: 'trending' })
  }

  return sections
}

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

// ── Read from Supabase cache ──────────────────────────────
async function readFromDb(userId: string): Promise<ScoredCandidate[] | null> {
  try {
    const { data } = await supabaseAdmin
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

// ── MAIN PIPELINE ─────────────────────────────────────────
export async function getRecommendations(
  userId: string,
  options: { limit?: number; forceRefresh?: boolean } = {}
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
        sections: buildSectionsV2(cached.slice(0, limit), profile),
        computedAt: new Date().toISOString(),
        isPersonalized: !profile.isNewUser,
      }
    }
  }

  // Step 1: Query Hydration — build user profile
  const profile = await getUserProfile(userId)

  // L2: Supabase cache (fast path — ~50ms for returning users)
  if (!options.forceRefresh && !profile.isNewUser) {
    const dbCached = await readFromDb(userId)
    if (dbCached) {
      recCache.set(userId, dbCached)
      return {
        userId,
        items: dbCached.slice(0, limit),
        sections: buildSectionsV2(dbCached.slice(0, limit), profile),
        computedAt: new Date().toISOString(),
        isPersonalized: true,
      }
    }
  }

  // Step 2: Candidate Sourcing (5 parallel sources)
  const rawCandidates = await fetchAllSources(profile)

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

  console.log(
    `[CineMatch] Pipeline: ${pipelineMs}ms | ` +
    `${rawCandidates.length} raw → ${filtered.length} filtered → ${topK.length} ranked`
  )

  return {
    userId,
    items: topK,
    sections: buildSectionsV2(topK, profile),
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
    return {
      userId: null,
      items: cached,
      sections: [
        { title: 'Trending This Week', items: cached.filter(c => c.source === 'trending').slice(0, SECTION_SIZE), source: 'trending' },
        { title: 'Popular Right Now', items: cached.filter(c => c.source === 'popular_fallback').slice(0, SECTION_SIZE), source: 'popular_fallback' },
        { title: 'Top Rated', items: [...cached].sort((a, b) => b.qualityScore - a.qualityScore).slice(0, SECTION_SIZE), source: 'tmdb_recommendations' },
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
    watchedIds: new Set<number>(),
    favoritedIds: new Set<number>(),
    dislikedIds: new Set<number>(),
    recentlyWatched: [],
    isNewUser: true,
  }

  const rawCandidates = await fetchAllSources(guestProfile)
  const filtered = applyFilters(rawCandidates, guestProfile)
  const ranked = await rankCandidates(filtered, guestProfile)
  const topK = ranked.slice(0, TOP_K)

  recCache.set(GUEST_CACHE_KEY, topK, 1800)  // 30 min global cache

  return {
    userId: null,
    items: topK,
    sections: [
      { title: 'Trending This Week', items: topK.filter(c => c.source === 'trending').slice(0, SECTION_SIZE), source: 'trending' },
      { title: 'Popular Right Now', items: topK.filter(c => c.source === 'popular_fallback').slice(0, SECTION_SIZE), source: 'popular_fallback' },
      { title: 'Top Rated', items: [...topK].sort((a, b) => b.qualityScore - a.qualityScore).slice(0, SECTION_SIZE), source: 'tmdb_recommendations' },
    ],
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
