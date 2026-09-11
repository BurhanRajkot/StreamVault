import { useState } from 'react'
import { Play, Server, Heart, Share2, Check } from 'lucide-react'
import { serverOptions } from '@/lib/config'
import { cn } from '@/lib/utils'
import type { MediaDisplay } from '@/lib/mediaDisplay'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { type PlaybackControls, seasonOptions } from './types'

interface MobileDetailSheetProps {
  display: MediaDisplay
  playback: PlaybackControls
  favorited: boolean
  onToggleFavorite: () => void
  isCopied: boolean
  onShare: () => void
}

/** Synopsis length past which the sheet offers a "More" toggle. */
const OVERVIEW_CLAMP_THRESHOLD = 190

/**
 * Mobile pre-play sheet (< md).
 *
 * Poster art fills the screen behind a sheet of details that scrolls up over
 * it. Score dial and like/dislike are deliberately absent here — on a phone
 * they crowded out the only two things that matter on this screen, Play and
 * what the title actually is.
 */
export function MobileDetailSheet({
  display,
  playback,
  favorited,
  onToggleFavorite,
  isCopied,
  onShare,
}: MobileDetailSheetProps) {
  const { title, logoImage, year, contentRating, durationStr, description, genres, cast, director } =
    display
  const {
    mode,
    season,
    episode,
    seasons,
    episodeCount,
    server,
    onSeasonChange,
    onEpisodeChange,
    onServerChange,
    onPlay,
  } = playback

  // Starts clamped — a 5-line synopsis pushes Play off-screen. Local to this
  // layout: the desktop panel never clamps.
  const [isOverviewExpanded, setIsOverviewExpanded] = useState(false)

  return (
    <div className="flex min-h-full flex-col">
      {/* See-through spacer — the ambient poster shows through it */}
      <div className="h-[44svh] shrink-0" aria-hidden="true" />

      <div className="relative flex-1 bg-gradient-to-b from-transparent via-background/95 to-background px-5 pb-[calc(2.5rem+env(safe-area-inset-bottom,0px))]">
        {logoImage ? (
          <img
            src={logoImage}
            alt={title}
            aria-hidden="true"
            role="presentation"
            draggable="false"
            className="mb-1 max-h-[84px] w-auto max-w-[78%] object-contain drop-shadow-2xl"
          />
        ) : (
          <h1 className="text-[27px] font-bold leading-[1.15] tracking-tight">{title}</h1>
        )}

        {/* Meta line — year, certificate, runtime */}
        <div className="mt-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px] font-medium text-foreground/60">
          {year && <span>{year}</span>}
          <span className="rounded border border-foreground/25 px-1.5 py-px text-[11px] uppercase tracking-wider">
            {contentRating}
          </span>
          {durationStr && <span>{durationStr}</span>}
          <span className="text-[11px] font-semibold uppercase tracking-wider text-foreground/45">HD</span>
        </div>

        {/* Season / episode pickers */}
        {mode === 'tv' && (
          <div className="mt-4 grid grid-cols-2 gap-2.5">
            <Select
              value={season.toString()}
              onValueChange={(val) => { onSeasonChange(Number(val)); onEpisodeChange(1) }}
            >
              <SelectTrigger className="h-12 w-full rounded-xl border-white/10 bg-white/[0.07] text-sm font-medium text-foreground">
                <SelectValue placeholder="Season" />
              </SelectTrigger>
              <SelectContent className="max-h-[50vh] rounded-xl border-border/60 bg-popover text-popover-foreground shadow-2xl custom-scrollbar">
                {seasonOptions(seasons).map(n => (
                  <SelectItem key={n} value={n.toString()} className="py-3 text-[15px]">
                    Season {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={episode.toString()} onValueChange={(val) => onEpisodeChange(Number(val))}>
              <SelectTrigger className="h-12 w-full rounded-xl border-white/10 bg-white/[0.07] text-sm font-medium text-foreground">
                <SelectValue placeholder="Episode" />
              </SelectTrigger>
              <SelectContent className="max-h-[50vh] rounded-xl border-border/60 bg-popover text-popover-foreground shadow-2xl custom-scrollbar">
                {Array.from({ length: episodeCount }, (_, i) => i + 1).map(n => (
                  <SelectItem key={n} value={n.toString()} className="py-3 text-[15px]">
                    Episode {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Primary CTA */}
        <button
          onClick={onPlay}
          className="mt-4 flex h-[52px] w-full items-center justify-center gap-2 rounded-lg bg-foreground text-[16px] font-bold text-background tap-scale"
        >
          <Play className="h-5 w-5 fill-current" />
          Play
        </button>

        {/* Server picker — secondary, but has to be reachable when one fails */}
        <Select value={server} onValueChange={onServerChange}>
          <SelectTrigger className="mt-2.5 h-12 w-full rounded-lg border-white/10 bg-white/[0.07] text-sm text-foreground/80">
            <div className="flex items-center gap-2">
              <Server className="h-3.5 w-3.5 shrink-0 text-foreground/40" />
              <SelectValue placeholder="Server" />
            </div>
          </SelectTrigger>
          <SelectContent className="max-h-[50vh] rounded-xl border-border/60 bg-popover text-popover-foreground shadow-2xl custom-scrollbar">
            {serverOptions(mode).map(({ id, name }) => (
              <SelectItem key={id} value={id} className="py-3 text-[15px]">{name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Save / share */}
        <div className="mt-6 flex items-center gap-9 px-1">
          <button
            onClick={onToggleFavorite}
            aria-pressed={favorited}
            className="flex flex-col items-center gap-1.5 text-[11px] font-medium text-foreground/60 tap-scale"
          >
            <Heart className={cn('h-6 w-6', favorited && 'fill-primary text-primary')} />
            My List
          </button>
          <button
            onClick={onShare}
            className="flex flex-col items-center gap-1.5 text-[11px] font-medium text-foreground/60 tap-scale"
          >
            {isCopied ? <Check className="h-6 w-6 text-emerald-teal" /> : <Share2 className="h-6 w-6" />}
            Share
          </button>
        </div>

        {/* Synopsis */}
        <p
          className={cn(
            'mt-6 text-[15px] leading-relaxed text-foreground/75',
            !isOverviewExpanded && 'line-clamp-4'
          )}
        >
          {description}
        </p>
        {description.length > OVERVIEW_CLAMP_THRESHOLD && (
          <button
            onClick={() => setIsOverviewExpanded(v => !v)}
            className="mt-1.5 text-[13px] font-semibold text-foreground/50"
          >
            {isOverviewExpanded ? 'Show less' : 'More'}
          </button>
        )}

        {genres.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {genres.slice(0, 4).map(genre => (
              <span
                key={genre}
                className="rounded-full border border-white/10 bg-white/[0.07] px-3 py-1 text-[12px] text-foreground/75"
              >
                {genre}
              </span>
            ))}
          </div>
        )}

        {cast.length > 0 && (
          <div className="mt-7">
            <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-foreground/40">Cast</h3>
            {/* Negative margin lets the row bleed to the screen edge */}
            <div className="edge-row -mx-5 gap-4 px-5">
              {cast.map(actor => (
                <div key={actor.name} className="w-[68px] shrink-0">
                  <img
                    src={actor.image}
                    alt={actor.name}
                    loading="lazy"
                    decoding="async"
                    className="h-[68px] w-[68px] rounded-full border border-white/10 object-cover"
                  />
                  <p className="mt-1.5 text-center text-[11px] leading-tight text-foreground/70 line-clamp-2">
                    {actor.name}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {mode === 'movie' && director !== 'Unknown' && (
          <p className="mt-6 text-[13px] text-foreground/60">
            <span className="text-foreground/40">Director: </span>
            {director}
          </p>
        )}
      </div>
    </div>
  )
}
