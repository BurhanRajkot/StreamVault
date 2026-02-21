import { Candidate, UserProfile } from '../types'

export function dislikedFilter(candidates: Candidate[], profile: UserProfile): Candidate[] {
  return candidates.filter(c => !profile.dislikedIds.has(c.tmdbId))
}
