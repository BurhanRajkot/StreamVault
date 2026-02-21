import { Candidate, UserProfile } from '../types'
import { deduplicateFilter } from './deduplication'
import { alreadyWatchedFilter, alreadyFavoritedFilter } from './alreadyWatched'
import { dislikedFilter } from './disliked'
import { lowQualityFilter, releasedFilter } from './quality'

export function applyFilters(
  candidates: Candidate[],
  profile: UserProfile,
): Candidate[] {
  let filtered = deduplicateFilter(candidates)
  filtered = alreadyWatchedFilter(filtered, profile)
  filtered = alreadyFavoritedFilter(filtered, profile)
  filtered = dislikedFilter(filtered, profile)
  filtered = lowQualityFilter(filtered)
  filtered = releasedFilter(filtered)
  return filtered
}
