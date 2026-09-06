/**
 * Season/episode navigation for the detail modal's skip controls.
 *
 * Kept as plain functions rather than living in the component so the
 * cross-season edge cases — the last episode of a season, the first episode of
 * the first season, a season the metadata doesn't know about — can be tested
 * without mounting the modal.
 */

export interface SeasonSummary {
  season_number: number
  episode_count?: number
}

export interface EpisodePosition {
  season: number
  episode: number
}

/** Seasons in ascending order; the API does not guarantee the order it sends. */
function sortSeasons(seasons: readonly SeasonSummary[]): SeasonSummary[] {
  return [...seasons].sort((a, b) => a.season_number - b.season_number)
}

/**
 * The next episode, or `null` when there is nowhere further to go.
 *
 * @param episodesInSeason episode count for the current season, used both as
 *   the clamp when season metadata is missing and as the point at which we
 *   roll over into the next season
 */
export function nextEpisode(
  { season, episode }: EpisodePosition,
  seasons: readonly SeasonSummary[],
  episodesInSeason: number
): EpisodePosition | null {
  const sorted = sortSeasons(seasons)
  const currentIndex = sorted.findIndex((s) => s.season_number === season)

  // No metadata, or a season we've never heard of: all we can do is clamp
  // within the episode count we were given.
  if (!sorted.length || currentIndex === -1) {
    return episode < episodesInSeason ? { season, episode: episode + 1 } : null
  }

  if (episode < episodesInSeason) return { season, episode: episode + 1 }

  // Last episode of this season — roll into the next one, unless this is it.
  const nextSeason = sorted[currentIndex + 1]
  return nextSeason ? { season: nextSeason.season_number, episode: 1 } : null
}

/**
 * The previous episode, or `null` when already at the very first one.
 *
 * Unlike {@link nextEpisode} this needs no episode count: stepping back only
 * ever clamps at 1, and the previous season carries its own length.
 */
export function previousEpisode(
  { season, episode }: EpisodePosition,
  seasons: readonly SeasonSummary[]
): EpisodePosition | null {
  const sorted = sortSeasons(seasons)
  const currentIndex = sorted.findIndex((s) => s.season_number === season)

  if (!sorted.length || currentIndex === -1) {
    return episode > 1 ? { season, episode: episode - 1 } : null
  }

  if (episode > 1) return { season, episode: episode - 1 }

  // Episode 1 — drop to the last episode of the previous season, if there is one.
  const prevSeason = sorted[currentIndex - 1]
  if (!prevSeason) return null
  return {
    season: prevSeason.season_number,
    episode: prevSeason.episode_count || 1,
  }
}

/** True when the skip-back control should be disabled. */
export function isFirstEpisode(
  { season, episode }: EpisodePosition,
  seasons: readonly SeasonSummary[]
): boolean {
  const sorted = sortSeasons(seasons)
  if (!sorted.length) return episode <= 1
  return season === sorted[0].season_number && episode <= 1
}

/** True when the skip-forward control should be disabled. */
export function isLastEpisode(
  { season, episode }: EpisodePosition,
  seasons: readonly SeasonSummary[],
  episodesInSeason: number
): boolean {
  const sorted = sortSeasons(seasons)
  if (!sorted.length) return episode >= episodesInSeason

  const last = sorted[sorted.length - 1]
  return (
    season === last.season_number &&
    episode >= (last.episode_count || episodesInSeason)
  )
}
