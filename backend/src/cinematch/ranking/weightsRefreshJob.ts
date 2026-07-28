// ============================================================
// CineMatch — Ranking Weights Refresh Job
//
// Closes the position-bias learning loop. tracking/events.ts writes impression
// records via logPositionImpression(), and estimateIPSAdjustedWeights() turns
// them into IPS-corrected ranking weights. This job runs that estimation on a
// schedule and publishes the result through setBaseWeights(), so
// computeDynamicWeights() — and therefore live ranking — actually reflects what
// the learner has measured.
//
// Started from backend/src/index.ts on server boot.
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
