import { describe, it, expect } from 'bun:test'
import { lowQualityFilter } from './quality'
import { Candidate } from '../types'

describe('Quality Filters', () => {
  describe('lowQualityFilter', () => {
    // Helper to create a partial candidate for testing
    const createCandidate = (voteCount: number, voteAverage: number): Candidate => {
      return {
        tmdbId: 1,
        mediaType: 'movie',
        title: 'Test',
        posterPath: null,
        backdropPath: null,
        overview: 'Test overview',
        releaseDate: '2023-01-01',
        popularity: 10,
        genreIds: [],
        source: 'trending',
        voteCount,
        voteAverage,
      } as Candidate
    }

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
})
