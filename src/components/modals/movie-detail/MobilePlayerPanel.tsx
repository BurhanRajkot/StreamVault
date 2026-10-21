import type { Ref } from 'react'
import type { MediaMode } from '@/lib/config'
import type { MediaDisplay } from '@/lib/mediaDisplay'
import type { SeasonSummary } from '@/lib/episodeNavigation'
import type { ReleaseControls } from '@/components/media/DebridPlayerPane'
import { EpisodeList, NowPlayingHeading, SourcePickers, Synopsis } from './NowPlaying'
import { nowPlayingMeta } from './types'
import { useSeasonEpisodes } from '@/hooks/useSeasonEpisodes'

interface MobilePlayerPanelProps {
  tvId: number
  display: MediaDisplay
  mode: MediaMode
  season: number
  episode: number
  seasons: SeasonSummary[]
  /** Episodes in the playing season. */
  episodeCount: number
  /** Play this episode. */
  onPickEpisode: (season: number, episode: number) => void
  server: string
  onServerChange: (server: string) => void
  serverTriggerRef?: Ref<HTMLButtonElement>
  /** Premium's release picker and download link, once its player reports them. */
  releaseControls: ReleaseControls | null
  favorited: boolean
  onToggleFavorite: () => void
  isCopied: boolean
  onShare: () => void
}

/**
 * What's playing on a portrait phone, under the picture. Kept short above
 * the episode list — title with My List / Share beside it, then one row of
 * server, release and download — so most of a season shows without
 * scrolling. The synopsis comes after the episodes.
 *
 * This is the only part of the phone player that scrolls (index.css), so the
 * picture stays on screen while the viewer browses.
 */
export function MobilePlayerPanel({
  tvId,
  display,
  mode,
  season,
  episode,
  seasons,
  episodeCount,
  onPickEpisode,
  server,
  onServerChange,
  serverTriggerRef,
  releaseControls,
  favorited,
  onToggleFavorite,
  isCopied,
  onShare,
}: MobilePlayerPanelProps) {
  const isTv = mode === 'tv'

  // Same query the episode list runs, so this costs nothing extra
  const { data: playingSeason } = useSeasonEpisodes(tvId, season, isTv)
  const playingEpisode = playingSeason?.find((e) => e.episode_number === episode)
  const metaLine = nowPlayingMeta(isTv, season, episode, playingEpisode?.name, [
    display.year,
    display.durationStr,
    display.contentRating,
  ])
  // A show's synopsis is the episode's when TMDB has one
  const synopsis = (isTv && playingEpisode?.overview) || display.description

  return (
    <div className="player-chrome-portrait w-full px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] pt-3.5">
      <NowPlayingHeading
        title={display.title}
        metaLine={metaLine}
        favorited={favorited}
        onToggleFavorite={onToggleFavorite}
        isCopied={isCopied}
        onShare={onShare}
      />

      <SourcePickers
        mode={mode}
        server={server}
        onServerChange={onServerChange}
        serverTriggerRef={serverTriggerRef}
        releaseControls={releaseControls}
        className="mt-3"
      />

      {isTv ? (
        <>
          <EpisodeList
            tvId={tvId}
            seasons={seasons}
            season={season}
            episode={episode}
            episodeCount={episodeCount}
            onPick={onPickEpisode}
            className="mt-5"
            listClassName="-mx-2"
          />
          <Synopsis text={synopsis} heading="About this episode" className="mt-6" />
        </>
      ) : (
        <Synopsis text={synopsis} className="mt-4" />
      )}
    </div>
  )
}
