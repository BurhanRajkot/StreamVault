import { describe, it, expect } from 'bun:test'
import { scoreCandidate, scoreCandidates, buildSessionContext } from './phoenixScorer'
import { Candidate, UserProfile } from '../types'
import { RankingWeights } from './dynamicWeights'

const baseWeights: RankingWeights = {
  genreAffinity: 1.0,
  keywordAffinity: 0.5,
  castAffinity: 0.5,
  popularity: 0.3,
  freshness: 0.3,
  quality: 0.3,
}

const emptyProfile: UserProfile = {
  userId: 'empty',
  genreVector: {},
  castVector: {},
  keywordVector: {},
  directorVector: {},
  decadeVector: {},
  recentlyWatched: [],
  watchedIds: new Set(),
  favoritedIds: new Set(),
  dislikedIds: new Set(),
  categoryDislikeCounts: {},
  isNewUser: false,
}

const makeCandidate = (overrides: Partial<Candidate> = {}): Candidate => ({
  tmdbId: 1,
  mediaType: 'movie',
  title: 'Test Movie',
  posterPath: null,
  backdropPath: null,
  overview: 'A test movie.',
  releaseDate: '2022-06-15',
  popularity: 100,
  genreIds: [28],
  source: 'trending',
  voteCount: 500,
  voteAverage: 7.0,
  ...overrides,
} as Candidate)

describe('Phoenix Scorer — Extended Tests', () => {
  describe('scoreCandidate', () => {
    it('should return a finite, non-NaN score', () => {
      const c = makeCandidate()
      const result = scoreCandidate(c, emptyProfile, baseWeights)
      expect(isNaN(result.score)).toBe(false)
      expect(isFinite(result.score)).toBe(true)
    })

    it('should return neutral genre affinity (0.3) when user has no genre vector', () => {
      const c = makeCandidate({ genreIds: [28] })
      const result = scoreCandidate(c, emptyProfile, baseWeights)
      // amplify(0.3) = 0.3 * 1.2 = 0.36
      expect(result.genreAffinityScore).toBeCloseTo(0.36, 2)
    })

    it('should give score of 0 for keyword affinity with no matching keywords', () => {
      const profile: UserProfile = { ...emptyProfile, keywordVector: { 999: 1.0 } }
      const c = makeCandidate({ keywords: [1, 2, 3] })
      const result = scoreCandidate(c, profile, baseWeights)
      expect(result.keywordAffinityScore).toBe(0)
    })

    it('should boost cast affinity when candidate cast matches user vector', () => {
      const profile: UserProfile = { ...emptyProfile, castVector: { 101: 0.9 } }
      const cMatch = makeCandidate({ castIds: [101] })
      const cNoMatch = makeCandidate({ castIds: [999] })

      const resMatch = scoreCandidate(cMatch, profile, baseWeights)
      const resNoMatch = scoreCandidate(cNoMatch, profile, baseWeights)

      expect(resMatch.score).toBeGreaterThan(resNoMatch.score)
    })

    it('should boost director affinity when candidate matches user liked director', () => {
      const profile: UserProfile = { ...emptyProfile, directorVector: { 777: 1.0 } }
      const cMatch = makeCandidate({ directorId: 777 })
      const cNoMatch = makeCandidate({ directorId: 888 })

      const resMatch = scoreCandidate(cMatch, profile, baseWeights)
      const resNoMatch = scoreCandidate(cNoMatch, profile, baseWeights)

      expect(resMatch.score).toBeGreaterThan(resNoMatch.score)
    })

    it('should penalize candidates with disliked director (negative directorVector)', () => {
      const profile: UserProfile = { ...emptyProfile, directorVector: { 555: -1.0 } }
      const cDisliked = makeCandidate({ directorId: 555 })
      const cNeutral = makeCandidate({ directorId: null })

      const resDisliked = scoreCandidate(cDisliked, profile, baseWeights)
      const resNeutral = scoreCandidate(cNeutral, profile, baseWeights)

      expect(resDisliked.score).toBeLessThan(resNeutral.score)
    })

    it('should apply freshness decay — recent releases score higher than old ones', () => {
      const recent = makeCandidate({ releaseDate: new Date().toISOString().split('T')[0] })
      const old = makeCandidate({ releaseDate: '2000-01-01' })

      const resRecent = scoreCandidate(recent, emptyProfile, baseWeights)
      const resOld = scoreCandidate(old, emptyProfile, baseWeights)

      expect(resRecent.freshnessScore).toBeGreaterThan(resOld.freshnessScore)
    })

    it('should apply quality score based on voteAverage and voteCount', () => {
      const highQuality = makeCandidate({ voteAverage: 9.0, voteCount: 5000 })
      const lowQuality = makeCandidate({ voteAverage: 5.0, voteCount: 50 })

      const resHigh = scoreCandidate(highQuality, emptyProfile, baseWeights)
      const resLow = scoreCandidate(lowQuality, emptyProfile, baseWeights)

      expect(resHigh.qualityScore).toBeGreaterThan(resLow.qualityScore)
    })

    it('should build correct sourceReason for all source types', () => {
      const sourceReasons: [Candidate['source'], string][] = [
        ['trending', 'Trending this week'],
        ['popular_fallback', 'Popular right now'],
        ['collaborative', 'Fans with your taste also loved this'],
      ]
      for (const [source, expectedReason] of sourceReasons) {
        const c = makeCandidate({ source })
        const result = scoreCandidate(c, emptyProfile, baseWeights)
        expect(result.sourceReason).toBe(expectedReason)
      }
    })

    it('should include seedTitle in sourceReason for tmdb_similar', () => {
      const c = makeCandidate({ source: 'tmdb_similar', seedTitle: 'Inception' })
      const result = scoreCandidate(c, emptyProfile, baseWeights)
      expect(result.sourceReason).toContain('Inception')
    })
  })

  describe('scoreCandidates — cold start', () => {
    it('should apply 4x momentum multiplier for new users', () => {
      const newUserProfile: UserProfile = {
        ...emptyProfile,
        isNewUser: true,
        genreVector: { 28: 1.0 },
        recentlyWatched: [{ tmdbId: 100, mediaType: 'movie', title: 'A', weight: 1.0 }],
      }
      const session = { sessionGenreIds: [28], sessionCastIds: [], sessionKeywordIds: [] }

      const matchGenre = makeCandidate({ tmdbId: 1, genreIds: [28] })
      const noMatchGenre = makeCandidate({ tmdbId: 2, genreIds: [35] })

      const results = scoreCandidates([matchGenre, noMatchGenre], newUserProfile, baseWeights, session)
      expect(results[0].score).toBeGreaterThan(results[1].score)
    })

    it('should apply session flat boost for cold-start users matching session genres', () => {
      const coldProfile: UserProfile = {
        ...emptyProfile,
        isNewUser: false,
        recentlyWatched: [{ tmdbId: 5, mediaType: 'movie', title: 'B', weight: 1.0 }], // length 1
      }
      const session = { sessionGenreIds: [35], sessionCastIds: [], sessionKeywordIds: [] }

      const match = makeCandidate({ genreIds: [35] })
      const noMatch = makeCandidate({ genreIds: [28] })

      const results = scoreCandidates([match, noMatch], coldProfile, baseWeights, session)
      expect(results[0].score).toBeGreaterThan(results[1].score)
    })
  })

  describe('buildSessionContext', () => {
    it('should include all top genres from genreVector', async () => {
      const profile: UserProfile = {
        ...emptyProfile,
        genreVector: { 28: 1.0, 18: 0.8, 35: 0.6 },
        recentlyWatched: [{ tmdbId: 1, mediaType: 'movie', title: 'X', weight: 1.0 }],
      }
      const session = await buildSessionContext(profile)
      expect(session.sessionGenreIds).toContain(28)
      expect(session.sessionGenreIds).toContain(18)
      expect(session.sessionGenreIds).toContain(35)
    })

    it('should exclude genres with weight <= 0 from session', async () => {
      const profile: UserProfile = {
        ...emptyProfile,
        genreVector: { 28: 1.0, 18: -0.5 },
        recentlyWatched: [{ tmdbId: 1, mediaType: 'movie', title: 'X', weight: 1.0 }],
      }
      const session = await buildSessionContext(profile)
      expect(session.sessionGenreIds).toContain(28)
      expect(session.sessionGenreIds).not.toContain(18)
    })

    it('should propagate optional localHour to session context', async () => {
      const profile: UserProfile = {
        ...emptyProfile,
        recentlyWatched: [{ tmdbId: 1, mediaType: 'movie', title: 'X', weight: 1.0 }],
      }
      const session = await buildSessionContext(profile, 22)
      expect(session.localHour).toBe(22)
    })
  })
})
