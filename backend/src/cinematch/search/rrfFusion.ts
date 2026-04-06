// ============================================================
// CineMatch — Reciprocal Rank Fusion (RRF)
//
// RRF_Score(d) = Σ_r 1 / (k + rank_r(d))
//
// Key advantages over weighted score blending:
//  - Scale-invariant: works across BM25, TMDB score, popularity
//  - No normalization parameters to tune
//  - Robust to single-list failures (absent items get k+N penalty)
//  - Proven in Cormack et al. 2009, deployed by major FAANG search
//
// k = 60 is the standard constant from the original paper.
// ============================================================

export interface RankedItem {
  id: string | number
}

export interface RankedList<T extends RankedItem> {
  /** Label for debugging (e.g. 'bm25', 'popularity', 'tmdbScore') */
  label: string
  /** Items sorted best-first. Must have unique ids. */
  items: T[]
}

export interface RRFResult<T extends RankedItem> {
  item: T
  rrfScore: number
  /** Score contribution per source list, keyed by list label */
  contributions: Record<string, number>
}

/**
 * Fuse N independently ranked lists into one via Reciprocal Rank Fusion.
 *
 * Items that appear in multiple lists get appropriately boosted.
 * Items absent from a list are treated as rank N+1 (the worst possible).
 *
 * @param lists  - Array of ranked lists (any score space, any scale)
 * @param k      - Smoothing constant (default 60, from Cormack 2009)
 */
export function rrfFuse<T extends RankedItem>(
  lists: RankedList<T>[],
  k: number = 60
): RRFResult<T>[] {
  // Build a registry of all unique items by id
  const itemRegistry = new Map<string | number, T>()
  const rrfMap = new Map<string | number, { score: number; contributions: Record<string, number> }>()

  for (const list of lists) {
    const n = list.items.length

    list.items.forEach((item, idx) => {
      // Register item
      if (!itemRegistry.has(item.id)) {
        itemRegistry.set(item.id, item)
        rrfMap.set(item.id, { score: 0, contributions: {} })
      }

      const rank = idx + 1 // 1-indexed
      const contribution = 1 / (k + rank)

      const entry = rrfMap.get(item.id)!
      entry.score += contribution
      entry.contributions[list.label] = contribution
    })

    // For items NOT in this list, add worst-rank penalty
    // (rank = n + 1, i.e. one past the end)
    const worstContribution = 1 / (k + n + 1)
    for (const [id, entry] of rrfMap.entries()) {
      if (!(list.label in entry.contributions)) {
        entry.score += worstContribution
        entry.contributions[list.label] = worstContribution
      }
    }
  }

  // Assemble final results sorted descending by RRF score
  const results: RRFResult<T>[] = []
  for (const [id, { score, contributions }] of rrfMap.entries()) {
    const item = itemRegistry.get(id)!
    results.push({ item, rrfScore: score, contributions })
  }

  results.sort((a, b) => b.rrfScore - a.rrfScore)
  return results
}
