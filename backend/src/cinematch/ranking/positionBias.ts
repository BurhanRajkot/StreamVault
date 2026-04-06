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
// ── Estimate IPS-adjusted ranking weights ─────────────────
// Periodically called from a background job or on startup.
// Computes an IPS-corrected listwise adjustment to the base ranking weights
// using a LambdaRank / NDCG-aware gradient approximation.
export async function estimateIPSAdjustedWeights(
  baseWeights: RankingWeights,
): Promise<RankingWeights> {
  try {
    const propensityTable = await computePropensityTable()
    if (propensityTable.size === 0) return baseWeights

    // With propensity available, query click data with position annotations
    // We get both clicks and non-clicks (impressions) to simulate pair-wise gradients
    const { data: logData, error } = await supabaseAdmin
      .from('PositionBiasLog')
      .select('userId, tmdbId, displayPosition, clicked, source')
      .order('loggedAt', { ascending: false })
      .limit(10000)

    if (error || !logData || logData.length === 0) return baseWeights

    // Group logs by user session (simplification: group by userId for recent logs)
    const sessions = new Map<string, typeof logData>()
    for (const row of logData) {
      if (!sessions.has(row.userId)) sessions.set(row.userId, [])
      sessions.get(row.userId)!.push(row)
    }

    // Gradient accumulators for our 3 main heuristic sources
    let dGenre = 0, dKw = 0, dCast = 0

    const LEARNING_RATE = 0.01

    // LambdaRank approximation:
    // For each session, find pairs of (clicked item i, unclicked item j).
    // If rank(i) > rank(j) (meaning the clicked item was shown below the unclicked one),
    // there's a ranking error. We compute the delta NDCG for swapping them.
    for (const sessionLogs of sessions.values()) {
      const clicked = sessionLogs.filter(r => r.clicked)
      const unclicked = sessionLogs.filter(r => !r.clicked)

      for (const c of clicked) {
        for (const u of unclicked) {
          // Has to have been ranked lower to constitute an error
          if (c.displayPosition > u.displayPosition) {
            // Delta NDCG from swapping positions
            const dcgI = 1 / Math.log2(u.displayPosition + 2)
            const dcgJ = 1 / Math.log2(c.displayPosition + 2)
            const deltaNDCG = Math.abs(dcgI - dcgJ)
            
            // IPS weight for this observation pair
            const ipsI = ipsCorrectWeight(1.0, c.displayPosition, propensityTable)
            const ipsJ = ipsCorrectWeight(1.0, u.displayPosition, propensityTable)
            const pairWeight = ((ipsI + ipsJ) / 2) * deltaNDCG

            // Heuristic feature extraction: if source = 'genre_discovery', it means
            // genreAffinity was the primary signal for this item.
            // We increase weights for signals of clicked items, decrease for unclicked.
            if (c.source === 'genre_discovery') dGenre += pairWeight * LEARNING_RATE
            if (u.source === 'genre_discovery') dGenre -= pairWeight * LEARNING_RATE
            
            if (c.source === 'keyword_discovery') dKw += pairWeight * LEARNING_RATE
            if (u.source === 'keyword_discovery') dKw -= pairWeight * LEARNING_RATE
            
            if (c.source === 'cast_discovery') dCast += pairWeight * LEARNING_RATE
            if (u.source === 'cast_discovery') dCast -= pairWeight * LEARNING_RATE
          }
        }
      }
    }

    // Normalise boosts to [-0.1, 0.1] clip range
    const clip = (val: number) => Math.max(Math.min(val, 0.1), -0.1)

    const adjusted: RankingWeights = {
      ...baseWeights,
      genreAffinity: Math.max(0.1, Math.min(baseWeights.genreAffinity + clip(dGenre), 0.60)),
      keywordAffinity: Math.max(0.05, Math.min(baseWeights.keywordAffinity + clip(dKw), 0.30)),
      castAffinity: Math.max(0.05, Math.min(baseWeights.castAffinity + clip(dCast), 0.30)),
    }

    logger.info('[IPS] Computed NDCG/LambdaRank adjusted weights', { 
      deltas: { dGenre: clip(dGenre), dKw: clip(dKw), dCast: clip(dCast) },
      adjusted 
    })
    
    return adjusted

  } catch (err: any) {
    logger.error('[IPS] Weight estimation failed', { error: err.message })
    return baseWeights
  }
}
