import { Candidate, ScoredCandidate, UserProfile } from '../types'
import { getMovieFeatures } from '../features'
import { scoreCandidates, buildSessionContext } from './phoenixScorer'
import { applyDiversityReranking } from './diversityReranker'
import { computeDynamicWeights } from './dynamicWeights'

// Max candidates to rank — prevents N+1 hydration on huge candidate pools
const MAX_RANK_CANDIDATES = 150
// Hydration budget — avoid issuing dozens of network calls in ranking
const MAX_HYDRATION_CANDIDATES = 30
const HYDRATION_TIMEOUT_MS = Number(process.env.CINEMATCH_RANK_HYDRATION_TIMEOUT_MS || 1200)

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  const timer = new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))
  return Promise.race([promise, timer])
}

function parseDecade(releaseDate?: string): number | undefined {
  if (!releaseDate) return undefined
  const year = parseInt(releaseDate.split('-')[0] || '0', 10)
  if (year <= 1900) return undefined
  return Math.floor(year / 10) * 10
}

// ── Master Ranking Function ───────────────────────────────
export async function rankCandidates(
  candidates: Candidate[],
  profile: UserProfile,
): Promise<ScoredCandidate[]> {
  // Compute dynamic weights based on profile richness
  const dynamicWeights = computeDynamicWeights(profile)

  // Cap candidates early — ranking 300 items with TMDB hydration is very slow
  const rankedCandidates = candidates.slice(0, MAX_RANK_CANDIDATES)

  // ── Phase 2: Build session context from last 3 watched ──
  // This enables session momentum — if you just watched 2 crime thrillers,
  // the ranker will give a small additive boost to more crime thrillers.
  // Runs in parallel with feature hydration below.
  const sessionContextPromise = buildSessionContext(profile)
  let hydrationBudget = MAX_HYDRATION_CANDIDATES

  // Score all candidates in parallel; hydrate missing genre/keyword/cast data
  const scoringPromises = rankedCandidates.map(async (candidate) => {
    // Only hydrate candidates that are truly uncategorized (no genre info at all).
    // keywords and castIds are optional scoring signals — missing them is fine;
    // the scorer gracefully defaults. Hydrating every candidate via TMDB is the
    // primary cause of 10-20s ranking latency.
    let nextCandidate = candidate
    const needsHydration = nextCandidate.genreIds.length === 0

    if (needsHydration && hydrationBudget > 0) {
      hydrationBudget -= 1
      const features = await withTimeout(
        getMovieFeatures(nextCandidate.tmdbId, nextCandidate.mediaType),
        HYDRATION_TIMEOUT_MS,
        null
      )
      if (features) {
        nextCandidate = {
          ...nextCandidate,
          genreIds: features.genreIds,
          keywords: features.keywords,
          castIds: features.castIds,
          directorId: features.directorId,
          decade: parseDecade(features.releaseDate),
        }
      }
    }

    if (!nextCandidate.decade) {
      const decade = parseDecade(nextCandidate.releaseDate)
      if (decade !== undefined) {
        nextCandidate = { ...nextCandidate, decade }
      }
    }

    return nextCandidate
  })

  // Hydrate candidates and resolve session context in parallel
  const [hydratedCandidates, sessionContext] = await Promise.all([
    Promise.all(scoringPromises),
    sessionContextPromise,
  ])

  // Score all candidates in one batch — Sets are built once, not per-candidate
  const scored = scoreCandidates(hydratedCandidates, profile, dynamicWeights, sessionContext)

  // Apply three-stage diversity reranking: genre saturation + novelty + serendipity
  return applyDiversityReranking(scored, profile)
}
