import { ScoredCandidate } from '../types'

// Diversity penalty when 3+ consecutive candidates share the same dominant genre
const DIVERSITY_PENALTY = 0.18

export function applyDiversityReranking(scored: ScoredCandidate[]): ScoredCandidate[] {
  const sorted = [...scored].sort((a, b) => b.score - a.score)
  const genreCount: Record<number, number> = {}

  return sorted.map(candidate => {
    const dominantGenre = candidate.genreIds[0]
    if (dominantGenre !== undefined) {
      const count = genreCount[dominantGenre] || 0
      if (count >= 3) {
        const penalized = {
          ...candidate,
          score: candidate.score * (1 - DIVERSITY_PENALTY * Math.min(count - 2, 3)),
        }
        genreCount[dominantGenre] = count + 1
        return penalized
      }
      genreCount[dominantGenre] = count + 1
    }
    return candidate
  }).sort((a, b) => b.score - a.score)
}
