// ============================================================
// CineMatch — Ranking Weights Refresh Job (Phase 4 wiring)
//
// Closes the loop that was previously open: estimateIPSAdjustedWeights()
// computed IPS/LambdaRank-corrected weights that nothing consumed. This job
// runs it on a schedule and publishes the result via setBaseWeights(), so
// computeDynamicWeights() (and therefore live ranking) reflects what the
// position-bias learner has learned.
//
// NOTE ON IMPORT PATHS: adjust to your layout. Based on positionBias.ts
// (which imports '../ranking/dynamicWeights' and '../../lib/logger'), this
// file is assumed to sit at the recommendation-engine root, a sibling of the
// 'ranking/' and 'recommendation/' folders.
// ============================================================

import { getDefaultBaseWeights, setBaseWeights } from './dynamicWeights'
import { estimateIPSAdjustedWeights } from './positionBias'
import { logger } from '../../lib/logger'

const REFRESH_INTERVAL_MS = 60 * 60 * 1000 // hourly — matches the propensity cache TTL

export async function refreshRankingWeights(): Promise<void> {
  try {
    // Adjust from the STABLE default each cycle so corrections don't compound
    // hour over hour (adjusting from the already-adjusted value would drift).
    const adjusted = await estimateIPSAdjustedWeights(getDefaultBaseWeights())
    setBaseWeights(adjusted)
    logger.info('[weights] Refreshed base ranking weights from IPS', { adjusted })
  } catch (err: unknown) {
    logger.error('[weights] Weight refresh failed; keeping current base', {
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

/**
 * Call once on server startup. Runs immediately, then hourly.
 * .unref() lets the process exit even with the interval pending (safe for tests/CLI).
 */
export function startWeightsRefreshLoop(): void {
  void refreshRankingWeights()
  const handle = setInterval(() => void refreshRankingWeights(), REFRESH_INTERVAL_MS)
  handle.unref?.()
}
