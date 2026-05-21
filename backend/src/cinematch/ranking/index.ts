import { Candidate, ScoredCandidate, UserProfile } from '../types'
import { getMovieFeatures } from '../features'
import { scoreCandidates, buildSessionContext } from './phoenixScorer'
import { applyDiversityReranking } from './diversityReranker'
import { computeDynamicWeights } from './dynamicWeights'
import { applyWildcardInjection } from './exploration'
import { mapConcurrent } from '../../utils/concurrency'

// Max candidates to rank — prevents N+1 hydration on huge candidate pools
const MAX_RANK_CANDIDATES = 150
// Hydration budget — avoid issuing dozens of network calls in ranking
const MAX_HYDRATION_CANDIDATES = 30
const MAX_CONCURRENT_HYDRATION = 5
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
  // We also pass the current UTC hour as a rough proxy for time of day, since
  // we do not have perfect client timezone access at read time without query params.
  const currentUtcHour = new Date().getUTCHours()
  const localHourEstimate = (currentUtcHour - 4 + 24) % 24 // Roughly US Eastern Time proxy for now, ideally passed via context

  // Runs in parallel with feature hydration below.
  const sessionContextPromise = buildSessionContext(profile, localHourEstimate)

  const hydrationState = { budget: MAX_HYDRATION_CANDIDATES }

  // Score all candidates with limited concurrency; hydrate missing genre/keyword/cast data
  const scoringPromise = mapConcurrent(rankedCandidates, MAX_CONCURRENT_HYDRATION, async (candidate) => {
    // Only hydrate candidates that are truly uncategorized (no genre info at all).
    // keywords and castIds are optional scoring signals — missing them is fine;
    // the scorer gracefully defaults. Hydrating every candidate via TMDB is the
    // primary cause of 10-20s ranking latency.
    let nextCandidate = candidate
    const needsHydration = nextCandidate.genreIds.length === 0

    // Synchronously check and decrement budget to prevent race conditions
    let shouldHydrate = false
    if (needsHydration && hydrationState.budget > 0) {
      hydrationState.budget -= 1
      shouldHydrate = true
    }

    if (shouldHydrate) {
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
    scoringPromise,
    sessionContextPromise,
  ])

  // Score all candidates in one batch — Sets are built once, not per-candidate
  const scored = scoreCandidates(hydratedCandidates, profile, dynamicWeights, sessionContext)

  // Apply three-stage diversity reranking: genre saturation + novelty + serendipity
  const diversed = applyDiversityReranking(scored, profile)

  // Inject Multi-Armed Bandit / Wildcards for exploration
  return applyWildcardInjection(diversed, profile)
}
