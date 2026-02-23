import { supabaseAdmin } from '../../lib/supabase'
import { EventType, InteractionEvent } from '../types'
import { logger } from '../../lib/logger'

// ── ML Telemetry Tracking ────────────────────────────────
// Converts semantic interaction events into numeric labels
// for Neural Network training (Table A: The Interaction Matrix)

export function logMLInteraction(event: InteractionEvent): void {
  // Convert the semantic weight into an ML label [0.0, 1.0].
  // Dislikes (-0.6 -> 0.0), Neutral -> 0.5, strong positive -> 1.0
  let mlLabel = 0.5; // default
  if (event.weight >= 0.8) mlLabel = 1.0;
  else if (event.weight >= 0.3) mlLabel = 0.8;
  else if (event.weight >= 0) mlLabel = 0.5;
  else mlLabel = 0.0;

  // Fire-and-forget ML telemetry logging
  supabaseAdmin.from('ml_interactions').insert({
    userId: event.userId,
    tmdbId: event.tmdbId,
    interactionType: event.eventType,
    mediaType: event.mediaType,
    label: mlLabel,
    selectedServer: event.selectedServer,
    deviceType: event.deviceType,
    os: event.os,
    browser: event.browser,
    country: event.country,
    playbackProgress: event.progress,
    sessionId: event.sessionId,
    networkType: event.networkType,
    browserLanguage: event.browserLanguage,
    localHour: event.localHour,
    timezone: event.timezone
  }).then(({error: mlError}: { error: any }) => {
    if (mlError) logger.error('CineMatch ML Failed to log interaction', { error: mlError.message })
  });
}
