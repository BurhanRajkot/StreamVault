import { Candidate, UserProfile } from '../types'

export function alreadyWatchedFilter(candidates: Candidate[], profile: UserProfile): Candidate[] {
  return candidates.filter(c => !profile.watchedIds.has(c.tmdbId))
}

export function alreadyFavoritedFilter(candidates: Candidate[], profile: UserProfile): Candidate[] {
  return candidates.filter(c => !profile.favoritedIds.has(c.tmdbId))
}
