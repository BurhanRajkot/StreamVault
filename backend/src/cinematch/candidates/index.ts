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

export async function fetchAllSources(profile: UserProfile, useVectorML = false): Promise<Candidate[]> {
  const primaryType: MediaType =
    profile.recentlyWatched[0]?.mediaType ?? 'movie'

  if (useVectorML) {
    // ML Mode: Vector + TMDB signals + graph traversal, fused via RRF
    const [mlVectors, similar, recommendations, trending, graphTraversal] = await Promise.allSettled([
      mlVectorSource(profile.userId, profile),
      tmdbSimilarSource(profile),
      tmdbRecommendationsSource(profile),
      trendingSource(primaryType),
      graphTraversalSource(profile),  // Phase 3: surfaces director/actor filmographies
    ])

    return rrfFuse([
      { source: 'tmdb_recommendations', candidates: mlVectors.status === 'fulfilled' ? mlVectors.value : [] },
      { source: 'tmdb_similar',         candidates: similar.status === 'fulfilled' ? similar.value : [] },
      { source: 'tmdb_recommendations', candidates: recommendations.status === 'fulfilled' ? recommendations.value : [] },
      { source: 'trending',             candidates: trending.status === 'fulfilled' ? trending.value : [] },
      { source: 'graph_traversal',      candidates: graphTraversal.status === 'fulfilled' ? graphTraversal.value : [] },
    ])
  }

  // Standard heuristic pipeline — all 9 sources in parallel
  const [similar, recommendations, trending, fallback, collaborative, genreDisc, keywordDisc, castDisc, graphTraversal] =
    await Promise.allSettled([
      tmdbSimilarSource(profile),
      tmdbRecommendationsSource(profile),
      trendingSource(primaryType),
      popularFallbackSource(profile),
      collaborativeSource(profile),
      genreDiscoverySource(profile),
      keywordDiscoverySource(profile),
      castDiscoverySource(profile),
      graphTraversalSource(profile),  // Phase 3
    ])

  // RRF fusion — each source is in its own ranked ordering
  return rrfFuse([
    { source: 'tmdb_similar',         candidates: similar.status === 'fulfilled' ? similar.value : [] },
    { source: 'tmdb_recommendations', candidates: recommendations.status === 'fulfilled' ? recommendations.value : [] },
    { source: 'trending',             candidates: trending.status === 'fulfilled' ? trending.value : [] },
    { source: 'popular_fallback',     candidates: fallback.status === 'fulfilled' ? fallback.value : [] },
    { source: 'collaborative',        candidates: collaborative.status === 'fulfilled' ? collaborative.value : [] },
    { source: 'genre_discovery',      candidates: genreDisc.status === 'fulfilled' ? genreDisc.value : [] },
    { source: 'keyword_discovery',    candidates: keywordDisc.status === 'fulfilled' ? keywordDisc.value : [] },
    { source: 'cast_discovery',       candidates: castDisc.status === 'fulfilled' ? castDisc.value : [] },
    { source: 'graph_traversal',      candidates: graphTraversal.status === 'fulfilled' ? graphTraversal.value : [] },
  ])
}
