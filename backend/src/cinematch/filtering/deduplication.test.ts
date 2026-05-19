import { describe, it, expect } from 'bun:test'
import { deduplicateFilter } from './deduplication'
import { Candidate } from '../types'

describe('deduplicateFilter', () => {
  // Helper to quickly generate a valid Candidate mock
  const mockCandidate = (tmdbId: number, mediaType: 'movie' | 'tv'): Candidate => ({
    tmdbId,
    mediaType,
    title: `Title ${tmdbId}`,
    posterPath: null,
    backdropPath: null,
    overview: '',
    releaseDate: '2023-01-01',
    voteAverage: 0,
    voteCount: 0,
    popularity: 0,
    genreIds: [],
    source: 'trending'
  })

  it('should return an empty array if given an empty array', () => {
    expect(deduplicateFilter([])).toEqual([])
  })

  it('should return the same array if there are no duplicates', () => {
    const candidates = [
      mockCandidate(1, 'movie'),
      mockCandidate(2, 'movie'),
      mockCandidate(1, 'tv')
    ]
    expect(deduplicateFilter(candidates)).toEqual(candidates)
  })

  it('should remove duplicate candidates based on tmdbId and mediaType', () => {
    const c1 = mockCandidate(1, 'movie')
    const c2 = mockCandidate(2, 'movie')
    const c3 = mockCandidate(1, 'movie') // Duplicate of c1
    const c4 = mockCandidate(1, 'tv')
    const c5 = mockCandidate(1, 'tv')    // Duplicate of c4

    const candidates = [c1, c2, c3, c4, c5]
    const expected = [c1, c2, c4]

    expect(deduplicateFilter(candidates)).toEqual(expected)
  })

  it('should keep the first occurrence when duplicates exist', () => {
    const first = mockCandidate(100, 'movie')
    first.title = 'First Occurrence'
    first.source = 'tmdb_recommendations'

    const second = mockCandidate(100, 'movie')
    second.title = 'Second Occurrence'
    second.source = 'trending'

    const result = deduplicateFilter([first, second])

    expect(result).toHaveLength(1)
    expect(result[0]).toEqual(first)
    expect(result[0].title).toBe('First Occurrence')
    expect(result[0].source).toBe('tmdb_recommendations')
  })
})
