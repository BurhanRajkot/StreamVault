import { describe, it, expect, setSystemTime, beforeEach, afterEach } from 'bun:test'
import { confidenceFilter, formatFilter, lowQualityFilter, releasedFilter } from './quality'
import { Candidate } from '../types'

describe('Quality Filters', () => {
  // Helper to create a partial candidate for testing
  const createCandidate = (voteCount: number, voteAverage: number, releaseDate?: string): Candidate => {
    return {
      tmdbId: 1,
      mediaType: 'movie',
      title: 'Test',
      posterPath: null,
      backdropPath: null,
      overview: 'Test overview',
      releaseDate: releaseDate !== undefined ? releaseDate : '2023-01-01',
      popularity: 10,
      genreIds: [],
      source: 'trending',
      voteCount,
      voteAverage,
    } as Candidate
  }

  describe('lowQualityFilter', () => {
    it('keeps candidates with 0 votes and 0 average (brand new titles)', () => {
      const candidates = [createCandidate(0, 0)]
      const result = lowQualityFilter(candidates)
      expect(result.length).toBe(1)
    })

    it('filters out candidates with low vote count (0 < voteCount < 10)', () => {
      const candidates = [createCandidate(9, 8.0)]
      const result = lowQualityFilter(candidates)
      expect(result.length).toBe(0)
    })

    it('keeps candidates with sufficient vote count (voteCount >= 10)', () => {
      const candidates = [createCandidate(10, 8.0)]
      const result = lowQualityFilter(candidates)
      expect(result.length).toBe(1)
    })

    it('filters out candidates with low vote average (0 < voteAverage < 4.5)', () => {
      const candidates = [createCandidate(100, 4.4)]
      const result = lowQualityFilter(candidates)
      expect(result.length).toBe(0)
    })

    it('keeps candidates with sufficient vote average (voteAverage >= 4.5)', () => {
      const candidates = [createCandidate(100, 4.5)]
      const result = lowQualityFilter(candidates)
      expect(result.length).toBe(1)
    })

    it('filters out candidates failing both conditions', () => {
      const candidates = [createCandidate(5, 3.0)]
      const result = lowQualityFilter(candidates)
      expect(result.length).toBe(0)
    })

    it('processes multiple candidates correctly', () => {
      const candidates = [
        createCandidate(0, 0),       // Keep
        createCandidate(5, 8.0),     // Filter out (low count)
        createCandidate(100, 3.0),   // Filter out (low average)
        createCandidate(10, 4.5),    // Keep (exact boundaries)
        createCandidate(1000, 8.5)   // Keep
      ]

      const result = lowQualityFilter(candidates)

      expect(result.length).toBe(3)
      expect(result[0].voteCount).toBe(0)
      expect(result[1].voteCount).toBe(10)
      expect(result[2].voteCount).toBe(1000)
    })
  })

  describe('releasedFilter', () => {
    beforeEach(() => {
      // Mock system time to a fixed date for deterministic tests
      setSystemTime(new Date('2024-01-15T12:00:00Z'))
    })

    afterEach(() => {
      // Restore system time
      setSystemTime()
    })

    it('keeps candidates with release dates in the past', () => {
      const candidates = [createCandidate(100, 8.0, '2024-01-14')]
      const result = releasedFilter(candidates)
      expect(result.length).toBe(1)
    })

    it('keeps candidates with release dates exactly equal to today', () => {
      const candidates = [createCandidate(100, 8.0, '2024-01-15')]
      const result = releasedFilter(candidates)
      expect(result.length).toBe(1)
    })

    it('filters out candidates with release dates in the future', () => {
      const candidates = [createCandidate(100, 8.0, '2024-01-16')]
      const result = releasedFilter(candidates)
      expect(result.length).toBe(0)
    })

    it('keeps candidates without a release date (null)', () => {
      const candidates = [createCandidate(100, 8.0, null as unknown as string)]
      const result = releasedFilter(candidates)
      expect(result.length).toBe(1)
    })

    it('keeps candidates with empty release date', () => {
      const candidates = [createCandidate(100, 8.0, '')]
      const result = releasedFilter(candidates)
      expect(result.length).toBe(1)
    })

    it('processes multiple candidates correctly', () => {
      const candidates = [
        createCandidate(100, 8.0, '2024-01-10'), // Keep (past)
        createCandidate(100, 8.0, '2024-01-15'), // Keep (today)
        createCandidate(100, 8.0, '2024-01-20'), // Filter out (future)
        createCandidate(100, 8.0, ''),           // Keep (no date)
        createCandidate(100, 8.0, '2025-01-01')  // Filter out (future)
      ]

      const result = releasedFilter(candidates)

      expect(result.length).toBe(3)
      expect(result[0].releaseDate).toBe('2024-01-10')
      expect(result[1].releaseDate).toBe('2024-01-15')
      expect(result[2].releaseDate).toBe('')
    })
  })
})

describe('formatFilter and confidenceFilter', () => {
  const base = {
    tmdbId: 1, mediaType: 'tv' as const, title: 'T', posterPath: '/p.jpg', backdropPath: null, overview: '',
    releaseDate: '2024-01-01', voteAverage: 7, voteCount: 500, popularity: 10, genreIds: [18], source: 'tmdb_recommendations' as const,
  }
  const profile = (genreVector: Record<number, number>) => ({
    userId: 'u', genreVector, keywordVector: {}, castVector: {}, directorVector: {}, decadeVector: {},
    watchedIds: new Set<number>(), favoritedIds: new Set<number>(), dislikedIds: new Set<number>(),
    categoryDislikeCounts: {}, recentlyWatched: [], isNewUser: false,
  })

  it('drops talk shows and reality TV unless the user watches them', () => {
    const talk = { ...base, tmdbId: 2, genreIds: [10767] }
    expect(formatFilter([base, talk], profile({})).map((c) => c.tmdbId)).toEqual([1])
    expect(formatFilter([base, talk], profile({ 10767: 0.6 })).map((c) => c.tmdbId)).toEqual([1, 2])
  })

  it('needs an audience for personal picks but lets brand-new trending titles through', () => {
    const obscure = { ...base, tmdbId: 2, voteCount: 12 }
    const fresh = { ...base, tmdbId: 3, voteCount: 0, source: 'trending' as const, sources: ['trending' as const] }
    expect(confidenceFilter([base, obscure, fresh]).map((c) => c.tmdbId)).toEqual([1, 3])
  })
})
