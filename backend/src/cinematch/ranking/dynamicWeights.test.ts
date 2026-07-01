import { describe, it, expect } from 'bun:test'
import { computeDynamicWeights } from './dynamicWeights'
import { UserProfile } from '../types'

describe('Dynamic Weights', () => {
  const createMockProfile = (isNewUser: boolean, castCount: number, keywordCount: number): UserProfile => {
    const castVector: Record<number, number> = {}
    const keywordVector: Record<number, number> = {}

    for (let i = 0; i < castCount; i++) castVector[i] = 1.0
    for (let i = 0; i < keywordCount; i++) keywordVector[i] = 1.0

    return {
      userId: 'test_user',
      genreVector: {},
      castVector,
      keywordVector,
      directorVector: {},
      decadeVector: {},
      watchedIds: new Set(),
      favoritedIds: new Set(),
      dislikedIds: new Set(),
      categoryDislikeCounts: {},
      recentlyWatched: [],
      isNewUser
    }
  }

  it('should return base weights for new users', () => {
    const profile = createMockProfile(true, 100, 100) // even with high vectors, isNewUser overrides
    const weights = computeDynamicWeights(profile)

    expect(weights.castAffinity).toBeCloseTo(0.05)
    expect(weights.keywordAffinity).toBeCloseTo(0.05)
    expect(weights.popularity).toBeCloseTo(0.40)
    expect(weights.freshness).toBeCloseTo(0.30)
  })

  it('should return base weights for users with few interactions', () => {
    const profile = createMockProfile(false, 10, 10)
    // Make sure we pass the cold-start threshold of 5
    profile.recentlyWatched = [1, 2, 3, 4, 5, 6] as unknown as UserProfile['recentlyWatched']
    const weights = computeDynamicWeights(profile)

    expect(weights.castAffinity).toBeCloseTo(0.08)
    expect(weights.keywordAffinity).toBeCloseTo(0.10)
  })

  it('should return segmentation weights for early cold start interactions', () => {
    const profile = createMockProfile(false, 10, 10)
    // 1-5 interactions triggers the segmentation branch
    profile.recentlyWatched = [1, 2, 3] as unknown as UserProfile['recentlyWatched']
    const weights = computeDynamicWeights(profile)

    expect(weights.genreAffinity).toBeCloseTo(0.50)
    expect(weights.popularity).toBeCloseTo(0.10)
    expect(weights.freshness).toBeCloseTo(0.10)
  })

  it('should boost cast affinity for users with moderate cast interactions', () => {
    const profile = createMockProfile(false, 30, 0)
    profile.recentlyWatched = [1, 2, 3, 4, 5, 6] as unknown as UserProfile['recentlyWatched']
    const weights = computeDynamicWeights(profile)

    // castBoost = 0.02
    expect(weights.castAffinity).toBeCloseTo(0.10)
    // popularity and freshness reduced by 0.01
    expect(weights.popularity).toBeCloseTo(0.17)
    expect(weights.freshness).toBeCloseTo(0.15)
  })

  it('should significantly boost cast and keyword affinity for heavy users', () => {
    const profile = createMockProfile(false, 60, 150)
    profile.recentlyWatched = [1, 2, 3, 4, 5, 6] as unknown as UserProfile['recentlyWatched']
    const weights = computeDynamicWeights(profile)

    // castBoost = 0.05, keywordBoost = 0.05
    expect(weights.castAffinity).toBeCloseTo(0.13)
    expect(weights.keywordAffinity).toBeCloseTo(0.15)

    // popularity and freshness reduced by 0.05
    expect(weights.popularity).toBeCloseTo(0.13)
    expect(weights.freshness).toBeCloseTo(0.11)
  })
})
