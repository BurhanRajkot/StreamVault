// ============================================================
// CineMatch AI — Interaction Tracker
// X Algorithm equivalent: Engagement Pipeline
//
// Writes user interaction events to Supabase UserInteractions.
// Each event has a calibrated weight reflecting its signal strength.
//
// Event weights:
//   watch(>85%)  → 1.0  (completed — very strong signal)
//   watch(>50%)  → 0.8  (majority watched)
//   watch(>25%)  → 0.4  (partial — mild interest)
//   watch(<25%)  → 0.1  (barely started — weak signal)
//   favorite     → 0.9  (explicit positive)
//   rate(4-5)    → 0.9  (explicit like)
//   rate(3)      → 0.2  (neutral)
//   rate(1-2)    → -0.5 (explicit dislike — pushes genre DOWN)
//   dislike      → -0.6 (stronger negative than a 1-star — user clicked "not interested")
//   click        → 0.3  (curiosity signal)
//   search       → 0.2  (intent signal)
// ============================================================

import { supabaseAdmin } from '../lib/supabase'
import { EventType, MediaType, InteractionEvent } from './types'
import { getMovieFeatures } from './featureStore'
import { invalidateRecommendationCache } from './homeMixer'

// ── Event Weight Map ──────────────────────────────────────
const BASE_WEIGHTS: Record<EventType, number> = {
  watch:    1.0,   // Overridden by progress in logInteraction
  favorite: 0.9,
  click:    0.3,
  search:   0.2,
  rate:     0.9,   // Overridden by rating value in logInteraction
  dislike: -0.6,   // Explicit "not interested" signal
}

// ── Compute weight from event context ─────────────────────
function computeWeight(
  eventType: EventType,
  progress?: number,
  rating?: number,
): number {
  if (eventType === 'watch' && progress !== undefined) {
    if (progress >= 0.85) return 1.0
    if (progress >= 0.50) return 0.8
    if (progress >= 0.25) return 0.4
    return 0.1
  }
  if (eventType === 'rate' && rating !== undefined) {
    if (rating >= 4) return 0.9
    if (rating === 3) return 0.2
    return -0.5  // 1-2 stars — negative signal
  }
  return BASE_WEIGHTS[eventType] ?? 0.1
}

// ── Log a single interaction event ───────────────────────
export async function logInteraction(event: {
  userId: string
  tmdbId: number
  mediaType: MediaType
  eventType: EventType
  progress?: number
  rating?: number
}): Promise<void> {
  const weight = computeWeight(event.eventType, event.progress, event.rating)

  const row: InteractionEvent = {
    userId: event.userId,
    tmdbId: event.tmdbId,
    mediaType: event.mediaType,
    eventType: event.eventType,
    weight,
    progress: event.progress,
    rating: event.rating,
  }

  const { error } = await supabaseAdmin
    .from('UserInteractions')
    .insert({
      userId: row.userId,
      tmdbId: row.tmdbId,
      mediaType: row.mediaType,
      eventType: row.eventType,
      weight: row.weight,
      progress: row.progress ?? null,
      rating: row.rating ?? null,
    })

  if (error) {
    console.error('[CineMatch] Interaction log error:', error.message)
    return
  }

  // Invalidate caches so next request gets fresh personalized picks
  invalidateRecommendationCache(event.userId)

  // Update UserGenreProfile incrementally (async, non-blocking)
  updateGenreProfileIncremental(event.userId, event.tmdbId, event.mediaType, weight)
    .catch(() => {})
}

// ── Incremental genre profile update ─────────────────────
// FIXED: Previously wrote {} as a stub. Now fetches the actual movie's
// genres and merges them into the persisted genreMap using an EMA blend:
//   new_weight = 0.9 * existing + 0.1 * interaction_this_event
// This means the profile stays fresh after each interaction without
// a full rebuild from all 200 historical interactions.
async function updateGenreProfileIncremental(
  userId: string,
  tmdbId: number,
  mediaType: MediaType,
  interactionWeight: number,
): Promise<void> {
  // Fetch features for THIS specific movie/show
  const features = await getMovieFeatures(tmdbId, mediaType)
  if (!features || features.genreIds.length === 0) return

  try {
    // Read existing persisted profile (may be null for new user)
    const { data: existing } = await supabaseAdmin
      .from('UserGenreProfile')
      .select('genreMap')
      .eq('userId', userId)
      .single()

    const existingMap: Record<string, number> =
      (existing?.genreMap && typeof existing.genreMap === 'object')
        ? existing.genreMap as Record<string, number>
        : {}

    // Exponential moving average blend for each genre this movie belongs to
    // EMA constant: 0.9 (slow-moving, avoids one movie hijacking the profile)
    // Negative interactions (dislike/bad-rate) push scores DOWN
    const updatedMap = { ...existingMap }
    for (const genreId of features.genreIds) {
      const key = String(genreId)
      const current = updatedMap[key] ?? 0
      // Blend: move current value toward interactionWeight
      updatedMap[key] = 0.85 * current + 0.15 * Math.max(interactionWeight, 0)
      // Floor at 0 — genre weights should never go negative in the DB
      if (updatedMap[key] < 0.01) updatedMap[key] = 0
    }

    await supabaseAdmin
      .from('UserGenreProfile')
      .upsert({
        userId,
        genreMap: updatedMap,
        updatedAt: new Date().toISOString(),
      }, { onConflict: 'userId' })

  } catch (err) {
    console.error('[CineMatch] Genre profile update error:', err)
  }
}

// ── Batch log (for replaying missed events) ───────────────
export async function logInteractionBatch(
  events: Parameters<typeof logInteraction>[0][]
): Promise<void> {
  await Promise.allSettled(events.map(e => logInteraction(e)))
}
