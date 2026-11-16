import { Candidate, UserProfile } from '../types'

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

/** Talk shows, news, reality, soaps, kids' TV — formats, not things anyone wants picked for them. */
const FORMAT_GENRES = [10767, 10763, 10764, 10766, 10762]

/**
 * Drops those formats unless the user's own history leans into one of them
 * (someone who watches reality TV still gets reality TV).
 */
export function formatFilter(candidates: Candidate[], profile: UserProfile): Candidate[] {
  const unwanted = new Set(FORMAT_GENRES.filter((g) => (profile.genreVector[g] ?? 0) < 0.35))
  if (unwanted.size === 0) return candidates
  return candidates.filter((c) => !c.genreIds.some((g) => unwanted.has(g)))
}

/** Votes a recommendation needs before it counts as a known quantity. */
export const MIN_VOTES = { movie: 50, tv: 25 } as const

/**
 * Everything personal is held to a minimum audience: a title only a handful
 * of people have rated is usually filler (or a near-duplicate entry) that a
 * keyword happened to match. Trending titles get a pass — a release from last
 * week hasn't had time to collect votes.
 */
export function confidenceFilter(candidates: Candidate[]): Candidate[] {
  return candidates.filter((c) => {
    const onlyTrending = (c.sources ?? [c.source]).every((s) => s === 'trending')
    if (onlyTrending) return true
    return c.voteCount >= MIN_VOTES[c.mediaType]
  })
}
