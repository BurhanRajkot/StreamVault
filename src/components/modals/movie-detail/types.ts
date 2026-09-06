import type { MediaMode } from '@/lib/config'
import type { SeasonSummary } from '@/lib/episodeNavigation'

/**
 * The season/episode/server/play controls that both detail layouts render.
 *
 * Grouped into one prop because the phone sheet and the desktop panel need the
 * identical set — passing them individually meant a dozen props on each, and
 * the two lists drifting apart as one layout gained a control.
 */
export interface PlaybackControls {
  mode: MediaMode
  season: number
  episode: number
  /** Seasons TMDB knows about — empty until the fetch lands. */
  seasons: SeasonSummary[]
  /** Episodes in the currently selected season. */
  episodeCount: number
  server: string
  onSeasonChange: (season: number) => void
  onEpisodeChange: (episode: number) => void
  onServerChange: (server: string) => void
  onPlay: () => void
}

/** Season numbers to offer, falling back to 1–10 before metadata arrives. */
export function seasonOptions(seasons: SeasonSummary[]): number[] {
  return seasons.length > 0
    ? seasons.map((s) => s.season_number)
    : Array.from({ length: 10 }, (_, i) => i + 1)
}
