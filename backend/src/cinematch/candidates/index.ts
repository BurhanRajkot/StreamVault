import { Candidate, UserProfile, MediaType } from '../types'
import { tmdbSimilarSource } from './tmdbSimilar'
import { tmdbRecommendationsSource } from './tmdbRecommendations'
import { trendingSource } from './trending'
import { popularFallbackSource } from './popularFallback'
import { collaborativeSource } from './collaborative'
import { genreDiscoverySource } from './genreDiscovery'
import { keywordDiscoverySource } from './keywordDiscovery'
import { castDiscoverySource } from './castDiscovery'

export async function fetchAllSources(profile: UserProfile): Promise<Candidate[]> {
  const primaryType: MediaType =
    profile.recentlyWatched[0]?.mediaType ?? 'movie'

  const [similar, recommendations, trending, fallback, collaborative, genreDisc, keywordDisc, castDisc] = await Promise.allSettled([
    tmdbSimilarSource(profile),
    tmdbRecommendationsSource(profile),
    trendingSource(primaryType),
    popularFallbackSource(profile),
    collaborativeSource(profile),
    genreDiscoverySource(profile),
    keywordDiscoverySource(profile),
    castDiscoverySource(profile),
  ])

  const allCandidates: Candidate[] = [
    ...(similar.status === 'fulfilled' ? similar.value : []),
    ...(recommendations.status === 'fulfilled' ? recommendations.value : []),
    ...(trending.status === 'fulfilled' ? trending.value : []),
    ...(fallback.status === 'fulfilled' ? fallback.value : []),
    ...(collaborative.status === 'fulfilled' ? collaborative.value : []),
    ...(genreDisc.status === 'fulfilled' ? genreDisc.value : []),
    ...(keywordDisc.status === 'fulfilled' ? keywordDisc.value : []),
    ...(castDisc.status === 'fulfilled' ? castDisc.value : []),
  ]

  return allCandidates
}
