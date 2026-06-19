import { HybridSearchResult } from './hybridSearch'

/**
 * Cross-Encoder Re-Ranking (pass-through)
 *
 * Previously proxied to Gemini API for deep contextual re-ranking.
 * Removed the external dependency — BM25 + popularity hybrid scoring
 * (computed in hybridSearch) already produces high-quality ranking.
 *
 * Function kept for API compatibility; returns candidates as-is.
 */
export async function crossEncoderReRank(
  _query: string,
  candidates: HybridSearchResult[],
  _topK: number = 10
): Promise<HybridSearchResult[]> {
  return candidates
}
