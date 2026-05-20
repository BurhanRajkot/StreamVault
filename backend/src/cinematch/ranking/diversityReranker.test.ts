import { describe, it, expect } from 'bun:test'
import { applyDiversityReranking } from './diversityReranker'
import { ScoredCandidate, UserProfile } from '../types'

describe('Diversity Reranker', () => {
  const createCandidate = (id: number, score: number, genreIds: number[], popularity: number, qualityScore: number): ScoredCandidate => ({
    tmdbId: id,
    mediaType: 'movie',
    title: `Movie ${id}`,
    posterPath: null,
    backdropPath: null,
    overview: 'Test overview',
    releaseDate: '2023-01-01',
    popularity,
    genreIds,
    source: 'trending',
    voteCount: 1000,
    voteAverage: 8.0,
    score,
    genreAffinityScore: 1.0,
    keywordAffinityScore: 1.0,
    castAffinityScore: 1.0,
    directorAffinityScore: 1.0,
    decadeAffinityScore: 1.0,
    popularityScore: popularity / 100,
    freshnessScore: 1.0,
    qualityScore,
    sourceReason: 'Trending'
  })

  const mockProfile: UserProfile = {
    userId: 'user123',
    genreVector: { 28: 1.0 }, // Likes Action
    castVector: {},
    keywordVector: {},
    directorVector: {},
    decadeVector: {},
    recentlyWatched: [],
    watchedIds: new Set(),
    favoritedIds: new Set(),
    dislikedIds: new Set(),
    categoryDislikeCounts: {},
    isNewUser: false
  }

  it('should apply genre saturation penalty', () => {
    // 4 Action movies in a row
    const candidates = [
      createCandidate(1, 10.0, [28], 100, 0.8),
      createCandidate(2, 9.0, [28], 100, 0.8),
      createCandidate(3, 8.0, [28], 100, 0.8),
      createCandidate(4, 7.0, [28], 100, 0.8),
      createCandidate(5, 6.0, [35], 100, 0.8), // Comedy
    ]

    const reranked = applyDiversityReranking(candidates)
    
    // Original order by score: 1, 2, 3, 4, 5
    // But 4th action movie (Movie 4) should get penalized heavily
    // Movie 5 (Comedy) should surpass it
    
    expect(reranked.length).toBe(5)
    
    const idx4 = reranked.findIndex(c => c.tmdbId === 4)
    const idx5 = reranked.findIndex(c => c.tmdbId === 5)
    
    // Movie 5 should be ranked higher than Movie 4 after penalty
    expect(idx5).toBeLessThan(idx4)
  })

  it('should apply novelty boost for unfamiliar genres', () => {
    // Movie 1: Action (Familiar genre, high affinity)
    // Movie 2: Documentary (Unfamiliar genre, 0 affinity, highly novel)
    const candidates = [
      createCandidate(1, 10.0, [28], 100, 0.8), // Action
      createCandidate(2, 9.8, [99], 100, 0.8),  // Documentary
    ]

    const reranked = applyDiversityReranking(candidates, mockProfile)
    
    // Movie 2 gets novelty boost, should surpass Movie 1
    expect(reranked[0].tmdbId).toBe(2)
    expect(reranked[1].tmdbId).toBe(1)
  })

  it('should apply serendipity boost for unexpected, high-quality content', () => {
    // Movie 1: High popularity (mainstream)
    // Movie 2: Low popularity (unexpected), high quality
    const candidates = [
      createCandidate(1, 9.9, [28], 5000, 0.8),
      createCandidate(2, 9.8, [28], 10, 0.9),
    ]

    const reranked = applyDiversityReranking(candidates, mockProfile)
    
    // Movie 2 is very unexpected (low pop) and high quality -> gets serendipity boost
    expect(reranked[0].tmdbId).toBe(2)
    expect(reranked[1].tmdbId).toBe(1)
  })
})
