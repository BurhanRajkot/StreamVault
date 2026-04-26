import { Candidate, ScoredCandidate, UserProfile } from '../types'
import { RankingWeights } from './dynamicWeights'

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

// Fast empty-check that avoids Object.keys() array allocation
function hasEntries(obj: Record<number | string, number>): boolean {
  for (const _ in obj) return true
  return false
}

// ── Genre Affinity ────────────────────────────────────────
function genreAffinityScore(
  candidateGenres: number[],
  userGenreVector: Record<number, number>,
): number {
  if (candidateGenres.length === 0 || !hasEntries(userGenreVector)) {
    return 0.3  // Neutral default for cold-start
  }
  let dotProduct = 0
  for (const genreId of candidateGenres) {
    dotProduct += userGenreVector[genreId] ?? 0
  }
  return Math.min(dotProduct / candidateGenres.length, 1.0)
}

// ── Keyword Affinity ─────────────────────────────────────
function keywordAffinityScore(
  candidateKeywords: number[] | undefined,
  userKeywordVector: Record<number, number>,
): number {
  if (!candidateKeywords || candidateKeywords.length === 0) return 0.0
  if (!hasEntries(userKeywordVector)) return 0.0

  let dotProduct = 0
  for (const kwId of candidateKeywords) {
    dotProduct += userKeywordVector[kwId] ?? 0
  }
  return Math.min(dotProduct / candidateKeywords.length, 1.0)
}

// ── Cast Affinity ─────────────────────────────────────────
function castAffinityScore(
  candidateCastIds: number[] | undefined,
  userCastVector: Record<number, number>,
): number {
  if (!candidateCastIds || candidateCastIds.length === 0) return 0.0
  if (!hasEntries(userCastVector)) return 0.0

  let dotProduct = 0
  for (const castId of candidateCastIds) {
    dotProduct += userCastVector[castId] ?? 0
  }
  return Math.max(Math.min(dotProduct / candidateCastIds.length, 1.0), -1.0)
}

// ── Director Affinity ─────────────────────────────────────
function directorAffinityScore(
  directorId: number | null | undefined,
  userDirectorVector: Record<number, number>,
): number {
  if (!directorId) return 0.0
  if (!hasEntries(userDirectorVector)) return 0.0
  const score = userDirectorVector[directorId] ?? 0
  return Math.max(Math.min(score, 1.0), -1.0)
}

// ── Decade Affinity ───────────────────────────────────────
function decadeAffinityScore(
  decade: number | undefined,
  userDecadeVector: Record<number, number>,
): number {
  if (!decade) return 0.0
  if (!hasEntries(userDecadeVector)) return 0.0
  const score = userDecadeVector[decade] ?? 0
  return Math.max(Math.min(score, 1.0), -1.0)
}

// ── Source Priority Boost ────────────────────────────────
function sourceBoost(source: Candidate['source']): number {
  switch (source) {
    case 'tmdb_similar':         return 1.12  // Highest — direct similarity
    case 'tmdb_recommendations': return 1.10  // High — TMDB editorial signal
    case 'collaborative':        return 1.08  // Social proof
    case 'genre_discovery':      return 1.02  // Genre-level discovery
    case 'trending':             return 0.95  // Global, less personalized
    case 'popular_fallback':     return 0.85  // Weakest signal
    default:                     return 1.0
  }
}

// ── Source → Human Reason ────────────────────────────────
// NOTE: When a candidate has seedTitle, that takes priority.
// The sectionBuilder uses seedTitle directly for grouping.
function buildSourceReason(source: Candidate['source'], seedTitle?: string): string {
  switch (source) {
    case 'tmdb_similar':
      return seedTitle ? `Because you watched ${seedTitle}` : 'Similar to what you watched'
    case 'tmdb_recommendations':
      return seedTitle ? `Because you watched ${seedTitle}` : 'Curated for you'
    case 'genre_discovery':
      return seedTitle ? `More ${seedTitle} content you might enjoy` : 'Based on your top genres'
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

// ── Session Context ───────────────────────────────────────
// Tracks what the user is engaging with RIGHT NOW in this session,
// enabling "session momentum" — if you just watched 2 crime thrillers,
// the next recommendation should lean into that intent.
export interface SessionContext {
  /** Genre IDs from items watched/clicked in the current session */
  sessionGenreIds: number[]
  /** Cast IDs from items watched/clicked in the current session */
  sessionCastIds: number[]
  /** Keyword IDs from items watched/clicked in the current session */
  sessionKeywordIds: number[]
}

// ── Session Momentum Score ────────────────────────────────
// Boosts candidates whose genres/cast overlap with the current session.
// Accepts pre-built Sets (built ONCE per request, not per-candidate)
// to avoid 450 redundant Set allocations for a 150-candidate pool.
function sessionMomentumScore(
  candidate: Candidate,
  sessionGenreSet: Set<number>,
  sessionCastSet: Set<number>,
  sessionKwSet: Set<number>,
): number {
  if (sessionGenreSet.size === 0 && sessionCastSet.size === 0 && sessionKwSet.size === 0) {
    return 0
  }

  let score = 0

  // Genre overlap — up to 0.10
  if (sessionGenreSet.size > 0 && candidate.genreIds.length > 0) {
    const overlap = candidate.genreIds.filter(g => sessionGenreSet.has(g)).length
    score += 0.10 * (overlap / Math.max(candidate.genreIds.length, 1))
  }

  // Cast overlap — up to 0.06
  if (sessionCastSet.size > 0 && candidate.castIds && candidate.castIds.length > 0) {
    const overlap = candidate.castIds.filter(c => sessionCastSet.has(c)).length
    score += 0.06 * (overlap / Math.max(candidate.castIds.length, 1))
  }

  // Keyword overlap — up to 0.04
  if (sessionKwSet.size > 0 && candidate.keywords && candidate.keywords.length > 0) {
    const overlap = candidate.keywords.filter(k => sessionKwSet.has(k)).length
    score += 0.04 * (overlap / Math.max(candidate.keywords.length, 1))
  }

  return score
}

// ── Build Session Context from recently watched ───────────
// Derives the session fingerprint from the user's profile vectors —
// we already have genreVector/castVector/keywordVector built from
// the same interactions, so we don't need to call getMovieFeatures again.
// This eliminates 3 cold-start TMDB calls that used to run in parallel
// with ranking and compete for the same network slots.
export async function buildSessionContext(profile: UserProfile): Promise<SessionContext> {
  const recentItems = profile.recentlyWatched.slice(0, 3)
  if (recentItems.length === 0) {
    return { sessionGenreIds: [], sessionCastIds: [], sessionKeywordIds: [] }
  }

  // Top genres from the user's genre vector (already computed, zero cost)
  const topGenreIds = Object.entries(profile.genreVector)
    .filter(([, w]) => w > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([id]) => Number(id))

  // Top cast from the cast vector
  const topCastIds = Object.entries(profile.castVector)
    .filter(([, w]) => w > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([id]) => Number(id))

  // Top keywords from keyword vector
  const topKeywordIds = Object.entries(profile.keywordVector)
    .filter(([, w]) => w > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([id]) => Number(id))

  return {
    sessionGenreIds: topGenreIds,
    sessionCastIds: topCastIds,
    sessionKeywordIds: topKeywordIds,
  }
}

export function scoreCandidate(
  candidate: Candidate,
  profile: UserProfile,
  weights: RankingWeights,
  session: SessionContext = { sessionGenreIds: [], sessionCastIds: [], sessionKeywordIds: [] },
): ScoredCandidate {
  // Allow genre, keyword, cast, director, decade to be negative for disliked items
  // Amplify affinities so likes/dislikes have a stronger pull on the final score
  const amplify = (val: number) => val < 0 ? val * 1.5 : val * 1.2;

  const gAffinity = Math.max(amplify(genreAffinityScore(candidate.genreIds, profile.genreVector)), -1.5)
  const kwAffinity = Math.max(amplify(keywordAffinityScore(candidate.keywords, profile.keywordVector)), -1.5)

  const castAff = Math.max(amplify(castAffinityScore(candidate.castIds, profile.castVector)), -1.5)
  const dirAff = Math.max(amplify(directorAffinityScore(candidate.directorId, profile.directorVector)), -1.5)
  const decAff = Math.max(amplify(decadeAffinityScore(candidate.decade, profile.decadeVector)), -1.5)

  const popScore = popularityScore(candidate.popularity)
  const freshScore = freshnessScore(candidate.releaseDate)
  const qualScore = qualityScore(candidate.voteAverage, candidate.voteCount)

  const rawScore =
    weights.genreAffinity   * gAffinity  +
    weights.keywordAffinity * kwAffinity +
    weights.castAffinity    * castAff    +
    0.15                    * dirAff     + // Fixed weight for director
    0.10                    * decAff     + // Fixed weight for decade
    weights.popularity      * popScore   +
    weights.freshness       * freshScore +
    weights.quality         * qualScore

  const boostedScore = rawScore * sourceBoost(candidate.source)

  return {
    ...candidate,
    score: boostedScore,
    genreAffinityScore: gAffinity,
    keywordAffinityScore: kwAffinity,
    castAffinityScore: castAff,
    directorAffinityScore: dirAff,
    decadeAffinityScore: decAff,
    popularityScore: popScore,
    freshnessScore: freshScore,
    qualityScore: qualScore,
    sourceReason: buildSourceReason(candidate.source, candidate.seedTitle),
    seedTitle: candidate.seedTitle,
  }
}

// ── Batch scoring with pre-built session Sets ─────────────
// Builds the session Sets ONCE then scores all candidates.
// Eliminates 3 Set allocations per candidate (450 total for 150 candidates).
export function scoreCandidates(
  candidates: Candidate[],
  profile: UserProfile,
  weights: RankingWeights,
  session: SessionContext,
): ScoredCandidate[] {
  // Build Sets once — shared across all candidate scores
  const sessionGenreSet = new Set(session.sessionGenreIds)
  const sessionCastSet = new Set(session.sessionCastIds)
  const sessionKwSet = new Set(session.sessionKeywordIds)

  return candidates.map(candidate => {
    const base = scoreCandidate(candidate, profile, weights, session)
    // Session momentum using pre-built Sets
    const sessionBoost = sessionMomentumScore(candidate, sessionGenreSet, sessionCastSet, sessionKwSet)
    return { ...base, score: base.score + sessionBoost }
  })
}
