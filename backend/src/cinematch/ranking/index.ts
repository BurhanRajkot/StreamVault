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

        let decade = 0
        if (features.releaseDate) {
          const year = parseInt(features.releaseDate.split('-')[0] || '0', 10)
          if (year > 1900) {
            decade = Math.floor(year / 10) * 10
          }
        }

        candidate = {
          ...candidate,
          genreIds: features.genreIds,
          keywords: features.keywords,
          castIds: features.castIds,
          directorId: features.directorId,
          decade: decade > 0 ? decade : undefined,
        }
      }
    } else {
        // Even if we don't need TMDB keywords/cast hydration, we still
        // might need to parse the decade from the existing candidate releaseDate
        if (!candidate.decade && candidate.releaseDate) {
          const year = parseInt(candidate.releaseDate.split('-')[0] || '0', 10)
          if (year > 1900) {
            candidate.decade = Math.floor(year / 10) * 10
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
