import { useState, type Ref } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Check, Heart, Play, Share2 } from 'lucide-react'
import { CONFIG, DEBRID_SERVER_ID, type MediaMode } from '@/lib/config'
import { fetchSeasonEpisodes, type EpisodeSummary } from '@/lib/api'
import type { MediaDisplay } from '@/lib/mediaDisplay'
import type { SeasonSummary } from '@/lib/episodeNavigation'
import type { ReleaseControls } from '@/components/media/DebridPlayerPane'
import { cn } from '@/lib/utils'
import { DownloadButton, ReleaseSelect, SeasonSelect, ServerSelect } from './PlaybackPickers'

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

/** Synopsis length past which it starts clamped behind a "More" toggle. */
const OVERVIEW_CLAMP_THRESHOLD = 160

/** Episode lists change rarely; the backend caches them for two hours too. */
const EPISODES_STALE_MS = 2 * 60 * 60 * 1000

function useSeasonEpisodes(tvId: number, season: number, enabled: boolean) {
  return useQuery({
    queryKey: ['seasonEpisodes', tvId, season],
    queryFn: () => fetchSeasonEpisodes(tvId, season),
    enabled: enabled && tvId > 0,
    staleTime: EPISODES_STALE_MS,
    gcTime: EPISODES_STALE_MS * 2,
    retry: 1,
  })
}

const chip =
  'inline-flex h-9 shrink-0 items-center gap-2 rounded-full bg-white/[0.09] px-4 text-[13px] font-semibold text-white transition-colors active:bg-white/[0.16] tap-scale'

/**
 * What's playing on a portrait phone, under the picture: the title, quick
 * actions, where it's playing from and — for a show — every episode of the
 * season, so the next one is a tap away rather than two dropdowns.
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
  const { title, year, durationStr, contentRating, description } = display
  const isTv = mode === 'tv'
  const isPremium = server === DEBRID_SERVER_ID
  const [overviewExpanded, setOverviewExpanded] = useState(false)

  // Same query the episode list runs, so this costs nothing extra
  const { data: playingSeason } = useSeasonEpisodes(tvId, season, isTv)
  const playingEpisode = playingSeason?.find((e) => e.episode_number === episode)

  const metaLine = isTv
    ? [`S${season} · E${episode}`, playingEpisode?.name].filter(Boolean).join(' · ')
    : [year, durationStr, contentRating].filter(Boolean).join(' · ')
  // A show's synopsis is the episode's when TMDB has one
  const synopsis = (isTv && playingEpisode?.overview) || description

  return (
    <div className="player-chrome-portrait w-full pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))]">
      <div className="px-4 pt-4">
        <h1 className="line-clamp-2 font-display text-[20px] font-bold leading-snug tracking-tight text-white">
          {title}
        </h1>
        {metaLine && <p className="mt-1 line-clamp-1 text-[13px] font-medium text-white/55">{metaLine}</p>}
      </div>

      {/* Quick actions — one swipeable row, YouTube-style */}
      <div className="edge-row mt-3.5 gap-2 px-4">
        <button onClick={onToggleFavorite} aria-pressed={favorited} className={chip}>
          <Heart className={cn('h-4 w-4', favorited && 'fill-red-500 text-red-500')} />
          {favorited ? 'In My List' : 'My List'}
        </button>
        <button onClick={onShare} className={chip}>
          {isCopied ? <Check className="h-4 w-4 text-emerald-400" /> : <Share2 className="h-4 w-4" />}
          {isCopied ? 'Copied' : 'Share'}
        </button>
        {isPremium && releaseControls && (
          <DownloadButton
            download={releaseControls.download}
            className={cn(chip, 'border-0 px-4 hover:bg-white/[0.09]')}
          />
        )}
      </div>

      {/* Where it's playing from — needed when a server fails */}
      <section aria-label="Playing from" className="mx-4 mt-5 rounded-2xl bg-white/[0.04] p-3 ring-1 ring-inset ring-white/[0.07]">
        <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-white/50">Playing from</p>
        <ServerSelect
          mode={mode}
          value={server}
          onChange={onServerChange}
          triggerRef={serverTriggerRef}
          className="h-11 w-full"
        />
        {isPremium && releaseControls && <ReleaseSelect controls={releaseControls} className="mt-2 h-11 w-full" />}
      </section>

      {synopsis && (
        <div className="mt-5 px-4">
          <p className={cn('text-[14px] leading-relaxed text-white/70', !overviewExpanded && 'line-clamp-3')}>{synopsis}</p>
          {synopsis.length > OVERVIEW_CLAMP_THRESHOLD && (
            <button
              onClick={() => setOverviewExpanded((v) => !v)}
              className="mt-1 text-[13px] font-semibold text-white/50"
            >
              {overviewExpanded ? 'Show less' : 'More'}
            </button>
          )}
        </div>
      )}

      {isTv && (
        <EpisodeList
          tvId={tvId}
          seasons={seasons}
          season={season}
          episode={episode}
          episodeCount={episodeCount}
          onPick={onPickEpisode}
        />
      )}
    </div>
  )
}

interface EpisodeListProps {
  tvId: number
  seasons: SeasonSummary[]
  season: number
  episode: number
  episodeCount: number
  onPick: (season: number, episode: number) => void
}

/** Today, as TMDB writes air dates — for telling which episodes are out yet. */
const today = () => new Date().toISOString().slice(0, 10)

function EpisodeList({ tvId, seasons, season, episode, episodeCount, onPick }: EpisodeListProps) {
  // Picking a season here only browses it; the playing episode changes on a
  // tap. The choice is remembered against the season that was playing when it
  // was made, so once the player moves on by itself (next episode, into the
  // next season) the list follows it instead.
  const [browse, setBrowse] = useState({ from: season, to: season })
  const browseSeason = browse.from === season ? browse.to : season
  const setBrowseSeason = (to: number) => setBrowse({ from: season, to })

  const { data: episodes, isPending } = useSeasonEpisodes(tvId, browseSeason, true)
  const knownCount =
    browseSeason === season ? episodeCount : (seasons.find((s) => s.season_number === browseSeason)?.episode_count ?? 0)
  // No metadata (a failed fetch, or one still on its way): numbered rows still play
  const rows: EpisodeSummary[] =
    episodes && episodes.length > 0
      ? episodes
      : Array.from({ length: knownCount }, (_, i) => ({
          episode_number: i + 1,
          name: '',
          overview: '',
          still_path: null,
          runtime: null,
          air_date: null,
        }))
  const now = today()

  return (
    <section aria-label="Episodes" className="mt-7">
      <div className="flex items-center justify-between gap-3 px-4">
        <h2 className="text-[17px] font-bold text-white">Episodes</h2>
        <SeasonSelect
          seasons={seasons}
          value={browseSeason}
          onChange={setBrowseSeason}
          className="h-9 w-auto gap-2 rounded-full px-4 text-[13px] font-semibold"
        />
      </div>

      <ol className="mt-3 space-y-1 px-2" aria-busy={isPending || undefined}>
        {rows.map((ep) => {
          const playing = browseSeason === season && ep.episode_number === episode
          const unaired = !!ep.air_date && ep.air_date > now
          const name = ep.name || `Episode ${ep.episode_number}`
          return (
            <li key={ep.episode_number}>
              <button
                onClick={() => {
                  if (!playing) onPick(browseSeason, ep.episode_number)
                }}
                aria-current={playing || undefined}
                aria-label={`Episode ${ep.episode_number}: ${name}${playing ? ', now playing' : ''}`}
                className={cn(
                  'flex w-full items-center gap-3 rounded-xl p-2 text-left transition-colors active:bg-white/[0.08]',
                  playing && 'bg-white/[0.07]'
                )}
              >
                <div className="relative aspect-video w-[7.75rem] shrink-0 overflow-hidden rounded-lg bg-white/[0.06]">
                  {ep.still_path ? (
                    <img
                      src={`${CONFIG.IMG_BASE_URL}/w300${ep.still_path}`}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className={cn('h-full w-full object-cover', unaired && 'opacity-40')}
                    />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center font-display text-xl font-bold text-white/25">
                      {ep.episode_number}
                    </span>
                  )}
                  {playing ? (
                    <span className="absolute inset-0 flex items-center justify-center bg-black/55">
                      <NowPlayingBars />
                    </span>
                  ) : (
                    ep.still_path && (
                      <span className="absolute bottom-1.5 left-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/60">
                        <Play className="ml-px h-3 w-3 fill-white text-white" />
                      </span>
                    )
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className={cn('line-clamp-2 text-[14px] font-semibold leading-snug', playing ? 'text-white' : 'text-white/90')}>
                    {ep.episode_number}. {name}
                  </p>
                  <p className={cn('mt-1 text-xs', playing ? 'font-semibold text-[hsl(221_90%_70%)]' : 'text-white/45')}>
                    {playing
                      ? 'Now playing'
                      : unaired
                        ? `Airs ${formatAirDate(ep.air_date as string)}`
                        : ep.runtime
                          ? `${ep.runtime}m`
                          : ''}
                  </p>
                </div>
              </button>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

function formatAirDate(date: string): string {
  const parsed = new Date(`${date}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime())) return date
  return parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

/** Three bars — the "this one's on" marker over the playing episode's still. */
function NowPlayingBars() {
  return (
    <span className="flex h-4 items-end gap-[3px]" aria-hidden="true">
      <span className="now-playing-bar h-full w-[3px] rounded-full bg-white" />
      <span className="now-playing-bar h-full w-[3px] rounded-full bg-white [animation-delay:-0.4s]" />
      <span className="now-playing-bar h-full w-[3px] rounded-full bg-white [animation-delay:-0.8s]" />
    </span>
  )
}
