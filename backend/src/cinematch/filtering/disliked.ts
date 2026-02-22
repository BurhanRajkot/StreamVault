import { Candidate, UserProfile } from '../types'

export function dislikedFilter(candidates: Candidate[], profile: UserProfile): Candidate[] {
  // We no longer filter out explicit dislikes!
  // Instead, the frontend renders them as grayscale.
  return candidates
}
