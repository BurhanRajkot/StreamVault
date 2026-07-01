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
    case 'tmdb_similar': return 1.12  // Highest — direct similarity
    case 'tmdb_recommendations': return 1.10  // High — TMDB editorial signal
    case 'collaborative': return 1.08  // Social proof
    case 'cast_discovery': return 1.04  // Actor-driven discovery
    case 'genre_discovery': return 1.02  // Genre-level discovery
    case 'keyword_discovery': return 1.02  // Theme-level discovery
    case 'wildcard': return 1.00  // Exploration — NOT a quality signal
    case 'trending': return 0.95  // Global, less personalized
    case 'popular_fallback': return 0.85  // Weakest signal
    default: return 1.0
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
    case 'keyword_discovery':
      return seedTitle ? `Because you liked ${seedTitle}` : 'Matches themes you enjoy'
    case 'cast_discovery':
      return seedTitle ? `Featuring the cast of ${seedTitle}` : 'Actors you follow'
    case 'wildcard':
      return 'Surprise pick to broaden your taste'
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
  /** The current hour of the day (0-23) in the user's local timezone (or UTC fallback) */
  localHour?: number
}

// ── Time-of-Day Context ───────────────────────────────────
// Adjusts scores based on the time of day.
// e.g. Shorter/lighter content on weekday days, heavier/longer at night.
// We use genres as proxies:
// Daytime (6am - 5pm): Comedy(35), Animation(16), Family(10751) get a slight boost.
// Evening/Night (6pm - 2am): Drama(18), Thriller(53), Horror(27), Crime(80) get a slight boost.
function timeOfDayScore(candidate: Candidate, localHour?: number): number {
  if (localHour === undefined) return 0

  let score = 0
  const isDaytime = localHour >= 6 && localHour < 18
  const isNighttime = localHour >= 18 || localHour < 3

  const hasGenre = (id: number) => candidate.genreIds.includes(id)

  if (isDaytime) {
    if (hasGenre(35) || hasGenre(16) || hasGenre(10751)) {
      score += 0.05 // Light daytime boost
    }
  } else if (isNighttime) {
    if (hasGenre(18) || hasGenre(53) || hasGenre(27) || hasGenre(80)) {
      score += 0.05 // Heavy nighttime boost
    }
  }

  return score
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

// Minimal structural view of a recently-watched item. Your RecentlyWatched /
// WatchHistory item type should expose these feature arrays, populated when the
// interaction was recorded. If it already does, you can drop the cast in
// buildSessionContext below.
interface RecentItemFeatures {
  genreIds?: number[]
  castIds?: number[]
  keywords?: number[]
}

// ── Build Session Context from recently watched ───────────
// Derives the session fingerprint from the ACTUAL last-3 watched items —
// NOT the long-term profile vectors. This is what makes momentum react to
// what the user is doing right now instead of re-confirming their all-time
// taste. If the recent items carry no feature data, we fall back to the
// previous top-vector behaviour so this is never *worse* than before.
export async function buildSessionContext(
  profile: UserProfile,
  localHour?: number,
): Promise<SessionContext> {
  const recentItems = profile.recentlyWatched.slice(0, 3) as RecentItemFeatures[]
  if (recentItems.length === 0) {
    return { sessionGenreIds: [], sessionCastIds: [], sessionKeywordIds: [], localHour }
  }

  // ── Session-scoped fingerprint ────────────────────────────
  const sessionGenreIds = new Set<number>()
  const sessionCastIds = new Set<number>()
  const sessionKeywordIds = new Set<number>()

  for (const item of recentItems) {
    for (const g of item.genreIds ?? []) sessionGenreIds.add(g)
    // Cap cast per item so one star-studded film can't dominate the fingerprint
    for (const c of (item.castIds ?? []).slice(0, 5)) sessionCastIds.add(c)
    for (const k of item.keywords ?? []) sessionKeywordIds.add(k)
  }

  // Fallback: recent items have no persisted features (e.g. stored as bare
  // tmdbIds). Fall back to the long-term top-vector behaviour. The real fix is
  // to persist item features on the write path so this branch never runs.
  if (sessionGenreIds.size === 0 && sessionCastIds.size === 0 && sessionKeywordIds.size === 0) {
    return {
      sessionGenreIds: topFromVector(profile.genreVector, 10),
      sessionCastIds: topFromVector(profile.castVector, 10),
      sessionKeywordIds: topFromVector(profile.keywordVector, 15),
      localHour,
    }
  }

  return {
    sessionGenreIds: [...sessionGenreIds],
    sessionCastIds: [...sessionCastIds],
    sessionKeywordIds: [...sessionKeywordIds],
    localHour,
  }
}

// Top-N positive-weight ids from a profile vector, descending.
function topFromVector(vec: Record<number, number>, n: number): number[] {
  return Object.entries(vec)
    .filter(([, w]) => w > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([id]) => Number(id))
}

export function scoreCandidate(
  candidate: Candidate,
  profile: UserProfile,
  weights: RankingWeights,
  _session: SessionContext = { sessionGenreIds: [], sessionCastIds: [], sessionKeywordIds: [] },
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
    weights.genreAffinity * gAffinity +
    weights.keywordAffinity * kwAffinity +
    weights.castAffinity * castAff +
    0.15 * dirAff + // Fixed weight for director
    0.10 * decAff + // Fixed weight for decade
    weights.popularity * popScore +
    weights.freshness * freshScore +
    weights.quality * qualScore

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

  // Cold Start boost multiplier - if the user is new, session momentum means EVERYTHING
  // because it's their first and only signal
  const isColdStart = profile.isNewUser || profile.recentlyWatched.length <= 5
  const momentumMultiplier = isColdStart ? 4.0 : 1.0

  return candidates.map(candidate => {
    const base = scoreCandidate(candidate, profile, weights, session)
    // Session momentum using pre-built Sets
    let sessionBoost = sessionMomentumScore(candidate, sessionGenreSet, sessionCastSet, sessionKwSet) * momentumMultiplier

    // For extreme cold starts (1-2 interactions), we want to practically guarantee
    // that the engine immediately shifts. We give an artificial "segmentation" floor
    // to any candidate matching the session genres.
    if (isColdStart && profile.recentlyWatched.length > 0 && sessionGenreSet.size > 0) {
      if (candidate.genreIds.some(g => sessionGenreSet.has(g))) {
        sessionBoost += 0.2 // massive flat boost to ensure these items float to the top
      }
    }

    // Time of day boost
    const timeBoost = timeOfDayScore(candidate, session.localHour)

    return { ...base, score: base.score + sessionBoost + timeBoost }
  })
}