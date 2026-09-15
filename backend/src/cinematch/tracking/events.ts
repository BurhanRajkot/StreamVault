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

import { supabaseAdmin } from '../../lib/supabase'
import { EventType, MediaType, InteractionEvent } from '../types'
import { getMovieFeatures } from '../features'
import { invalidateRecommendationCache } from '../mixer/homeTimeline'
import { invalidateUserProfile } from '../features/userProfile'
import { logMLInteraction } from '../ml/telemetry'
import { logPositionImpression } from '../ranking/positionBias'

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
  selectedServer?: string
  deviceType?: string
  os?: string
  browser?: string
  country?: string
  networkType?: string
  browserLanguage?: string
  localHour?: number
  timezone?: string
  // Phase 4: Position bias tracking fields
  displayPosition?: number    // 0-indexed position where the item appeared in the list
  recommendationSource?: string  // Source tag from ScoredCandidate.source
  // Gap 4 fix: genre context from the frontend to skip extra DB lookup
  genreIds?: number[]         // TMDB genre IDs of the watched item (sent by MovieDetailModal)
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
    selectedServer: event.selectedServer,
    deviceType: event.deviceType,
    os: event.os,
    browser: event.browser,
    country: event.country,
    networkType: event.networkType,
    browserLanguage: event.browserLanguage,
    localHour: event.localHour,
    timezone: event.timezone,
    genreIds: event.genreIds,
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

  // Delegate ML training tracking to the dedicated ML module
  logMLInteraction(row);

  // Phase 4: Log position impression for IPS bias correction (non-blocking)
  // Only log for clicks and watches (positive engagement with observed items)
  if (
    event.displayPosition !== undefined &&
    (event.eventType === 'click' || event.eventType === 'watch' || event.eventType === 'favorite')
  ) {
    logPositionImpression({
      userId: event.userId,
      tmdbId: event.tmdbId,
      mediaType: event.mediaType,
      displayPosition: event.displayPosition,
      clicked: true,  // Only called for positive events
      source: event.recommendationSource,
    }).catch(() => {})
  }

  // Invalidate the recommendation/profile caches so the next request rebuilds
  // from DB — but only for signals strong enough to actually move the needle.
  // 'click' and 'search' are weak curiosity/intent signals (weight 0.1-0.3);
  // invalidating on every one of those forces the next feed load into the
  // full, multi-second CineMatch pipeline (bypassing the 5-min in-memory
  // cache) far more often than the signal strength justifies.
  if (event.eventType !== 'click' && event.eventType !== 'search') {
    invalidateRecommendationCache(event.userId)
    invalidateUserProfile(event.userId)
  }

  // Update UserGenreProfile incrementally (async, non-blocking) — skip for
  // 'click'/'search' for the same reason as the cache invalidation above, but
  // more importantly here: this EMA-blends straight into the PERSISTED,
  // long-term taste profile that seedFromPersistedProfile() re-seeds into
  // genreVector on every getUserProfile() call. Browsing clicks happen far
  // more often than completed watches, so letting them write here let casual
  // curiosity permanently drag the profile toward "whatever was clicked on"
  // instead of "what was actually watched/liked" — recommendations drifting
  // generic and taste-blind over time. If genreIds were supplied by the
  // frontend, skip the extra getMovieFeatures() call.
  if (event.eventType !== 'click' && event.eventType !== 'search') {
    updateGenreProfileIncremental(event.userId, event.tmdbId, event.mediaType, weight, event.genreIds)
      .catch(() => {})
  }
}

// ── Incremental genre profile update ─────────────────────
// Merges this movie's genres into the persisted genreMap: every existing
// genre decays a little (GENRE_DECAY_PER_EVENT), then the genres this item
// actually has get EMA-blended toward the interaction's weight
// (new = 0.85 * decayed_existing + 0.15 * interaction_this_event). This means
// the profile stays fresh after each interaction without a full rebuild from
// all 200 historical interactions, and — critically — genres the user stops
// engaging with actually fade instead of sitting frozen at whatever they last
// reached.
//
// OPTIMISED: If genreIds are supplied (from the frontend watch payload),
// the extra getMovieFeatures() Supabase lookup is skipped entirely.
async function updateGenreProfileIncremental(
  userId: string,
  tmdbId: number,
  mediaType: MediaType,
  interactionWeight: number,
  preloadedGenreIds?: number[],  // ← fast path: supplied by frontend
): Promise<void> {
  // Use pre-supplied genreIds when available to skip DB lookup
  let resolvedGenreIds: number[] = preloadedGenreIds || []

  if (resolvedGenreIds.length === 0) {
    // Fall back to fetching features from DB / cache
    const features = await getMovieFeatures(tmdbId, mediaType)
    if (!features || features.genreIds.length === 0) return
    resolvedGenreIds = features.genreIds
  }

  // Dislike events get a 1.5× penalty multiplier so that a few dislikes
  // of the same genre are enough to noticeably shift the profile.
  const effectiveWeight = interactionWeight < 0
    ? interactionWeight * 1.5
    : interactionWeight

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

    // Decay EVERY existing genre a touch on each event, not just the ones this
    // item touches — without this, any genre that shows up in even ~5% of
    // watched titles converges to the ±1 clamp within a few hundred events,
    // because a genre absent from the current item never loses ground; it
    // just sits wherever it last landed forever. That's what was happening in
    // production: real profiles had nearly every genre saturated at 0.9-1.0
    // (verified against live data), so the ranker's genre-affinity term
    // stopped discriminating anything and recommendations collapsed to
    // popularity/freshness — generic and taste-blind regardless of what was
    // actually watched. 0.98 settles into a stable, well-separated
    // equilibrium within ~50-100 events for any occurrence rate (simulated),
    // rather than everything eventually pinning at the ceiling.
    const GENRE_DECAY_PER_EVENT = 0.98
    const updatedMap: Record<string, number> = {}
    for (const [key, val] of Object.entries(existingMap)) {
      if (key === '_meta') continue // nested keyword/cast/director/decade maps — copied through untouched below
      updatedMap[key] = val * GENRE_DECAY_PER_EVENT
    }
    if ('_meta' in existingMap) {
      (updatedMap as Record<string, unknown>)._meta = (existingMap as Record<string, unknown>)._meta
    }

    // Exponential moving average blend for each genre this movie belongs to.
    // Negative weights (dislike / low rating) push genre scores DOWN.
    // Clamped to [-1, 1] to prevent unbounded drift.
    for (const genreId of resolvedGenreIds) {
      const key = String(genreId)
      const current = updatedMap[key] ?? 0
      const blended = 0.85 * current + 0.15 * effectiveWeight
      updatedMap[key] = Math.max(-1, Math.min(1, blended))
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
