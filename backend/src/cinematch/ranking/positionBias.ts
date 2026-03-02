// ============================================================
// CineMatch — Position Bias & IPS Weight Estimation (Phase 4)
//
// The core problem in recommendation ranking:
//   Items shown at position 1 get clicked more than position 10 —
//   NOT because they are necessarily better, but because users
//   see them first. This is "position bias."
//
// If we naively train on click data, the model learns to prefer whatever
// was already being shown in top slots, creating a self-reinforcing loop.
//
// Inverse Propensity Scoring (IPS) corrects this:
//   corrected_weight(u, i, pos) = raw_weight / propensity(pos)
//
// where propensity(pos) = P(user observes item | displayed at position pos)
//
// We use the examination hypothesis (Joachims et al., 2017):
//   An item can only be clicked if it was first examined.
//   P(click | pos) = P(examine | pos) × P(click | examine, item)
//
// Propensity estimation:
//   propensity(pos) = (click_rate_at_pos) / (click_rate_at_pos_1)
//   Clipped-IPS: 1/propensity capped at MAX_IPS_WEIGHT to handle rare slots.
//
// ============================================================

import { supabaseAdmin } from '../../lib/supabase'
import { logger } from '../../lib/logger'
import { RankingWeights } from '../ranking/dynamicWeights'
import NodeCache from 'node-cache'

// ── Config ────────────────────────────────────────────────
const MAX_IPS_WEIGHT = 10.0    // Clipped-IPS cap — prevents extreme corrections
const MIN_IMPRESSIONS = 50     // Need at least N impressions at a slot to trust estimate
const FALLBACK_PROPENSITY = 0.1 // For slots with too few observations

// ── Cache ─────────────────────────────────────────────────
// Propensity estimates are recalculated infrequently (hourly)
const propensityCache = new NodeCache({ stdTTL: 3600, checkperiod: 600 })

// ── Propensity Table ──────────────────────────────────────
// Maps display position → estimated propensity score [0, 1]
export type PropensityTable = Map<number, number>

// ── Compute Propensity Scores from PositionBiasLog ──────
// This is the "offline" estimation step:
//   1. Group all logged impressions by display position
//   2. Compute click-through rate per position
//   3. Normalize by the CTR at position 0 (highest slot)
//
// Returns a map: position → propensity ∈ (0, 1]
export async function computePropensityTable(): Promise<PropensityTable> {
  const cached = propensityCache.get<PropensityTable>('propensity_table')
  if (cached) return cached

  try {
    const { data, error } = await supabaseAdmin
      .from('PositionBiasLog')
      .select('displayPosition, clicked')
      .order('displayPosition', { ascending: true })

    if (error || !data || data.length === 0) {
      logger.warn('[IPS] No position bias data yet — using uniform propensities')
      return new Map()
    }

    // Aggregate click counts and impression counts per position
    const stats = new Map<number, { impressions: number; clicks: number }>()
    for (const row of data) {
      const pos = row.displayPosition
      const existing = stats.get(pos) ?? { impressions: 0, clicks: 0 }
      existing.impressions++
      if (row.clicked) existing.clicks++
      stats.set(pos, existing)
    }

    // Compute raw CTR per position
    const ctrByPosition = new Map<number, number>()
    for (const [pos, { impressions, clicks }] of stats.entries()) {
      if (impressions >= MIN_IMPRESSIONS) {
        ctrByPosition.set(pos, clicks / impressions)
      }
    }

    if (ctrByPosition.size === 0) {
      logger.warn('[IPS] Insufficient data for estimation (min impressions not met)')
      return new Map()
    }

    // Normalize by position-0 (top slot) CTR
    const topCTR = ctrByPosition.get(0) ?? ctrByPosition.get(1) ?? 1e-6
    const propensityTable: PropensityTable = new Map()

    for (const [pos, ctr] of ctrByPosition.entries()) {
      const propensity = Math.max(ctr / topCTR, 1e-6)  // Prevent division by zero
      propensityTable.set(pos, Math.min(propensity, 1.0)) // Cap at 1.0
    }

    logger.info('[IPS] Computed propensity table', {
      positions: propensityTable.size,
      topCTR: topCTR.toFixed(4),
    })

    propensityCache.set('propensity_table', propensityTable)
    return propensityTable

  } catch (err: any) {
    logger.error('[IPS] Propensity computation failed', { error: err.message })
    return new Map()
  }
}

// ── Compute IPS-corrected weight ──────────────────────────
// corrected_weight = raw_weight / propensity(pos)  (clipped)
export function ipsCorrectWeight(
  rawWeight: number,
  displayPosition: number,
  propensityTable: PropensityTable,
): number {
  const propensity = propensityTable.get(displayPosition) ?? FALLBACK_PROPENSITY
  const ipsWeight = rawWeight / propensity
  // Clipped-IPS: bound extreme corrections
  return Math.min(ipsWeight, MAX_IPS_WEIGHT)
}

// ── Log a display impression for position bias estimation ─
export async function logPositionImpression(event: {
  userId: string
  tmdbId: number
  mediaType: string
  displayPosition: number
  clicked: boolean
  source?: string
}): Promise<void> {
  try {
    await supabaseAdmin
      .from('PositionBiasLog')
      .insert({
        userId: event.userId,
        tmdbId: event.tmdbId,
        mediaType: event.mediaType,
        displayPosition: event.displayPosition,
        clicked: event.clicked,
        source: event.source ?? null,
        loggedAt: new Date().toISOString(),
      })
  } catch (err: any) {
    // Non-critical — we never want position logging to block the main request
    logger.warn('[IPS] Position log failed (non-critical)', { error: err.message })
  }
}

// ── Estimate IPS-adjusted ranking weights ─────────────────
// Periodically called from a background job or on startup.
// Computes an IPS-corrected adjustment to the base ranking weights
// by analyzing which weights produced the most corrected positive signal.
//
// Implementation: simple gradient approximation —
//   For each weight dimension, observe whether IPS-corrected clicks
//   on items where that signal was HIGH are above average CTR.
//   Increase the weight for consistently predictive signals.
//
// This is a first-order approximation of LambdaMART in production
// without requiring a full ML training pipeline.
export async function estimateIPSAdjustedWeights(
  baseWeights: RankingWeights,
): Promise<RankingWeights> {
  try {
    const propensityTable = await computePropensityTable()
    if (propensityTable.size === 0) return baseWeights

    // With propensity available, query click data with position annotations
    const { data: clickData, error } = await supabaseAdmin
      .from('PositionBiasLog')
      .select('displayPosition, clicked, source')
      .eq('clicked', true)
      .order('loggedAt', { ascending: false })
      .limit(5000)

    if (error || !clickData || clickData.length === 0) return baseWeights

    // Compute IPS-weighted CTR by source
    const sourceCTR: Record<string, { weightedClicks: number; impressions: number }> = {}
    for (const row of clickData) {
      const source = row.source ?? 'unknown'
      const ipsW = ipsCorrectWeight(1.0, row.displayPosition, propensityTable)
      if (!sourceCTR[source]) sourceCTR[source] = { weightedClicks: 0, impressions: 0 }
      sourceCTR[source].weightedClicks += ipsW
      sourceCTR[source].impressions++
    }

    // Sources with high IPS-corrected CTR → boost affinity weights
    // This is a heuristic adjustment, not a gradient step
    const genreBoost = (sourceCTR['genre_discovery']?.weightedClicks ?? 0) /
                       Math.max(sourceCTR['genre_discovery']?.impressions ?? 1, 1)
    const kwBoost = (sourceCTR['keyword_discovery']?.weightedClicks ?? 0) /
                    Math.max(sourceCTR['keyword_discovery']?.impressions ?? 1, 1)
    const castBoost = (sourceCTR['cast_discovery']?.weightedClicks ?? 0) /
                      Math.max(sourceCTR['cast_discovery']?.impressions ?? 1, 1)

    // Normalise boosts to [0, 0.05] range — small nudge, not a full re-parameterization
    const normalise = (val: number) => Math.min(val / 10, 0.05)

    const adjusted: RankingWeights = {
      ...baseWeights,
      genreAffinity: Math.min(baseWeights.genreAffinity + normalise(genreBoost), 0.50),
      keywordAffinity: Math.min(baseWeights.keywordAffinity + normalise(kwBoost), 0.20),
      castAffinity: Math.min(baseWeights.castAffinity + normalise(castBoost), 0.20),
    }

    logger.info('[IPS] Computed adjusted weights', { adjusted })
    return adjusted

  } catch (err: any) {
    logger.error('[IPS] Weight estimation failed', { error: err.message })
    return baseWeights
  }
}
