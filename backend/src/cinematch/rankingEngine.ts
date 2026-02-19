// ============================================================
// CineMatch AI — Ranking Engine
// X Algorithm equivalent: Phoenix Ranking Transformer
//
// Implements a weighted multi-signal linear model inspired by
// X's Phoenix scorer. Instead of a Grok transformer, we use
// mathematically-principled signals that proxy the same predictions:
//
// score = w1 × genreAffinity     (proxy for P(like))
//       + w2 × popularitySignal  (proxy for P(click))
//       + w3 × freshnessSignal   (proxy for P(watch))
//       + w4 × qualitySignal     (proxy for P(rate))
//
// Plus diversity penalty (Author Diversity Scorer equivalent)
// to prevent genre echo-chambers.
// ============================================================

import { Candidate, ScoredCandidate, UserProfile } from './types'
import { getMovieFeatures } from './featureStore'

// ── Score Weights ──────────────────────────────────────────────
// Tuned to favor personalized content while ensuring diversity
const WEIGHTS = {
  genreAffinity:  0.42,  // Highest weight — personalization signal
  popularity:     0.22,  // Global appeal
  freshness:      0.20,  // Recency preference (Netflix finds new content performs better)
  quality:        0.16,  // Vote-based quality signal
} as const

// Diversity penalty applied when 3+ consecutive same-genre items appear
const DIVERSITY_PENALTY = 0.18

// ── Freshness Decay ────────────────────────────────────────────
// Exponential decay: content from last year scores near 1.0,
// 5-year-old content scores ~0.3
function freshnessScore(releaseDate: string): number {
  if (!releaseDate) return 0.3
  const ageYears = (Date.now() - new Date(releaseDate).getTime()) / (365.25 * 86_400_000)
  // Half-life of 3 years — adapts well for both movies and TV
  return Math.exp(-ageYears * Math.LN2 / 3)
}

// ── Popularity Signal ─────────────────────────────────────────
// Log-normalized TMDB popularity to compress the extreme range
// (popularity goes from ~1 to ~5000)
const MAX_LOG_POP = Math.log1p(5000)
function popularityScore(popularity: number): number {
  return Math.min(Math.log1p(popularity) / MAX_LOG_POP, 1.0)
}

// ── Quality Signal ────────────────────────────────────────────
// Combines vote_average and vote_count into a Bayesian-ish estimate
// Penalizes items with few votes to prevent gaming
function qualityScore(voteAverage: number, voteCount: number): number {
  const avgNorm = voteAverage / 10  // [0..1]
  const confidenceBoost = Math.min(voteCount / 500, 1)  // plateaus at 500 votes
  return avgNorm * (0.7 + 0.3 * confidenceBoost)
}

// ── Genre Affinity (Cosine Similarity proxy) ──────────────────
// Measures how well the candidate's genre set matches the user's
// accumulated genre preference vector (from featureStore)
function genreAffinityScore(
  candidateGenres: number[],
  userGenreVector: Record<number, number>,
): number {
  if (candidateGenres.length === 0 || Object.keys(userGenreVector).length === 0) {
    return 0.3  // Neutral for cold-start
  }

  // Dot product of candidate one-hot genres × user genre weights
  let dotProduct = 0
  for (const genreId of candidateGenres) {
    dotProduct += userGenreVector[genreId] ?? 0
  }

  // Normalize by candidate genre count (cosine similarity approximation)
  return Math.min(dotProduct / candidateGenres.length, 1.0)
}

// ── Source Priority Boost ────────────────────────────────────
// X's Weighted Scorer applies different base weights per source
// (in-network Thunder posts scored higher than out-of-network)
function sourceBoost(source: Candidate['source']): number {
  switch (source) {
    case 'tmdb_similar':         return 1.10  // Highest — directly related
    case 'tmdb_recommendations': return 1.05  // Strong signal
    case 'trending':             return 0.95  // Global trending, less personal
    case 'popular_fallback':     return 0.85  // Cold-start fallback
    case 'collaborative':        return 1.08  // Peer-based signal
    default:                     return 1.0
  }
}

// ── Source → Human Reason ────────────────────────────────────
function sourceReason(source: Candidate['source'], _seedTitle?: string): string {
  switch (source) {
    case 'tmdb_similar':
      return _seedTitle ? `Because you watched ${_seedTitle}` : 'Similar to what you watched'
    case 'tmdb_recommendations':
      return _seedTitle ? `You might like this after ${_seedTitle}` : 'Hand-picked for you'
    case 'trending':
      return 'Trending this week'
    case 'popular_fallback':
      return 'Popular right now'
    case 'collaborative':
      return 'Fans of your genres also loved this'
    default:
      return 'Recommended for you'
  }
}

// ── Score a single candidate ──────────────────────────────────
export function scoreCandidate(
  candidate: Candidate,
  profile: UserProfile,
  seedTitles: Map<string, string>,  // source+tmdbId → seed title for reason strings
): ScoredCandidate {
  const affinityScore = genreAffinityScore(candidate.genreIds, profile.genreVector)
  const popScore = popularityScore(candidate.popularity)
  const freshScore = freshnessScore(candidate.releaseDate)
  const qualScore = qualityScore(candidate.voteAverage, candidate.voteCount)

  const rawScore =
    WEIGHTS.genreAffinity * affinityScore +
    WEIGHTS.popularity    * popScore      +
    WEIGHTS.freshness     * freshScore    +
    WEIGHTS.quality       * qualScore

  const boostedScore = rawScore * sourceBoost(candidate.source)
  const seedKey = `${candidate.source}:seed`
  const seedTitle = seedTitles.get(seedKey)

  return {
    ...candidate,
    score: boostedScore,
    genreAffinityScore: affinityScore,
    popularityScore: popScore,
    freshnessScore: freshScore,
    qualityScore: qualScore,
    sourceReason: sourceReason(candidate.source, seedTitle),
  }
}

// ── Rank with Diversity ───────────────────────────────────────
// X's Author Diversity Scorer — prevent genre echo-chambers
// After scoring, apply a diversity re-ranking pass
function applyDiversityReranking(scored: ScoredCandidate[]): ScoredCandidate[] {
  // Sort by raw score first
  const sorted = [...scored].sort((a, b) => b.score - a.score)

  // Track genre appearance counts for diversity penalty
  const genreCount: Record<number, number> = {}

  return sorted.map(candidate => {
    const dominantGenre = candidate.genreIds[0]

    if (dominantGenre !== undefined) {
      const count = genreCount[dominantGenre] || 0

      if (count >= 3) {
        // Apply diversity penalty to prevent 10 consecutive thrillers
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
  }).sort((a, b) => b.score - a.score)  // Re-sort after diversity adjustment
}

// ── Master Ranking Function ───────────────────────────────────
// Equivalent to X's complete Scoring stage:
// Phoenix Score → Weighted Score → Author Diversity Score → Sort
export async function rankCandidates(
  candidates: Candidate[],
  profile: UserProfile,
): Promise<ScoredCandidate[]> {
  // Build seed title map for human-readable reason strings
  const seedTitles = new Map<string, string>()
  for (const recent of profile.recentlyWatched) {
    seedTitles.set(`tmdb_similar:seed`, recent.title)
    seedTitles.set(`tmdb_recommendations:seed`, recent.title)
  }

  // Score all candidates (parallel feature hydration for any missing genre data)
  const scoringPromises = candidates.map(async (candidate) => {
    // If genreIds are missing (some TMDB items omit them), hydrate from features
    if (candidate.genreIds.length === 0) {
      const features = await getMovieFeatures(candidate.tmdbId, candidate.mediaType)
      if (features) {
        candidate = { ...candidate, genreIds: features.genreIds }
      }
    }
    return scoreCandidate(candidate, profile, seedTitles)
  })

  const scored = await Promise.all(scoringPromises)

  // Apply diversity re-ranking (Author Diversity Scorer equivalent)
  return applyDiversityReranking(scored)
}
