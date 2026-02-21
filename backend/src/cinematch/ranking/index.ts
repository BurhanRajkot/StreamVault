import { Candidate, ScoredCandidate, UserProfile } from '../types'
import { getMovieFeatures } from '../features'
import { scoreCandidate } from './phoenixScorer'
import { applyDiversityReranking } from './diversityReranker'
import { computeDynamicWeights } from './dynamicWeights'

// ── Master Ranking Function ───────────────────────────────
export async function rankCandidates(
  candidates: Candidate[],
  profile: UserProfile,
): Promise<ScoredCandidate[]> {
  // Compute dynamic weights based on profile richness
  const dynamicWeights = computeDynamicWeights(profile)

  // Score all candidates in parallel; hydrate missing genre/keyword/cast data
  const scoringPromises = candidates.map(async (candidate) => {
    // Hydrate from TMDB if candidate is missing feature data
    const needsHydration =
      candidate.genreIds.length === 0 ||
      !candidate.keywords ||
      !candidate.castIds

    if (needsHydration) {
      const features = await getMovieFeatures(candidate.tmdbId, candidate.mediaType)
      if (features) {
        candidate = {
          ...candidate,
          genreIds: features.genreIds,
          keywords: features.keywords,
          castIds: features.castIds,
        }
      }
    }

    // noteworthy: seedTitle is already on the candidate (set by tmdbSimilar,
    // tmdbRecommendations, genreDiscovery) — scorer just reads it through
    return scoreCandidate(candidate, profile, dynamicWeights)
  })

  const scored = await Promise.all(scoringPromises)
  return applyDiversityReranking(scored)
}
