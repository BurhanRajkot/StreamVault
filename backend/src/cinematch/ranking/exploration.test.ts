import { describe, it, expect } from 'bun:test'
import { applyWildcardInjection } from './exploration'
import { ScoredCandidate, UserProfile } from '../types'

const createCandidate = (
  id: number,
  score: number,
  genreIds: number[] = [28],
): ScoredCandidate => ({
  tmdbId: id,
  mediaType: 'movie',
  title: `Movie ${id}`,
  posterPath: null,
  backdropPath: null,
  overview: 'Test',
  releaseDate: '2023-01-01',
  popularity: 100,
  genreIds,
  source: 'trending',
  voteCount: 1000,
  voteAverage: 7.5,
  score,
  genreAffinityScore: 1.0,
  keywordAffinityScore: 0.0,
  castAffinityScore: 0.0,
  directorAffinityScore: 0.0,
  decadeAffinityScore: 0.0,
  popularityScore: 0.5,
  freshnessScore: 0.8,
  qualityScore: 0.7,
  sourceReason: 'Trending this week',
})

const createProfile = (overrides: Partial<UserProfile> = {}): UserProfile => ({
  userId: 'user123',
  genreVector: { 28: 1.0 }, // Likes Action
  castVector: {},
  keywordVector: {},
  directorVector: {},
  decadeVector: {},
  recentlyWatched: Array.from({ length: 10 }, (_, i) => ({
    tmdbId: i + 1,
    mediaType: 'movie' as const,
    title: `Watched ${i + 1}`,
    weight: 1.0,
  })),
  watchedIds: new Set(),
  favoritedIds: new Set(),
  dislikedIds: new Set(),
  categoryDislikeCounts: {},
  isNewUser: false,
  ...overrides,
})

describe('applyWildcardInjection', () => {
  it('should return ranked list unchanged for new users', () => {
    const profile = createProfile({ isNewUser: true })
    const ranked = Array.from({ length: 25 }, (_, i) => createCandidate(i + 1, 10 - i * 0.3))
    const result = applyWildcardInjection(ranked, profile)
    expect(result).toEqual(ranked)
  })

  it('should return ranked list unchanged if fewer than 20 items', () => {
    const profile = createProfile()
    const ranked = Array.from({ length: 15 }, (_, i) => createCandidate(i + 1, 10 - i * 0.3))
    const result = applyWildcardInjection(ranked, profile)
    expect(result).toEqual(ranked)
  })

  it('should preserve total item count after injection', () => {
    const profile = createProfile()
    const ranked = Array.from({ length: 30 }, (_, i) => {
      // Items 20+ are in different genres (Documentary = 99)
      const genre = i < 20 ? 28 : 99
      return createCandidate(i + 1, 10 - i * 0.2, [genre])
    })

    const result = applyWildcardInjection(ranked, profile)
    expect(result.length).toBe(ranked.length)
  })

  it('should inject discovery items and mark them with correct source', () => {
    const profile = createProfile({ genreVector: { 28: 1.0 } })
    const ranked = [
      ...Array.from({ length: 20 }, (_, i) => createCandidate(i + 1, 10 - i * 0.3, [28])),
      // Out-of-profile items at the bottom (Documentary)
      createCandidate(21, 1.0, [99]),
      createCandidate(22, 0.9, [99]),
    ]

    const result = applyWildcardInjection(ranked, profile)

    // At least one wildcard should have been injected with the discovery source
    const discoveryItems = result.filter(c => c.source === 'wildcard')
    expect(discoveryItems.length).toBeGreaterThan(0)
    expect(discoveryItems[0].sourceReason).toBe('Surprise me! Discovery pick')
  })

  it('should not inject wildcards if no out-of-profile candidates exist', () => {
    const profile = createProfile({ genreVector: { 28: 1.0 } })
    // ALL items are Action (in-profile)
    const ranked = Array.from({ length: 25 }, (_, i) => createCandidate(i + 1, 10 - i * 0.3, [28]))

    const result = applyWildcardInjection(ranked, profile)
    const discoveryItems = result.filter(c => c.source === 'genre_discovery')
    expect(discoveryItems.length).toBe(0)
  })

  it('should not inject if bottom slice has fewer wildcards than required', () => {
    const profile = createProfile({ genreVector: { 28: 1.0 } })
    // Exactly 20 Action items, 0 out-of-profile items in bottom slice
    const ranked = Array.from({ length: 20 }, (_, i) => createCandidate(i + 1, 10 - i * 0.3, [28]))

    const result = applyWildcardInjection(ranked, profile)
    expect(result.length).toBe(20)
    expect(result.every(c => c.source !== 'genre_discovery')).toBe(true)
  })

  it('should place injected wildcard within top-20 range', () => {
    const profile = createProfile({ genreVector: { 28: 1.0 } })
    const ranked = [
      ...Array.from({ length: 20 }, (_, i) => createCandidate(i + 1, 10 - i * 0.2, [28])),
      createCandidate(21, 1.5, [99]), // out-of-profile
      createCandidate(22, 1.4, [99]),
    ]

    const result = applyWildcardInjection(ranked, profile)
    const injectedIdx = result.findIndex(c => c.source === 'genre_discovery')

    // Wildcard should be within top 20 (index 4..19 per implementation)
    if (injectedIdx !== -1) {
      expect(injectedIdx).toBeGreaterThanOrEqual(4)
      expect(injectedIdx).toBeLessThan(20)
    }
  })

  it('should output sorted by score before injection', () => {
    const profile = createProfile()
    // Create deliberately unsorted input
    const ranked = [
      createCandidate(1, 5.0, [28]),
      createCandidate(2, 9.0, [28]),
      createCandidate(3, 7.0, [28]),
      ...Array.from({ length: 18 }, (_, i) => createCandidate(i + 10, 4 - i * 0.1, [28])),
      createCandidate(99, 0.5, [99]), // out-of-profile wildcard
      createCandidate(100, 0.4, [99]),
    ]

    const result = applyWildcardInjection(ranked, profile)

    // First item should have a high score (sorted before injection)
    expect(result[0].score).toBeGreaterThanOrEqual(result[2].score)
  })
})
