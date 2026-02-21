// ============================================================
// CineMatch AI — Dynamic Category Throttle Filter
//
// Instead of hard-blocking a category, this progressively
// reduces how many candidates from each category pass through,
// based on how many times the user has disliked that category.
//
// Throttle curve (exponential decay, starts at 5 dislikes):
//   < 5  dislikes → 100% of category candidates pass
//     5  dislikes →  100% (just began tracking)
//     8  dislikes →   64%
//    10  dislikes →   47%
//    15  dislikes →   22%
//    20  dislikes →   11%
//    30+ dislikes →    5% (floor — never fully zero)
//
// This preserves diversity while honouring the feedback signal.
// Recently Added bypasses this entirely (TMDB direct fetch).
// ============================================================

import { Candidate, UserProfile } from '../types'
import { getCategoriesForGenres } from '../categories'

/** Dislikes before throttling kicks in */
export const CATEGORY_THROTTLE_START = 5

/** Minimum fraction of a category that always passes through */
export const CATEGORY_THROTTLE_FLOOR = 0.05

/**
 * Returns the fraction [0.05–1.0] of a category's candidates to keep.
 * Uses exponential decay so the curve is smooth rather than step-wise.
 */
export function getCategoryKeepRatio(dislikes: number): number {
  if (dislikes < CATEGORY_THROTTLE_START) return 1.0
  return Math.max(
    CATEGORY_THROTTLE_FLOOR,
    Math.exp(-(dislikes - CATEGORY_THROTTLE_START) * 0.15),
  )
}

/**
 * Soft throttle: for each category that has ≥5 dislikes, only let a
 * proportional subset of its candidates pass (best ones first, since
 * candidates arrive in ranking order).
 */
export function categoryThrottleFilter(
  candidates: Candidate[],
  profile: UserProfile,
): Candidate[] {
  const counts = profile.categoryDislikeCounts

  // Build throttle map: category key → keep ratio. Skip un-throttled categories.
  const throttleMap: Record<string, number> = {}
  for (const [cat, dislikes] of Object.entries(counts)) {
    const ratio = getCategoryKeepRatio(dislikes)
    if (ratio < 1.0) throttleMap[cat] = ratio
  }

  if (Object.keys(throttleMap).length === 0) return candidates

  // Pre-count how many total candidates belong to each throttled category
  // (a candidate can belong to multiple categories — use the worst ratio)
  const catTotal: Record<string, number> = {}
  for (const c of candidates) {
    const worstCat = getWorstThrottledCategory(c.genreIds, throttleMap)
    if (worstCat) catTotal[worstCat] = (catTotal[worstCat] || 0) + 1
  }

  // Stream through candidates, keeping a running count per category.
  // First `ceil(total * ratio)` candidates in each category pass; the rest
  // are dropped. Since candidates are in ranking order, the highest-quality
  // ones in each category are always kept.
  const catKept: Record<string, number> = {}

  return candidates.filter((c) => {
    const worstCat = getWorstThrottledCategory(c.genreIds, throttleMap)
    if (!worstCat) return true  // Not in any throttled category — always pass

    const quota = Math.ceil((catTotal[worstCat] || 0) * throttleMap[worstCat])
    const kept = catKept[worstCat] || 0
    if (kept >= quota) return false   // Quota exhausted for this category

    catKept[worstCat] = kept + 1
    return true
  })
}

/** Returns the key of the most-throttled category a candidate belongs to */
function getWorstThrottledCategory(
  genreIds: number[],
  throttleMap: Record<string, number>,
): string | null {
  const cats = getCategoriesForGenres(genreIds)
  let worstCat: string | null = null
  let worstRatio = 1.0

  for (const cat of cats) {
    if (cat in throttleMap && throttleMap[cat] < worstRatio) {
      worstRatio = throttleMap[cat]
      worstCat = cat
    }
  }
  return worstCat
}
