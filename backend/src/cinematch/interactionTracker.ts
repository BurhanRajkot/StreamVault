// ============================================================
// CineMatch AI — Interaction Tracker
// X Algorithm equivalent: Engagement Pipeline
//
// Writes user interaction events to Supabase UserInteractions table.
// Each event has a calibrated weight reflecting its signal strength
// for recommendation quality.
//
// Event weights (inspired by X's engagement weighting):
//   watch(>50%)  → 1.0  (strong positive signal)
//   favorite     → 0.9  (explicit positive)
//   watch(<50%)  → 0.4  (mild interest)
//   click        → 0.3  (curiosity signal)
//   search       → 0.2  (intent signal)
//   rate(4-5)    → 0.9  (explicit like)
//   rate(1-2)    → -0.5 (explicit dislike — negative signal)
// ============================================================

import { createClient } from '@supabase/supabase-js'
import { EventType, MediaType, InteractionEvent } from './types'
import { invalidateRecommendationCache } from './homeMixer'

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
)

// ── Event Weight Map ──────────────────────────────────────────
const BASE_WEIGHTS: Record<EventType, number> = {
  watch:    1.0,   // Override by progress in logInteraction
  favorite: 0.9,
  click:    0.3,
  search:   0.2,
  rate:     0.9,   // Override by rating value in logInteraction
}

// ── Compute weight from event context ─────────────────────────
function computeWeight(
  eventType: EventType,
  progress?: number,
  rating?: number,
): number {
  if (eventType === 'watch' && progress !== undefined) {
    if (progress >= 0.85) return 1.0   // Completed — very strong signal
    if (progress >= 0.50) return 0.8   // Majority watched
    if (progress >= 0.25) return 0.4   // Quarter watched
    return 0.1                          // Just started — weak signal
  }

  if (eventType === 'rate' && rating !== undefined) {
    if (rating >= 4) return 0.9
    if (rating === 3) return 0.2
    return -0.5  // 1-2 star — negative signal (pushes genre down)
  }

  return BASE_WEIGHTS[eventType] ?? 0.1
}

// ── Log a single interaction event ───────────────────────────
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

  const { error } = await supabase
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

  // Invalidate recommendation cache so next request gets fresh personalized picks
  invalidateRecommendationCache(event.userId)

  // Update UserGenreProfile in Supabase (async, non-blocking)
  updateGenreProfile(event.userId).catch(() => {})
}

// ── Update persisted genre vector ─────────────────────────────
// Keeps a simplified genre preference snapshot in Supabase
// for faster cold-start on next session
async function updateGenreProfile(userId: string): Promise<void> {
  const { data: interactions } = await supabase
    .from('UserInteractions')
    .select('tmdbId, mediaType, weight, createdAt')
    .eq('userId', userId)
    .order('createdAt', { ascending: false })
    .limit(50)

  if (!interactions || interactions.length === 0) return

  // We can't fetch movie features here without async TMDB calls,
  // so the genre profile is updated fully in featureStore.getUserProfile()
  // This is a lightweight placeholder upsert for tracking activity timestamp
  try {
    await supabase
      .from('UserGenreProfile')
      .upsert({
        userId,
        genreMap: {},  // Updated properly in featureStore on next request
        updatedAt: new Date().toISOString(),
      }, { onConflict: 'userId' })
  } catch {
    // Non-critical — ignore failures
  }
}

// ── Batch log (for replaying missed events) ───────────────────
export async function logInteractionBatch(
  events: Parameters<typeof logInteraction>[0][]
): Promise<void> {
  await Promise.allSettled(events.map(e => logInteraction(e)))
}
