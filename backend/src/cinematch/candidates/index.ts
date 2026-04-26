// ============================================================
// CineMatch — Candidate Sources Orchestrator (with RRF Fusion)
// ============================================================

import { Candidate, UserProfile, MediaType } from '../types'
import { tmdbSimilarSource } from './tmdbSimilar'
import { tmdbRecommendationsSource } from './tmdbRecommendations'
import { trendingSource } from './trending'
import { popularFallbackSource } from './popularFallback'
import { collaborativeSource } from './collaborative'
import { genreDiscoverySource } from './genreDiscovery'
import { keywordDiscoverySource } from './keywordDiscovery'
import { castDiscoverySource } from './castDiscovery'
import { graphTraversalSource } from './graphTraversal'   // Phase 3: KGAT-lite
import { mlVectorSource } from '../ml/vectorSource'
import { rrfFuse } from './rrfFusion'

const SOURCE_TIMEOUT_MS = Number(process.env.CINEMATCH_SOURCE_TIMEOUT_MS || 2200)

async function withSourceTimeout(
  task: () => Promise<Candidate[]>
): Promise<Candidate[]> {
  try {
    return await Promise.race([
      task(),
      new Promise<Candidate[]>((resolve) => setTimeout(() => resolve([]), SOURCE_TIMEOUT_MS)),
    ])
  } catch {
    return []
  }
}

export async function fetchAllSources(profile: UserProfile, useVectorML = false): Promise<Candidate[]> {
  const primaryType: MediaType =
    profile.recentlyWatched[0]?.mediaType ?? 'movie'

  if (useVectorML) {
    // ML Mode: Vector + TMDB signals + graph traversal, fused via RRF
    const [mlVectors, similar, recommendations, trending, graphTraversal] = await Promise.all([
      withSourceTimeout(() => mlVectorSource(profile.userId, profile)),
      withSourceTimeout(() => tmdbSimilarSource(profile)),
      withSourceTimeout(() => tmdbRecommendationsSource(profile)),
      withSourceTimeout(() => trendingSource(primaryType)),
      withSourceTimeout(() => graphTraversalSource(profile)),  // Phase 3
    ])

    return rrfFuse([
      { source: 'tmdb_recommendations', candidates: mlVectors },
      { source: 'tmdb_similar',         candidates: similar },
      { source: 'tmdb_recommendations', candidates: recommendations },
      { source: 'trending',             candidates: trending },
      { source: 'graph_traversal',      candidates: graphTraversal },
    ])
  }

  // Standard heuristic pipeline — all 9 sources in parallel
  const [similar, recommendations, trending, fallback, collaborative, genreDisc, keywordDisc, castDisc, graphTraversal] =
    await Promise.all([
      withSourceTimeout(() => tmdbSimilarSource(profile)),
      withSourceTimeout(() => tmdbRecommendationsSource(profile)),
      withSourceTimeout(() => trendingSource(primaryType)),
      withSourceTimeout(() => popularFallbackSource(profile)),
      withSourceTimeout(() => collaborativeSource(profile)),
      withSourceTimeout(() => genreDiscoverySource(profile)),
      withSourceTimeout(() => keywordDiscoverySource(profile)),
      withSourceTimeout(() => castDiscoverySource(profile)),
      withSourceTimeout(() => graphTraversalSource(profile)),
    ])

  // RRF fusion — each source is in its own ranked ordering
  return rrfFuse([
    { source: 'tmdb_similar',         candidates: similar },
    { source: 'tmdb_recommendations', candidates: recommendations },
    { source: 'trending',             candidates: trending },
    { source: 'popular_fallback',     candidates: fallback },
    { source: 'collaborative',        candidates: collaborative },
    { source: 'genre_discovery',      candidates: genreDisc },
    { source: 'keyword_discovery',    candidates: keywordDisc },
    { source: 'cast_discovery',       candidates: castDisc },
    { source: 'graph_traversal',      candidates: graphTraversal },
  ])
}
