import { UserProfile } from '../types'

export interface RankingWeights {
  genreAffinity: number
  keywordAffinity: number
  castAffinity: number
  popularity: number
  freshness: number
  quality: number
}

// Default baseline weights
const BASE_WEIGHTS: RankingWeights = {
  genreAffinity:   0.34,
  keywordAffinity: 0.10,
  castAffinity:    0.08,
  popularity:      0.18,
  freshness:       0.16,
  quality:         0.14,
}

// Analyzes user profile to compute dynamic weights that "grow with the user"
export function computeDynamicWeights(profile: UserProfile): RankingWeights {
  if (profile.isNewUser) {
    return BASE_WEIGHTS
  }

  // If user has a massive cast vector (they click actors heavily), boost castAffinity
  const castEntries = Object.keys(profile.castVector).length
  const keywordEntries = Object.keys(profile.keywordVector).length

  let castBoost = 0
  if (castEntries > 50) castBoost = 0.05
  else if (castEntries > 20) castBoost = 0.02

  let keywordBoost = 0
  if (keywordEntries > 100) keywordBoost = 0.05
  else if (keywordEntries > 30) keywordBoost = 0.02

  const totalBoost = castBoost + keywordBoost

  return {
    ...BASE_WEIGHTS,
    castAffinity: BASE_WEIGHTS.castAffinity + castBoost,
    keywordAffinity: BASE_WEIGHTS.keywordAffinity + keywordBoost,
    popularity: Math.max(0.05, BASE_WEIGHTS.popularity - totalBoost / 2),
    freshness: Math.max(0.05, BASE_WEIGHTS.freshness - totalBoost / 2),
  }
}
