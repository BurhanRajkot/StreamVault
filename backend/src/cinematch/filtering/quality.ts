import { Candidate } from '../types'

export function lowQualityFilter(candidates: Candidate[]): Candidate[] {
  return candidates.filter(c => {
    if (c.voteCount > 0 && c.voteCount < 10) return false
    if (c.voteAverage > 0 && c.voteAverage < 4.5) return false
    return true
  })
}

export function releasedFilter(candidates: Candidate[]): Candidate[] {
  const today = new Date().toISOString().split('T')[0]
  return candidates.filter(c => {
    if (!c.releaseDate) return true
    return c.releaseDate <= today
  })
}
