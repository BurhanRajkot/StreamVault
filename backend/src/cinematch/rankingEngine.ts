// ============================================================
// CineMatch AI — Ranking Engine
// X Algorithm equivalent: Phoenix Ranking Transformer
//
// 6-signal weighted linear model:
//   score = w1 × genreAffinity    (P(like) — personalization signal)
//         + w2 × keywordAffinity  (P(like) — semantic matching, NEW)
//         + w3 × castAffinity     (P(like) — creator/actor loyalty, NEW)
//         + w4 × popularitySignal (P(click) — global appeal)
//         + w5 × freshnessSignal  (P(watch) — recency preference)
//         + w6 × qualitySignal    (P(rate) — sustained quality)
//
// Plus diversity penalty (Author Diversity Scorer equivalent)
// to prevent genre echo-chambers.
// ============================================================

import { Candidate, ScoredCandidate, UserProfile } from './types'
import { getMovieFeatures } from './featureStore'

// ── Score Weights — must sum to 1.0 ───────────────────────
const WEIGHTS = {
  genreAffinity:   0.34,  // Highest — personalization backbone
  keywordAffinity: 0.10,  // Semantic theme matching
  castAffinity:    0.08,  // Actor/director loyalty signal
  popularity:      0.18,  // Global appeal
  freshness:       0.16,  // Recency preference
  quality:         0.14,  // Vote-based quality
} as const

// Diversity penalty when 3+ consecutive candidates share the same dominant genre
const DIVERSITY_PENALTY = 0.18

// ── Freshness ─────────────────────────────────────────────
// Exponential decay — content from last year ~1.0, 5yr-old ~0.3
// Half-life: 3 years (balanced for movies + long-running TV)
function freshnessScore(releaseDate: string): number {
  if (!releaseDate) return 0.3
  const ageYears = (Date.now() - new Date(releaseDate).getTime()) / (365.25 * 86_400_000)
  return Math.exp(-ageYears * Math.LN2 / 3)
}

// ── Popularity ────────────────────────────────────────────
// Log-normalized TMDB popularity (range ~1..5000 → 0..1)
const MAX_LOG_POP = Math.log1p(5000)
function popularityScore(popularity: number): number {
  return Math.min(Math.log1p(popularity) / MAX_LOG_POP, 1.0)
}

// ── Quality ───────────────────────────────────────────────
// Bayesian-style estimate — penalizes items with few votes
function qualityScore(voteAverage: number, voteCount: number): number {
  const avgNorm = voteAverage / 10
  const confidenceBoost = Math.min(voteCount / 500, 1)
  return avgNorm * (0.7 + 0.3 * confidenceBoost)
}

// ── Genre Affinity ────────────────────────────────────────
// Cosine similarity proxy: dot product of candidate genres × user genre vector
function genreAffinityScore(
  candidateGenres: number[],
  userGenreVector: Record<number, number>,
): number {
  if (candidateGenres.length === 0 || Object.keys(userGenreVector).length === 0) {
    return 0.3  // Neutral default for cold-start
  }
  let dotProduct = 0
  for (const genreId of candidateGenres) {
    dotProduct += userGenreVector[genreId] ?? 0
  }
  return Math.min(dotProduct / candidateGenres.length, 1.0)
}

// ── Keyword Affinity ─────────────────────────────────────
// Measures how well the candidate's themes match what the user has
// enjoyed thematically (time travel, heist, based-on-book, etc.)
function keywordAffinityScore(
  candidateKeywords: number[] | undefined,
  userKeywordVector: Record<number, number>,
): number {
  if (!candidateKeywords || candidateKeywords.length === 0) return 0.0
  if (Object.keys(userKeywordVector).length === 0) return 0.0

  let dotProduct = 0
  for (const kwId of candidateKeywords) {
    dotProduct += userKeywordVector[kwId] ?? 0
  }
  return Math.min(dotProduct / candidateKeywords.length, 1.0)
}

// ── Cast Affinity ─────────────────────────────────────────
// Boosts candidates featuring actors/directors the user has
// repeatedly watched (loyalty signal — very effective for franchises)
function castAffinityScore(
  candidateCastIds: number[] | undefined,
  userCastVector: Record<number, number>,
): number {
  if (!candidateCastIds || candidateCastIds.length === 0) return 0.0
  if (Object.keys(userCastVector).length === 0) return 0.0

  let dotProduct = 0
  for (const castId of candidateCastIds) {
    dotProduct += userCastVector[castId] ?? 0
  }
  return Math.min(dotProduct / candidateCastIds.length, 1.0)
}

// ── Source Priority Boost ────────────────────────────────
// X's Weighted Scorer — different base weights per source
function sourceBoost(source: Candidate['source']): number {
  switch (source) {
    case 'tmdb_similar':         return 1.10  // Highest — directly related
    case 'tmdb_recommendations': return 1.05  // Strong TMDB curation signal
    case 'collaborative':        return 1.08  // Peer-based — high precision
    case 'trending':             return 0.95  // Global trending, less personal
    case 'popular_fallback':     return 0.85  // Cold-start fallback
    default:                     return 1.0
  }
}

// ── Source → Human Reason ────────────────────────────────
function buildSourceReason(source: Candidate['source'], seedTitle?: string): string {
  switch (source) {
    case 'tmdb_similar':
      return seedTitle ? `Because you watched ${seedTitle}` : 'Similar to what you watched'
    case 'tmdb_recommendations':
      return seedTitle ? `You might like this after ${seedTitle}` : 'Curated for you'
    case 'collaborative':
      return 'Fans with your taste also loved this'
    case 'trending':
      return 'Trending this week'
    case 'popular_fallback':
      return 'Popular right now'
    default:
      return 'Recommended for you'
  }
}

// ── Score a single candidate ──────────────────────────────
export function scoreCandidate(
  candidate: Candidate,
  profile: UserProfile,
  seedTitles: Map<string, string>,
): ScoredCandidate {
  const gAffinity = genreAffinityScore(candidate.genreIds, profile.genreVector)
  const kwAffinity = keywordAffinityScore(candidate.keywords, profile.keywordVector)
  const castAff = castAffinityScore(candidate.castIds, profile.castVector)
  const popScore = popularityScore(candidate.popularity)
  const freshScore = freshnessScore(candidate.releaseDate)
  const qualScore = qualityScore(candidate.voteAverage, candidate.voteCount)

  const rawScore =
    WEIGHTS.genreAffinity   * gAffinity  +
    WEIGHTS.keywordAffinity * kwAffinity +
    WEIGHTS.castAffinity    * castAff    +
    WEIGHTS.popularity      * popScore   +
    WEIGHTS.freshness       * freshScore +
    WEIGHTS.quality         * qualScore

  const boostedScore = rawScore * sourceBoost(candidate.source)
  const seedKey = `${candidate.source}:seed`
  const seedTitle = seedTitles.get(seedKey)

  return {
    ...candidate,
    score: boostedScore,
    genreAffinityScore: gAffinity,
    keywordAffinityScore: kwAffinity,
    castAffinityScore: castAff,
    popularityScore: popScore,
    freshnessScore: freshScore,
    qualityScore: qualScore,
    sourceReason: buildSourceReason(candidate.source, seedTitle),
  }
}

// ── Diversity Re-ranking ──────────────────────────────────
// X's Author Diversity Scorer — prevents genre echo-chambers.
// After initial sort, penalize 3+ consecutive items from the same genre.
function applyDiversityReranking(scored: ScoredCandidate[]): ScoredCandidate[] {
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

// ── Master Ranking Function ───────────────────────────────
// Pipeline: Phoenix Score → Weighted Score → Author Diversity Score → Sort
export async function rankCandidates(
  candidates: Candidate[],
  profile: UserProfile,
): Promise<ScoredCandidate[]> {
  // Build seed title map for source reason strings
  const seedTitles = new Map<string, string>()
  for (const recent of profile.recentlyWatched) {
    seedTitles.set('tmdb_similar:seed', recent.title)
    seedTitles.set('tmdb_recommendations:seed', recent.title)
  }

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

    return scoreCandidate(candidate, profile, seedTitles)
  })

  const scored = await Promise.all(scoringPromises)
  return applyDiversityReranking(scored)
}
