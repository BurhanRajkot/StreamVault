import { Candidate } from '../types'

export function deduplicateFilter(candidates: Candidate[]): Candidate[] {
  const seen = new Set<string>()
  return candidates.filter(c => {
    const key = `${c.mediaType}:${c.tmdbId}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
