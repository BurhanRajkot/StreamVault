import { useState, type ReactNode, type Ref } from 'react'
import { Link } from 'react-router-dom'
import { Check, Download, Play, Plus, Share2, ThumbsUp } from 'lucide-react'
import { cn, slugify } from '@/lib/utils'
import { getImageUrl } from '@/lib/api'
import type { Media } from '@/lib/config'
import type { MediaDisplay } from '@/lib/mediaDisplay'
import type { PlaybackControls } from './types'
import { ServerSelect } from './PlaybackPickers'
import { EpisodeList } from './NowPlaying'

interface MobileDetailSheetProps {
  tvId: number
  display: MediaDisplay
  playback: PlaybackControls
  favorited: boolean
  onToggleFavorite: () => void
  isLiked: boolean
  onToggleLike: () => void
  isCopied: boolean
  onShare: () => void
  /** Open the download sheet — for the title, or one episode of it. */
  onDownload: (season?: number, episode?: number, episodeName?: string) => void
  /** Play this episode straight away. */
  onPlayEpisode: (season: number, episode: number) => void
  /** Titles like this one (TMDB's "similar"), for the bottom of the page. */
  similar: Media[]
  /** For opening the server picker from elsewhere ("Switch server" in the player). */
  serverTriggerRef?: Ref<HTMLButtonElement>
  /** Open the server picker as soon as this mounts. */
  openServerPicker?: boolean
  onServerPickerOpenChange?: (open: boolean) => void
}

/** Synopsis length past which the sheet offers a "More" toggle. */
const OVERVIEW_CLAMP_THRESHOLD = 170

/** "More like this" — two rows of three is enough to suggest, not browse. */
const SIMILAR_LIMIT = 9

/**
 * Mobile title page (< md), laid out like Netflix's: the artwork across the
 * top, then the title, Play and Download, what it's about, and — for a show —
 * every episode, each one a tap from playing or downloading. Play goes
 * straight to a full-screen player (see MovieDetailModal); everything else
 * that used to sit around the player lives here instead.
 */
export function MobileDetailSheet({
  tvId,
  display,
  playback,
  favorited,
  onToggleFavorite,
  isLiked,
  onToggleLike,
  isCopied,
  onShare,
  onDownload,
  onPlayEpisode,
  similar,
  serverTriggerRef,
  openServerPicker,
  onServerPickerOpenChange,
}: MobileDetailSheetProps) {
  const { title, logoImage, heroImage, year, match, contentRating, durationStr, description, genres, cast, director } =
    display
  const { mode, season, episode, seasons, episodeCount, server, onServerChange, onPlay } = playback
  const isTv = mode === 'tv'
  // Starts clamped so Play and Download stay on the first screen
  const [isOverviewExpanded, setIsOverviewExpanded] = useState(false)

  // TMDB's "similar" is loose: keep titles people have heard of, with art to show
  const moreLikeThis = similar
    .filter((m) => m.poster_path && (m.vote_count ?? 0) >= 200)
    .sort((a, b) => (b.vote_count ?? 0) - (a.vote_count ?? 0))
    .slice(0, SIMILAR_LIMIT)

  const starring = cast
    .slice(0, 3)
    .map((c) => c.name)
    .join(', ')

  return (
    <div className="min-h-full bg-background pb-[calc(2rem+env(safe-area-inset-bottom,0px))]">
      {/* Artwork — the backdrop, which has no title baked into it */}
      <div className="relative aspect-[16/11] w-full overflow-hidden bg-black">
        <img src={heroImage} alt="" fetchPriority="high" decoding="async" className="h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-background" />
      </div>

      <div className="relative -mt-6 px-4">
        <h1 className="font-display text-[26px] font-bold leading-[1.15] tracking-tight">
          {logoImage ? (
            <img
              src={logoImage}
              alt={title}
              draggable="false"
              className="h-[64px] w-auto max-w-[72%] object-contain object-left-bottom drop-shadow-2xl"
            />
          ) : (
            title
          )}
        </h1>

        {/* Meta line */}
        <div className="mt-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px] font-medium text-foreground/65">
          {match && <span className="font-semibold text-emerald-400">{match} match</span>}
          {year && <span>{year}</span>}
          <span className="rounded-sm bg-white/15 px-1.5 py-px text-[11px] font-semibold text-foreground/85">{contentRating}</span>
          {durationStr && <span>{durationStr}</span>}
          <span className="rounded-sm border border-white/30 px-1 text-[10px] font-bold leading-[15px] text-foreground/70">HD</span>
        </div>

        {/* Play / Download */}
        <button
          onClick={onPlay}
          className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-md bg-white text-[15px] font-bold text-black tap-scale"
        >
          <Play className="h-5 w-5 fill-current" />
          Play
        </button>
        <button
          onClick={() => onDownload(isTv ? season : undefined, isTv ? episode : undefined)}
          className="mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-md bg-white/[0.14] text-[15px] font-semibold text-white tap-scale"
        >
          <Download className="h-5 w-5" />
          Download{isTv ? ` S${season}:E${episode}` : ''}
        </button>

        {/* Synopsis */}
        <p className={cn('mt-4 text-[14px] leading-relaxed text-foreground/85', !isOverviewExpanded && 'line-clamp-3')}>
          {description}
        </p>
        {description.length > OVERVIEW_CLAMP_THRESHOLD && (
          <button onClick={() => setIsOverviewExpanded((v) => !v)} className="mt-1 text-[13px] font-semibold text-foreground/55">
            {isOverviewExpanded ? 'Show less' : 'More'}
          </button>
        )}

        <div className="mt-2.5 space-y-0.5 text-[12px] leading-relaxed text-foreground/50">
          {starring && (
            <p className="line-clamp-1">
              <span className="text-foreground/40">Starring: </span>
              <span className="text-foreground/70">{starring}</span>
            </p>
          )}
          {!isTv && director !== 'Unknown' && (
            <p className="line-clamp-1">
              <span className="text-foreground/40">Director: </span>
              <span className="text-foreground/70">{director}</span>
            </p>
          )}
          {genres.length > 0 && (
            <p className="line-clamp-1">
              <span className="text-foreground/40">Genres: </span>
              <span className="text-foreground/70">{genres.slice(0, 3).join(', ')}</span>
            </p>
          )}
        </div>

        {/* My List / Rate / Share */}
        <div className="mt-5 flex items-start gap-9 px-1">
          <ActionButton onClick={onToggleFavorite} pressed={favorited} label="My List">
            {favorited ? <Check className="h-6 w-6 text-primary" /> : <Plus className="h-6 w-6" />}
          </ActionButton>
          <ActionButton onClick={onToggleLike} pressed={isLiked} label="Rate">
            <ThumbsUp className={cn('h-6 w-6', isLiked && 'fill-primary text-primary')} />
          </ActionButton>
          <ActionButton onClick={onShare} label={isCopied ? 'Copied' : 'Share'}>
            {isCopied ? <Check className="h-6 w-6 text-emerald-400" /> : <Share2 className="h-6 w-6" />}
          </ActionButton>
        </div>

        {/* Server — out of the way, but there when one fails */}
        <div className="mt-6 flex items-center justify-between gap-3 border-t border-white/10 pt-4">
          <span className="text-[13px] font-medium text-foreground/50">Server</span>
          <ServerSelect
            mode={mode}
            value={server}
            onChange={onServerChange}
            triggerRef={serverTriggerRef}
            defaultOpen={openServerPicker}
            onOpenChange={onServerPickerOpenChange}
            compact
            className="h-9 w-auto gap-2 rounded-full px-4 text-[13px]"
          />
        </div>
      </div>

      {isTv && (
        <EpisodeList
          tvId={tvId}
          seasons={seasons}
          season={season}
          episode={episode}
          episodeCount={episodeCount}
          onPick={onPlayEpisode}
          onDownload={(s, ep, name) => onDownload(s, ep, name)}
          markCurrent={false}
          density="comfortable"
          className="mt-6 px-4"
          listClassName="-mx-2.5"
        />
      )}

      {moreLikeThis.length > 0 && (
        <section aria-label="More like this" className="mt-8 px-4">
          <h2 className="text-[17px] font-bold">More like this</h2>
          <ul className="mt-3 grid grid-cols-3 gap-2">
            {moreLikeThis.map((item) => {
              const name = item.title || item.name || ''
              return (
                <li key={item.id}>
                  <Link
                    to={`/watch/${mode}/${item.id}-${slugify(name)}`}
                    aria-label={name}
                    className="block aspect-[2/3] overflow-hidden rounded-md bg-white/[0.06] tap-scale"
                  >
                    <img
                      src={getImageUrl(item.poster_path, 'thumbnail')}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="h-full w-full object-cover"
                    />
                  </Link>
                </li>
              )
            })}
          </ul>
        </section>
      )}
    </div>
  )
}

function ActionButton({
  onClick,
  pressed,
  label,
  children,
}: {
  onClick: () => void
  pressed?: boolean
  label: string
  children: ReactNode
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={pressed}
      className="flex min-w-[3.25rem] flex-col items-center gap-1.5 text-[11px] font-medium text-foreground/60 tap-scale"
    >
      {children}
      {label}
    </button>
  )
}
