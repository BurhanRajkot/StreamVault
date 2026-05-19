import { describe, expect, it } from 'bun:test'
import { alreadyWatchedFilter, alreadyFavoritedFilter } from './alreadyWatched'
import { Candidate, UserProfile } from '../types'

describe('alreadyWatchedFilter', () => {
  const createMockCandidate = (id: number): Candidate => ({
    tmdbId: id,
    mediaType: 'movie',
    title: `Movie ${id}`,
    posterPath: null,
    backdropPath: null,
    overview: '',
    releaseDate: '2023-01-01',
    voteAverage: 8.0,
    voteCount: 100,
    popularity: 10,
    genreIds: [],
    keywords: [],
    directorId: null,
    castIds: [],
    source: 'tmdb_similar', sources: [],
  })

  const createMockProfile = (watchedIds: number[]): UserProfile => ({
    userId: 'test-user',
    genreVector: {},
    keywordVector: {},
    castVector: {},
    directorVector: {},
    decadeVector: {},
    watchedIds: new Set(watchedIds),
    favoritedIds: new Set(),
    dislikedIds: new Set(),
    categoryDislikeCounts: {},
    recentlyWatched: [],
    isNewUser: false,
  })

  it('should return all candidates if watchedIds is empty', () => {
    const candidates = [createMockCandidate(1), createMockCandidate(2)]
    const profile = createMockProfile([])

    const result = alreadyWatchedFilter(candidates, profile)

    expect(result).toEqual(candidates)
    expect(result.length).toBe(2)
  })

  it('should filter out candidates that are in watchedIds', () => {
    const candidates = [createMockCandidate(1), createMockCandidate(2), createMockCandidate(3)]
    const profile = createMockProfile([2])

    const result = alreadyWatchedFilter(candidates, profile)

    expect(result.length).toBe(2)
    expect(result.map(c => c.tmdbId)).toEqual([1, 3])
  })

  it('should return an empty array if all candidates are in watchedIds', () => {
    const candidates = [createMockCandidate(1), createMockCandidate(2)]
    const profile = createMockProfile([1, 2, 3])

    const result = alreadyWatchedFilter(candidates, profile)

    expect(result).toEqual([])
    expect(result.length).toBe(0)
  })

  it('should handle empty candidates array', () => {
    const candidates: Candidate[] = []
    const profile = createMockProfile([1, 2])

    const result = alreadyWatchedFilter(candidates, profile)

    expect(result).toEqual([])
  })
})

describe('alreadyFavoritedFilter', () => {
  const createMockCandidate = (id: number): Candidate => ({
    tmdbId: id,
    mediaType: 'movie',
    title: `Movie ${id}`,
    posterPath: null,
    backdropPath: null,
    overview: '',
    releaseDate: '2023-01-01',
    voteAverage: 8.0,
    voteCount: 100,
    popularity: 10,
    genreIds: [],
    keywords: [],
    directorId: null,
    castIds: [],
    source: 'tmdb_similar', sources: [],
  })

  const createMockProfile = (favoritedIds: number[]): UserProfile => ({
    userId: 'test-user',
    genreVector: {},
    keywordVector: {},
    castVector: {},
    directorVector: {},
    decadeVector: {},
    watchedIds: new Set(),
    favoritedIds: new Set(favoritedIds),
    dislikedIds: new Set(),
    categoryDislikeCounts: {},
    recentlyWatched: [],
    isNewUser: false,
  })

  it('should return all candidates if favoritedIds is empty', () => {
    const candidates = [createMockCandidate(1), createMockCandidate(2)]
    const profile = createMockProfile([])

    const result = alreadyFavoritedFilter(candidates, profile)

    expect(result).toEqual(candidates)
    expect(result.length).toBe(2)
  })

  it('should filter out candidates that are in favoritedIds', () => {
    const candidates = [createMockCandidate(1), createMockCandidate(2), createMockCandidate(3)]
    const profile = createMockProfile([1, 3])

    const result = alreadyFavoritedFilter(candidates, profile)

    expect(result.length).toBe(1)
    expect(result[0].tmdbId).toBe(2)
  })

  it('should return an empty array if all candidates are in favoritedIds', () => {
    const candidates = [createMockCandidate(1), createMockCandidate(2)]
    const profile = createMockProfile([1, 2, 3])

    const result = alreadyFavoritedFilter(candidates, profile)

    expect(result).toEqual([])
    expect(result.length).toBe(0)
  })

  it('should handle empty candidates array', () => {
    const candidates: Candidate[] = []
    const profile = createMockProfile([1, 2])

    const result = alreadyFavoritedFilter(candidates, profile)

    expect(result).toEqual([])
  })
})
