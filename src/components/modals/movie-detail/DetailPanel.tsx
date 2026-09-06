import { motion } from 'framer-motion'
import { Play, Server, ThumbsUp, ThumbsDown, Calendar, Clock } from 'lucide-react'
import { CircularRating } from '@/components/media/CircularRating'
import { CONFIG } from '@/lib/config'
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

interface DetailPanelProps {
  display: MediaDisplay
  playback: PlaybackControls
  /**
   * The pre-play layer. It alone carries the selectors and the like/dislike
   * row; once playback starts the same panel renders below the player as
   * reference information only.
   */
  isPrePlay: boolean
  isLiked: boolean
  onToggleLike: () => void
  disliked: boolean
  onToggleDislike: () => void
}

/** Desktop details grid — title block and cast, side by side. */
export function DetailPanel({
  display,
  playback,
  isPrePlay,
  isLiked,
  onToggleLike,
  disliked,
  onToggleDislike,
}: DetailPanelProps) {
  const {
    title,
    subtitle,
    logoImage,
    rating,
    match,
    year,
    contentRating,
    durationStr,
    description,
    genres,
    cast,
    director,
  } = display
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

  return (
    <div className={cn("grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-20 items-end", !isPrePlay && "mt-12 mb-16 px-2")}>
      {/* Left — Details */}
      <div className="lg:col-span-7 space-y-6">
        {/* Title / Logo */}
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.7, ease: 'easeOut' }}
        >
          {logoImage ? (
            <img
              src={logoImage}
              alt={title}
              aria-hidden="true"
              className="max-h-[120px] md:max-h-[160px] lg:max-h-[180px] w-auto object-contain mb-6 drop-shadow-2xl"
              draggable="false"
              role="presentation"
            />
          ) : (
            <h1 className="text-4xl md:text-6xl lg:text-7xl font-display leading-tight tracking-tight mb-4">
              {title}
            </h1>
          )}
          {subtitle && (
            <p className="text-lg md:text-xl lg:text-2xl text-primary font-light tracking-wide italic font-display">
              {subtitle}
            </p>
          )}
        </motion.div>

        {/* Metadata & Rating */}
        <motion.div
          initial={{ y: 15, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.3, duration: 0.7 }}
          className="flex flex-wrap items-center gap-6"
        >
          <div className="flex items-center gap-4">
            <CircularRating rating={rating} />
            <div className="flex flex-col">
              <span className="text-xs uppercase tracking-widest text-white/50 font-semibold">Score</span>
              <span className="text-sm md:text-base font-medium text-white/90">{match} Match</span>
            </div>
          </div>
          <div className="h-8 w-px bg-white/20 hidden sm:block" />
          <div className="flex flex-wrap items-center gap-5 text-sm md:text-base font-medium text-white/70 tracking-wide">
            {year && (
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                <span>{year}</span>
              </div>
            )}
            {durationStr && (
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4" />
                <span>{durationStr}</span>
              </div>
            )}
            <div className="px-2.5 py-1 border border-white/20 rounded text-xs tracking-widest uppercase bg-white/5">
              {contentRating}
            </div>
          </div>
        </motion.div>

        {/* Genres */}
        <motion.div
          initial={{ y: 15, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.35, duration: 0.7 }}
          className="flex flex-wrap gap-3"
        >
          {genres.slice(0, 4).map(genre => (
            <span key={genre} className="px-4 py-1.5 rounded-full bg-white/10 backdrop-blur-md text-sm border border-white/10 text-white/80">
              {genre}
            </span>
          ))}
        </motion.div>

        {/* Description */}
        <motion.p
          initial={{ y: 15, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.4, duration: 0.7 }}
          className="text-base md:text-lg lg:text-xl text-white/60 leading-relaxed max-w-2xl font-light line-clamp-4 lg:line-clamp-none"
        >
          {description}
        </motion.p>

        {/* Pre-Play Selectors + Actions (Only in Layer 1) */}
        {isPrePlay && (
          <motion.div
            initial={{ y: 15, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.45, duration: 0.7 }}
            className="space-y-4 pt-2"
          >
            {mode === 'tv' && (
              <div className="flex flex-wrap gap-3">
                <div className="w-40 z-[60]">
                  <Select value={season.toString()} onValueChange={(val) => { onSeasonChange(Number(val)); onEpisodeChange(1) }}>
                    <SelectTrigger className="w-full bg-white/5 border-white/10 text-white h-11 backdrop-blur-md rounded-xl hover:bg-white/10 transition-colors text-sm font-medium">
                      <SelectValue placeholder="Season" />
                    </SelectTrigger>
                    <SelectContent className="max-h-[300px] border-border/60 bg-popover text-popover-foreground rounded-xl shadow-2xl custom-scrollbar">
                      {seasonOptions(seasons).map(n => (
                        <SelectItem key={n} value={n.toString()} className="cursor-pointer focus:bg-white/10 py-2.5">Season {n}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="w-40 z-[60]">
                  <Select value={episode.toString()} onValueChange={(val) => onEpisodeChange(Number(val))}>
                    <SelectTrigger className="w-full bg-white/5 border-white/10 text-white h-11 backdrop-blur-md rounded-xl hover:bg-white/10 transition-colors text-sm font-medium">
                      <SelectValue placeholder="Episode" />
                    </SelectTrigger>
                    <SelectContent className="max-h-[300px] border-border/60 bg-popover text-popover-foreground rounded-xl shadow-2xl custom-scrollbar">
                      {Array.from({ length: episodeCount }, (_, i) => <SelectItem key={i + 1} value={(i + 1).toString()} className="cursor-pointer focus:bg-white/10 py-2.5">Episode {i + 1}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {/* Actions row — clean, minimalistic */}
            <div className="flex items-center gap-3">
              {/* Play Now — primary CTA */}
              <button
                onClick={onPlay}
                className="flex min-h-11 items-center gap-2.5 bg-white text-black px-8 py-3 rounded-full font-semibold text-base hover:bg-white/90 transition-[background-color,transform,box-shadow] hover:scale-105 active:scale-95 shadow-[0_0_25px_rgba(255,255,255,0.2)]"
              >
                <Play className="w-5 h-5 fill-current" />
                Play Now
              </button>

              {/* Server selector — ghost style */}
              <div className="w-48 z-[60]">
                <Select value={server} onValueChange={onServerChange}>
                  <SelectTrigger className="w-full bg-white/[0.06] border-white/[0.08] text-white/80 h-11 backdrop-blur-md rounded-full hover:bg-white/10 transition-colors text-sm">
                    <div className="flex items-center gap-1.5">
                      <Server className="w-3.5 h-3.5 text-white/40 shrink-0" />
                      <SelectValue placeholder="Server" />
                    </div>
                  </SelectTrigger>
                  <SelectContent className="border-border/60 bg-popover text-popover-foreground rounded-xl shadow-2xl custom-scrollbar">
                    {Object.entries(CONFIG.PROVIDER_NAMES).map(([key, name]) => (
                      <SelectItem key={key} value={key} className="cursor-pointer focus:bg-white/10 py-2.5 text-sm">{name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Divider */}
              <div className="w-px h-8 bg-white/10" />

              {/* Like / Dislike — icon-only ghost buttons */}
              <button
                onClick={onToggleLike}
                aria-label={isLiked ? 'Remove like' : 'Like this title'}
                aria-pressed={isLiked}
                className={cn(
                  'p-2.5 rounded-full border transition-all',
                  isLiked
                    ? 'border-primary/60 bg-primary/10 text-primary'
                    : 'border-white/10 text-white/50 hover:text-white hover:border-white/30'
                )}
              >
                <ThumbsUp className={cn('w-4 h-4', isLiked && 'fill-current')} />
              </button>
              <button
                onClick={onToggleDislike}
                aria-label={disliked ? 'Remove dislike' : 'Dislike this title'}
                aria-pressed={disliked}
                className={cn(
                  'p-2.5 rounded-full border transition-all',
                  disliked
                    ? 'border-red-500/60 bg-red-500/10 text-red-400'
                    : 'border-white/10 text-white/50 hover:text-white hover:border-white/30'
                )}
              >
                <ThumbsDown className={cn('w-4 h-4', disliked && 'fill-current')} />
              </button>
            </div>
          </motion.div>
        )}
      </div>

      {/* Right — Cast & Crew */}
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.6, duration: 0.7 }}
        className="lg:col-span-5 space-y-8 pb-4"
      >
        {mode === 'movie' && (
          <div className="border-l-2 border-primary/50 pl-5">
            <h3 className="text-xs uppercase tracking-[0.2em] text-white/40 mb-2 font-semibold">Director</h3>
            <p className="text-xl font-medium tracking-wide">{director}</p>
          </div>
        )}
        {cast.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-xs uppercase tracking-[0.2em] text-white/40 font-semibold">Top Cast</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {cast.map((actor, idx) => (
                <motion.div
                  key={actor.name}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.7 + idx * 0.08 }}
                  className="flex items-center gap-4 group cursor-pointer p-2 rounded-xl hover:bg-white/5 transition-colors"
                >
                  <div className="relative overflow-hidden rounded-full w-14 h-14 shrink-0">
                    <img src={actor.image} alt={actor.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                    <div className="absolute inset-0 border border-white/10 rounded-full group-hover:border-primary/50 transition-colors" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-base font-medium text-white/85 group-hover:text-white transition-colors truncate">{actor.name}</p>
                    <p className="text-sm text-white/40 truncate">{actor.role}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        )}
      </motion.div>
    </div>
  )
}
