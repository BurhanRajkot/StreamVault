import { UserProfile } from '../types'

export interface RankingWeights {
  genreAffinity: number
  keywordAffinity: number
  castAffinity: number
  popularity: number
  freshness: number
  quality: number
}

// Stable anchor — never mutated. The refresh job always adjusts FROM this, not
// from the already-adjusted current value, to avoid hourly compounding drift.
const DEFAULT_BASE_WEIGHTS: RankingWeights = {
  genreAffinity: 0.34,
  keywordAffinity: 0.10,
  castAffinity: 0.08,
  popularity: 0.18,
  freshness: 0.16,
  quality: 0.14,
}

// Live base weights. Starts at the default and is replaced by the IPS/LambdaRank
// refresh job (see weightsRefreshJob.ts). computeDynamicWeights reads this so the
// learned corrections actually reach live ranking.
let currentBaseWeights: RankingWeights = { ...DEFAULT_BASE_WEIGHTS }

/** The weights currently in effect (default until the refresh job runs). */
export function getBaseWeights(): RankingWeights {
  return currentBaseWeights
}

/** The stable anchor. Feed THIS into estimateIPSAdjustedWeights each cycle. */
export function getDefaultBaseWeights(): RankingWeights {
  return { ...DEFAULT_BASE_WEIGHTS }
}

/** Called by the weights refresh job with IPS/LambdaRank-adjusted weights. */
export function setBaseWeights(weights: RankingWeights): void {
  currentBaseWeights = { ...weights }
}

// Analyzes user profile to compute dynamic weights that "grow with the user"
export function computeDynamicWeights(profile: UserProfile): RankingWeights {
  // Read the live base once — now reflects the latest IPS-learned weights.
  const BASE_WEIGHTS = getBaseWeights()

  // If user is brand new with zero data, rely heavily on popularity and freshness
  // because personalization vectors are empty.
  if (profile.isNewUser && profile.recentlyWatched.length === 0) {
    return {
      ...BASE_WEIGHTS,
      genreAffinity: 0.10,   // Low weight, nothing to match yet
      keywordAffinity: 0.05,
      castAffinity: 0.05,
      popularity: 0.40,      // Massive boost to popularity
      freshness: 0.30,       // Massive boost to freshness
      quality: 0.25,
    }
  }

  // If user is in cold start but has *some* interactions (e.g. 1-5 watched items),
  // we want to dramatically shift weights TOWARDS their new vectors to prove the
  // engine is listening instantly.
  if (profile.recentlyWatched.length > 0 && profile.recentlyWatched.length <= 5) {
    return {
      ...BASE_WEIGHTS,
      genreAffinity: 0.50,   // Very high genre affinity to instantly segment them
      popularity: 0.10,      // Drop popularity down
      freshness: 0.10,
    }
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
