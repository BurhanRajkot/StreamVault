import type { CSSProperties } from 'react'
import { Download, Play, ThumbsUp, ThumbsDown } from 'lucide-react'
import { CircularRating } from '@/components/media/CircularRating'
import { cn } from '@/lib/utils'
import type { MediaDisplay } from '@/lib/mediaDisplay'
import type { PlaybackControls } from './types'
import { SeasonEpisodeSelects, ServerSelect } from './PlaybackPickers'

interface DetailPanelProps {
  display: MediaDisplay
  playback: PlaybackControls
  /**
   * The pre-play layer: title, selectors, Play and the like/dislike row.
   * Once playback starts the same panel renders below the player as
   * reference information only — the player's own bar names the title.
   */
  isPrePlay: boolean
  /** Open the download sheet (pre-play only). */
  onDownload?: () => void
  isLiked: boolean
  onToggleLike: () => void
  disliked: boolean
  onToggleDislike: () => void
}

/** Staggered entrance (`.animate-rise`): each block rises a beat after the one above it. */
const riseDelay = (step: number): CSSProperties => ({ animationDelay: `${120 + step * 60}ms` })

/** Desktop details grid — title block and cast, side by side. */
export function DetailPanel({
  display,
  playback,
  isPrePlay,
  onDownload,
  isLiked,
  onToggleLike,
  disliked,
  onToggleDislike,
}: DetailPanelProps) {
  const { title, subtitle, logoImage, rating, match, year, contentRating, durationStr, description, genres, cast, director } =
    display
  const { mode, season, episode, seasons, episodeCount, server, onSeasonChange, onEpisodeChange, onServerChange, onPlay } =
    playback

  const meta = [year, durationStr].filter(Boolean)

  return (
    <div className={cn('grid grid-cols-1 items-end gap-10 lg:grid-cols-12 lg:gap-20', !isPrePlay && 'items-start')}>
      {/* Left — details */}
      <div className="space-y-6 lg:col-span-7">
        {isPrePlay && (
          <div className="animate-rise" style={riseDelay(0)}>
            <h1 className="font-display text-4xl font-bold leading-[1.05] tracking-tight md:text-6xl lg:text-7xl">
              {logoImage ? (
                <img
                  src={logoImage}
                  alt={title}
                  draggable="false"
                  className="mb-2 h-[120px] w-auto max-w-[min(100%,34rem)] object-contain object-left-bottom drop-shadow-2xl md:h-[160px] lg:h-[180px]"
                />
              ) : (
                title
              )}
            </h1>
            {subtitle && <p className="mt-3 text-lg italic text-white/65 md:text-xl">{subtitle}</p>}
          </div>
        )}

        {/* Rating and facts */}
        <div className="animate-rise flex flex-wrap items-center gap-x-6 gap-y-3" style={riseDelay(1)}>
          <div className="flex items-center gap-3">
            <CircularRating rating={rating} />
            <span className="text-sm font-medium text-white/85 md:text-base">{match} match</span>
          </div>
          <div className="hidden h-6 w-px bg-white/15 sm:block" />
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-medium text-white/70 md:text-base">
            {meta.map((item, i) => (
              <span key={item} className="flex items-center gap-3">
                {i > 0 && <span aria-hidden="true" className="h-1 w-1 rounded-full bg-white/35" />}
                {item}
              </span>
            ))}
            <span className="rounded border border-white/25 px-1.5 py-px text-xs font-semibold text-white/75">
              {contentRating}
            </span>
          </div>
        </div>

        {genres.length > 0 && (
          <div className="animate-rise flex flex-wrap gap-2" style={riseDelay(2)}>
            {genres.slice(0, 4).map((genre) => (
              <span key={genre} className="rounded-full border border-white/15 bg-white/[0.04] px-3.5 py-1 text-sm text-white/80">
                {genre}
              </span>
            ))}
          </div>
        )}

        <p
          style={riseDelay(3)}
          className={cn(
            'animate-rise',
            'max-w-2xl text-base leading-relaxed text-white/70 md:text-lg',
            isPrePlay && 'line-clamp-4 lg:line-clamp-none'
          )}
        >
          {description}
        </p>

        {isPrePlay && (
          <div className="animate-rise space-y-4 pt-2" style={riseDelay(4)}>
            {mode === 'tv' && (
              <SeasonEpisodeSelects
                seasons={seasons}
                season={season}
                episode={episode}
                episodeCount={episodeCount}
                onSeasonChange={onSeasonChange}
                onEpisodeChange={onEpisodeChange}
                className="max-w-sm"
              />
            )}

            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={onPlay}
                className="flex h-12 items-center gap-2.5 rounded-lg bg-white px-8 text-base font-semibold text-black transition-[background-color,transform] hover:bg-white/90 active:scale-[0.97]"
              >
                <Play className="h-5 w-5 fill-current" />
                Play Now
              </button>

              {onDownload && (
                <button
                  onClick={onDownload}
                  className="flex h-12 items-center gap-2.5 rounded-lg bg-white/[0.12] px-6 text-base font-semibold text-white transition-[background-color,transform] hover:bg-white/[0.2] active:scale-[0.97]"
                >
                  <Download className="h-5 w-5" />
                  Download
                </button>
              )}

              <ServerSelect mode={mode} value={server} onChange={onServerChange} className="h-12 w-56" />

              <button
                onClick={onToggleLike}
                aria-label={isLiked ? 'Remove like' : 'Like this title'}
                aria-pressed={isLiked}
                className={cn(
                  'flex h-11 w-11 items-center justify-center rounded-full border transition-colors',
                  isLiked
                    ? 'border-primary/60 bg-primary/15 text-primary'
                    : 'border-white/15 text-white/60 hover:border-white/35 hover:text-white'
                )}
              >
                <ThumbsUp className={cn('h-4 w-4', isLiked && 'fill-current')} />
              </button>
              <button
                onClick={onToggleDislike}
                aria-label={disliked ? 'Remove dislike' : 'Dislike this title'}
                aria-pressed={disliked}
                className={cn(
                  'flex h-11 w-11 items-center justify-center rounded-full border transition-colors',
                  disliked
                    ? 'border-red-500/60 bg-red-500/10 text-red-400'
                    : 'border-white/15 text-white/60 hover:border-white/35 hover:text-white'
                )}
              >
                <ThumbsDown className={cn('h-4 w-4', disliked && 'fill-current')} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Right — cast & crew */}
      <div className="animate-rise space-y-8 pb-4 lg:col-span-5" style={riseDelay(5)}>
        {mode === 'movie' && director !== 'Unknown' && (
          <div>
            <h2 className="mb-1 text-sm font-medium text-white/50">Director</h2>
            <p className="text-xl font-semibold text-white/90">{director}</p>
          </div>
        )}
        {cast.length > 0 && (
          <div>
            <h2 className="mb-4 text-sm font-medium text-white/50">Cast</h2>
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {cast.map((actor) => (
                <li key={actor.name} className="flex items-center gap-3.5">
                  <img
                    src={actor.image}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="h-12 w-12 shrink-0 rounded-full object-cover ring-1 ring-white/10"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-[15px] font-medium text-white/90">{actor.name}</p>
                    <p className="truncate text-sm text-white/45">{actor.role}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
