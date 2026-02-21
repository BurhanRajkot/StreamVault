import { Candidate, UserProfile } from '../types'
import { deduplicateFilter } from './deduplication'
import { alreadyWatchedFilter, alreadyFavoritedFilter } from './alreadyWatched'
import { dislikedFilter } from './disliked'
import { categoryThrottleFilter } from './suppressedCategory'
import { lowQualityFilter, releasedFilter } from './quality'

export function applyFilters(
  candidates: Candidate[],
  profile: UserProfile,
): Candidate[] {
  let filtered = deduplicateFilter(candidates)
  filtered = alreadyWatchedFilter(filtered, profile)
  filtered = alreadyFavoritedFilter(filtered, profile)
  filtered = dislikedFilter(filtered, profile)
  filtered = categoryThrottleFilter(filtered, profile)  // soft gradient throttle
  filtered = lowQualityFilter(filtered)
  filtered = releasedFilter(filtered)
  return filtered
}
