import { describe, it, expect } from 'bun:test'
import { scoreCandidate, buildSessionContext, scoreCandidates } from './phoenixScorer'
import { Candidate, UserProfile } from '../types'
import { RankingWeights } from './dynamicWeights'

describe('Phoenix Scorer', () => {
  const mockWeights: RankingWeights = {
    genreAffinity: 1.0,
    keywordAffinity: 1.0,
    castAffinity: 1.0,
    popularity: 0.5,
    freshness: 0.5,
    quality: 0.5,
  }

  const mockProfile: UserProfile = {
    userId: 'user123',
    genreVector: { 28: 1.0, 12: 0.5 }, // 28 is Action, 12 is Adventure
    castVector: { 101: 0.8 },
    keywordVector: { 201: 0.6 },
    directorVector: {},
    decadeVector: { 2020: 0.9 },
    recentlyWatched: [],
    watchedIds: new Set(),
    favoritedIds: new Set(),
    dislikedIds: new Set(),
    categoryDislikeCounts: {},
    isNewUser: false
  }

  const createCandidate = (overrides: Partial<Candidate> = {}): Candidate => ({
    tmdbId: 1,
    mediaType: 'movie',
    title: 'Test Movie',
    posterPath: null,
    backdropPath: null,
    overview: 'Test',
    releaseDate: '2023-01-01',
    popularity: 100,
    genreIds: [28], // Action
    source: 'trending',
    voteCount: 1000,
    voteAverage: 8.0,
    ...overrides
  } as Candidate)

  it('should calculate base score using weights', () => {
    const candidate = createCandidate()
    const result = scoreCandidate(candidate, mockProfile, mockWeights)
    
    expect(result.score).toBeGreaterThan(0)
    expect(result.genreAffinityScore).toBeGreaterThan(0)
    expect(result.sourceReason).toBe('Trending this week')
  })

  it('should boost score for matching genres', () => {
    const candidateMatch = createCandidate({ genreIds: [28] }) // Match
    const candidateNoMatch = createCandidate({ genreIds: [35] }) // No Match (Comedy)
    
    const res1 = scoreCandidate(candidateMatch, mockProfile, mockWeights)
    const res2 = scoreCandidate(candidateNoMatch, mockProfile, mockWeights)
    
    expect(res1.score).toBeGreaterThan(res2.score)
  })

  it('should handle source boosting', () => {
    const candidateTrending = createCandidate({ source: 'trending' })
    const candidateSimilar = createCandidate({ source: 'tmdb_similar' })
    
    const res1 = scoreCandidate(candidateTrending, mockProfile, mockWeights)
    const res2 = scoreCandidate(candidateSimilar, mockProfile, mockWeights)
    
    // tmdb_similar has higher source boost than trending
    expect(res2.score).toBeGreaterThan(res1.score)
  })

  describe('Session Context', () => {
    it('should build session context correctly from recently watched', async () => {
      const profileWithRecent: UserProfile = {
        ...mockProfile,
        recentlyWatched: [
          { tmdbId: 1, mediaType: 'movie', title: 'Recent Movie', weight: 1.0 }
        ]
      }
      
      const session = await buildSessionContext(profileWithRecent)
      expect(session.sessionGenreIds).toContain(28)
      expect(session.sessionCastIds).toContain(101)
    })

    it('should return empty session if no recently watched items', async () => {
      const session = await buildSessionContext(mockProfile)
      expect(session.sessionGenreIds.length).toBe(0)
      expect(session.sessionCastIds.length).toBe(0)
    })
  })

  describe('scoreCandidates batch processing', () => {
    it('should process candidates with session momentum boost', () => {
      const candidates = [
        createCandidate({ tmdbId: 1, genreIds: [28] }), // matches session genre
        createCandidate({ tmdbId: 2, genreIds: [35] })  // no match
      ]
      
      const session = {
        sessionGenreIds: [28],
        sessionCastIds: [],
        sessionKeywordIds: []
      }
      
      const results = scoreCandidates(candidates, mockProfile, mockWeights, session)
      
      expect(results.length).toBe(2)
      // The session momentum boost should push candidate 1 higher
      expect(results[0].score).toBeGreaterThan(results[1].score)
    })
  })
})
