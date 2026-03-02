// ============================================================
// CineMatch — Diversity Reranker (Phase 2: Novelty + Serendipity)
//
// Three-stage post-ranking filter applied AFTER Phoenix scoring:
//
//   Stage 1 — Genre Saturation Penalty
//     Penalizes 3+ consecutive candidates with the same lead genre.
//     Prevents "100 action movies in a row" homogeneity.
//
//   Stage 2 — Novelty Score
//     Boosts long-tail content that the user has NOT seen the genre
//     of recently, rewarding new territory over pure genre repetition.
//
//   Stage 3 — Serendipity Score
//     S(u,i) = Relevance(u,i) × Unexpectedness(u,i)
//     A highly relevant item that is also surprising (low popularity
//     or outside the user's usual comfort zone) gets a serendipity
//     bonus — making recommendations feel alive and discoverable.
// ============================================================

import { ScoredCandidate, UserProfile } from '../types'

// ── Stage 1: Genre Saturation Penalty ────────────────────
const DIVERSITY_PENALTY = 0.18
const SATURATION_THRESHOLD = 3  // Items with same genre before penalty kicks in

// ── Stage 2: Novelty Parameters ──────────────────────────
const NOVELTY_BOOST_MAX = 0.08   // Max fractional boost for novel genres (8%)
// λ controls novelty aggressiveness: 0 = off, 1.0 = very aggressive
const NOVELTY_LAMBDA = 0.4

// ── Stage 3: Serendipity Parameters ──────────────────────
const SERENDIPITY_BOOST_MAX = 0.10  // Max fractional boost for serendipitous items (10%)
const SERENDIPITY_LAMBDA = 0.35     // How aggressively to promote surprising content

// ── Popularity Unexpectedness ─────────────────────────────
// A lower-popularity item = more unexpected = higher serendipity potential.
// We use log-inverse of popularity normalized to [0,1].
// Items with popularity > 500 are considered "mainstream" (unexpectedness → 0).
const MAX_LOG_POP = Math.log1p(500)

function unexpectednessScore(popularity: number): number {
  // Clamp: items with popularity > 500 considered fully mainstream
  const logPop = Math.min(Math.log1p(popularity), MAX_LOG_POP)
  return 1 - (logPop / MAX_LOG_POP)  // High pop → 0 unexpected, low pop → 1 unexpected
}

// ── Genre Novelty ─────────────────────────────────────────
// How "new" are the candidate's genres relative to the user's long-term profile?
// A candidate whose genres have LOW weight in the user's vector is novel.
function genreNoveltyScore(
  candidate: ScoredCandidate,
  profile: UserProfile,
): number {
  if (candidate.genreIds.length === 0) return 0

  // Average affinity weight for this candidate's genres
  const avgGenreWeight = candidate.genreIds.reduce<number>(
    (sum, gId) => sum + Math.abs(profile.genreVector[gId] ?? 0),
    0
  ) / candidate.genreIds.length

  // Low existing affinity = high novelty (the user hasn't been here much)
  // Clamp to [0,1]: weight 0 → novel=1, weight 1 → novel=0
  return Math.max(1 - avgGenreWeight, 0)
}

// ── Full Diversity + Novelty + Serendipity Pipeline ──────

export function applyDiversityReranking(
  scored: ScoredCandidate[],
  profile?: UserProfile,
): ScoredCandidate[] {
  const sorted = [...scored].sort((a, b) => b.score - a.score)
  const genreCount: Record<number, number> = {}

  const reranked = sorted.map(candidate => {
    let adjustedScore = candidate.score
    const dominantGenre = candidate.genreIds[0]

    // ── Stage 1: Genre Saturation Penalty ────────────────
    if (dominantGenre !== undefined) {
      const count = genreCount[dominantGenre] || 0
      if (count >= SATURATION_THRESHOLD) {
        // Progressive penalty: the more repetition, the harder the hit
        const penaltyFactor = 1 - DIVERSITY_PENALTY * Math.min(count - 2, 3)
        adjustedScore *= penaltyFactor
      }
      genreCount[dominantGenre] = (genreCount[dominantGenre] || 0) + 1
    }

    if (!profile) {
      return { ...candidate, score: adjustedScore }
    }

    // ── Stage 2: Novelty Boost ────────────────────────────
    // Rewards candidates in genres the user has had little exposure to.
    // This nudges the engine to broaden the user's taste over time.
    const novelty = genreNoveltyScore(candidate, profile)
    // Only apply novelty boost when the candidate has reasonable quality
    // (novelty of a bad film is worthless)
    if (novelty > 0.3 && candidate.qualityScore > 0.5) {
      const noveltyBoost = NOVELTY_LAMBDA * novelty * NOVELTY_BOOST_MAX
      adjustedScore *= (1 + noveltyBoost)
    }

    // ── Stage 3: Serendipity Boost ────────────────────────
    // S(u,i) = Quality(i) × Unexpectedness(u,i)
    // A good film the user wouldn't normally find = serendipitous discovery.
    // We only boost if the candidate is already somewhat relevant (quality > 0.55)
    // to avoid promoting random obscure content.
    const unexpectedness = unexpectednessScore(candidate.popularity)
    if (unexpectedness > 0.4 && candidate.qualityScore > 0.55) {
      // Serendipity = how good it is × how surprising it is
      const serendipityValue = candidate.qualityScore * unexpectedness
      const serendipityBoost = SERENDIPITY_LAMBDA * serendipityValue * SERENDIPITY_BOOST_MAX
      adjustedScore *= (1 + serendipityBoost)
    }

    return { ...candidate, score: adjustedScore }

  }).sort((a, b) => b.score - a.score)

  return reranked
}
