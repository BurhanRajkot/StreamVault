import { Candidate } from '../types'

export function deduplicateFilter(candidates: Candidate[]): Candidate[] {
  const seen = new Set<number>()
  return candidates.filter(c => {
    if (seen.has(c.tmdbId)) return false
    seen.add(c.tmdbId)
    return true
  })
}
