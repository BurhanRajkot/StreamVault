// ============================================================
// CineMatch — Reciprocal Rank Fusion (RRF)
//
// RRF merges multiple ranked lists into a single unified ranking
// without requiring score normalization across lists.
//
// score(d) = Σ_i  1 / (k + rank_i(d))
//
// where k=60 is the standard stability constant (Robertson, 2009).
// A document not present in a list is treated as rank=∞ (contributes 0).
//
// Why RRF over simple concatenation?
//   Different candidate sources have completely incompatible score
//   distributions. tmdb_similar scores have no relation to trending
//   popularity scores. RRF normalizes these into a unified ordinal
//   ranking based purely on each source's confidence in each item.
// ============================================================

import { Candidate, CandidateSource } from '../types'

const RRF_K = 60 // Standard constant — balances early vs. late rank contributions

/**
 * Merge multiple ranked candidate lists using Reciprocal Rank Fusion.
 *
 * @param sourceLists — Array of [source_label, candidates_in_ranked_order] pairs.
 *                      Each list should already be in the order the source
 *                      considers most relevant (e.g. TMDB similarity rank,
 *                      collaborative peer count rank, etc.)
 *
 * @returns Deduplicated list of candidates ordered by their RRF fusion score.
 *          The original `source` field on each candidate is preserved from
 *          whichever list it first appeared in (highest individual source rank).
 */
export function rrfFuse(
  sourceLists: Array<{ source: CandidateSource; candidates: Candidate[] }>,
): Candidate[] {
  // Map from unique key → { candidate, rrfScore }
  const scoreMap = new Map<string, { candidate: Candidate; rrfScore: number }>()

  for (const { source, candidates } of sourceLists) {
    for (let rank = 0; rank < candidates.length; rank++) {
      const c = candidates[rank]
      const key = `${c.mediaType}:${c.tmdbId}`
      const contribution = 1 / (RRF_K + rank + 1) // rank is 0-indexed, so +1

      const existing = scoreMap.get(key)
      if (existing) {
        existing.rrfScore += contribution

        // Accumulate all source memberships
        if (!existing.candidate.sources!.includes(source)) {
          existing.candidate.sources!.push(source)
        }

        // Accumulate per-source seed titles so sectionBuilder can use them
        if (c.seedTitle && !existing.candidate.seedTitles![source]) {
          existing.candidate.seedTitles![source] = c.seedTitle
        }
      } else {
        // First time we see this candidate — initialise sources and seedTitles
        const seedTitles: Partial<Record<CandidateSource, string>> = {}
        if (c.seedTitle) seedTitles[source] = c.seedTitle

        scoreMap.set(key, {
          candidate: {
            ...c,
            source,           // primary source (first seen)
            sources: [source],
            seedTitles,
          },
          rrfScore: contribution,
        })
      }
    }
  }

  // Sort by descending RRF score
  return Array.from(scoreMap.values())
    .sort((a, b) => b.rrfScore - a.rrfScore)
    .map(entry => entry.candidate)
}
