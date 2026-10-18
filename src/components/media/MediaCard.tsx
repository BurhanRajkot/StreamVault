import { useState, useRef, memo } from 'react'
import { Play, Star, Heart, ThumbsDown, Info, Film } from 'lucide-react'
import { Media } from '@/lib/config'
import { getImageUrl, getImageSrcSet, logRecommendationInteraction } from '@/lib/api'
import { cn, genreIdsOf } from '@/lib/utils'
import { useFavorites } from '@/context/FavoritesContext'
import { useDislikes } from '@/context/DislikesContext'
import { useAuth0 } from '@auth0/auth0-react'
import { useIsMobile } from '@/mobile-ui/use-mobile'

import { QuickViewModal } from '@/components/modals/QuickViewModal'

interface MediaCardProps {
  media: Media
  onClick: (media: Media, season?: number, episode?: number, server?: string, autoPlay?: boolean) => void
  variant?: 'default' | 'hero'
  priority?: boolean
}

function MediaCardComponent({
  media,
  onClick,
  variant = 'default',
  priority = false,
}: MediaCardProps) {
  const title = media.title || media.name || 'Unknown'
  /** One decimal, or null for a title with no score yet. */
  const rating = media.vote_average ? media.vote_average.toFixed(1) : null

  const { isAuthenticated, getAccessTokenSilently } = useAuth0()
  const { toggleFavorite, isFavorited } = useFavorites()
  const { toggleDislike, isDisliked } = useDislikes()
  const isMobile = useIsMobile()

  const [showQuickView, setShowQuickView] = useState(false)
  const hoverTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)

  /**
   * TMDB media type detection — use explicit media_type first,
   * then fall back to date-based heuristic (movies have release_date, TV has first_air_date).
   */
  const mediaType: 'movie' | 'tv' =
    (media.media_type === 'movie' || media.media_type === 'tv')
      ? media.media_type
      : media.release_date && !media.first_air_date ? 'movie' : 'tv'

  const favorited = isFavorited(media.id, mediaType)
  const disliked = isDisliked(media.id, mediaType)

  const handleFavorite = (e: React.MouseEvent) => {
    e.stopPropagation()
    const genreIds = genreIdsOf(media)
    toggleFavorite(media.id, mediaType, genreIds)
  }

  const handleDislike = (e: React.MouseEvent) => {
    e.stopPropagation()
    toggleDislike(media.id, mediaType)
  }

  const handleCardKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onClick(media)
    }
  }

  /* ================= HOVER LOGIC ================= */

  const handleMouseEnter = () => {
    // No hover interactions on mobile/touch — saves compositing cost
    if (variant === 'hero' || isMobile) return

    hoverTimeout.current = setTimeout(() => {
      setShowQuickView(true)
    }, 2000)
  }

  const handleMouseLeave = () => {
    if (isMobile) return
    if (hoverTimeout.current) clearTimeout(hoverTimeout.current)
    setShowQuickView(false)
  }

  const handleQuickViewPlay = (media: Media, provider?: string) => {
    if (provider) {
      localStorage.setItem('stream_provider', provider)
    }

    const genreIds = genreIdsOf(media)

    if (isAuthenticated) {
      getAccessTokenSilently().then(token => {
        logRecommendationInteraction(token, {
          tmdbId: media.id,
          mediaType: mediaType,
          eventType: 'click',
          selectedServer: provider,
          genreIds,
        }).catch(console.error)
      }).catch(console.error)
    } else {
      logRecommendationInteraction(null, {
        tmdbId: media.id,
        mediaType: mediaType,
        eventType: 'click',
        selectedServer: provider,
        genreIds,
      }).catch(console.error)
    }

    onClick(media)
    setShowQuickView(false)
  }

  /* ================= RENDER ================= */

  // Hero Card Rendering
  if (variant === 'hero') {
     const backdrop = getImageUrl(
      media.backdrop_path || media.poster_path,
      'hero'
    )
    // Phones are portrait: a 16:9 backdrop cropped to a tall hero loses the
    // subject entirely, so mobile gets the poster art instead.
    const mobileArtPath = media.poster_path || media.backdrop_path
    const releaseYear = media.release_date
      ? new Date(media.release_date).getFullYear()
      : media.first_air_date
      ? new Date(media.first_air_date).getFullYear()
      : ''

    // Clicking the art opens the title; keyboard and screen-reader users get
    // the Play / More info buttons below (a role="button" wrapper around them
    // nested interactive controls).
    return (
      <div
        onClick={() => onClick(media)}
        className="group/hero relative h-full w-full cursor-pointer overflow-hidden active:scale-[0.99]"
      >
        <picture>
          {/* Mobile override; the <img> keeps the wide backdrop as its own
              src/srcSet so anything reading the element directly still sees it */}
          <source
            media="(max-width: 767px)"
            srcSet={getImageSrcSet(mobileArtPath, 'poster')}
            sizes="100vw"
          />
          <img
            src={backdrop}
            alt={title}
            width={780}
            height={439}
            srcSet={getImageSrcSet(media.backdrop_path || media.poster_path, 'backdrop')}
            sizes="(max-width: 640px) 100vw, (max-width: 1280px) 80vw, 1280px"
            loading="eager"
            fetchPriority="high"
            decoding="async"
            className="absolute inset-0 h-full w-full object-cover object-top transition-transform duration-[10s] md:object-center md:group-hover/hero:scale-110"
            style={{ willChange: 'transform', transform: 'translateZ(0)' }}
          />
        </picture>

        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent transition-opacity duration-300 pointer-events-none" />
        <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/20 to-transparent transition-opacity duration-300 pointer-events-none" />

        {/* ── Mobile hero content — always visible, thumb-reachable ── */}
        <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 px-5 pb-7 md:hidden">
          {/* Extra scrim so the title stays legible over bright poster art */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 top-[-30%] bg-gradient-to-t from-background via-background/85 to-transparent" />

          <h2 className="relative text-center text-[26px] font-bold leading-[1.15] text-foreground line-clamp-2 drop-shadow-lg">
            {title}
          </h2>

          <div className="relative flex items-center gap-2 text-[13px] font-medium text-muted-foreground">
            {releaseYear && <span>{releaseYear}</span>}
            {releaseYear && <span className="h-1 w-1 rounded-full bg-muted-foreground/60" />}
            <span>{mediaType === 'tv' ? 'Series' : 'Movie'}</span>
          </div>

          <div className="relative flex w-full items-center gap-2.5 pt-1">
            <button
              onClick={(e) => {
                e.stopPropagation()
                onClick(media, undefined, undefined, undefined, true)
              }}
              className="flex h-12 flex-1 items-center justify-center gap-2 rounded-lg bg-foreground text-[15px] font-bold text-background tap-scale"
            >
              <Play className="h-[18px] w-[18px] fill-current" />
              Play
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation()
                onClick(media)
              }}
              className="flex h-12 flex-1 items-center justify-center gap-2 rounded-lg bg-secondary/80 text-[15px] font-semibold text-foreground tap-scale"
            >
              <Info className="h-[18px] w-[18px]" />
              Info
            </button>
          </div>
        </div>

        {/* ── Desktop hero content — clear of the carousel's arrows ── */}
        <div className="absolute inset-0 hidden flex-col justify-end pb-12 pl-20 pr-20 md:flex lg:pb-14 lg:pl-24">
          <div className="max-w-xl space-y-3 lg:max-w-2xl">
            <h2 className="font-display text-3xl font-bold leading-[1.05] tracking-tight text-white drop-shadow-md line-clamp-2 lg:text-5xl">
              {title}
            </h2>

            <div className="flex items-center gap-2.5 text-sm font-medium text-white/80">
              {rating && (
                <>
                  <span className="flex items-center gap-1">
                    <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                    {rating}
                  </span>
                  <span className="h-1 w-1 rounded-full bg-white/50" />
                </>
              )}
              {releaseYear && (
                <>
                  <span>{releaseYear}</span>
                  <span className="h-1 w-1 rounded-full bg-white/50" />
                </>
              )}
              <span>{mediaType === 'tv' ? 'Series' : 'Movie'}</span>
            </div>

            {media.overview && (
              <p className="line-clamp-2 max-w-lg text-[15px] leading-relaxed text-white/75 lg:line-clamp-3">{media.overview}</p>
            )}

            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onClick(media, undefined, undefined, undefined, true)
                }}
                className="flex h-11 items-center justify-center gap-2 rounded-lg bg-white px-6 text-[15px] font-semibold text-black transition-colors hover:bg-white/85"
              >
                <Play className="h-4 w-4 fill-current" />
                Play
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onClick(media)
                }}
                className="flex h-11 items-center justify-center gap-2 rounded-lg bg-white/20 px-5 text-[15px] font-semibold text-white transition-colors hover:bg-white/30"
              >
                <Info className="h-4 w-4" />
                More info
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const imageUrl = getImageUrl(media.poster_path, 'poster')
  const cardYear = (media.release_date || media.first_air_date || '').slice(0, 4)

  return (
    <>
      <div
        ref={cardRef}
        onClick={(e) => {
          e.stopPropagation()
          onClick(media)
        }}
        onKeyDown={handleCardKeyDown}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        role="button"
        tabIndex={0}
        // The score badge is visible text, so it has to be part of the name
        aria-label={rating ? `Open ${title}, rated ${rating}` : `Open ${title}`}
        data-testid="media-card"
        className={cn(
          'group relative cursor-pointer rounded-lg md:rounded-xl bg-card transition-all duration-300 ease-in-out',
          // The 1px card border reads as grid noise at phone poster sizes
          'md:border md:border-border/50',
          showQuickView ? 'z-50' : 'md:hover:scale-[1.03] md:hover:shadow-elevated md:hover:shadow-primary/10 md:hover:border-primary/50 active:scale-[0.97] overflow-hidden',
          disliked && 'grayscale contrast-125 opacity-70 hover:opacity-100'
        )}
        style={{ contain: 'layout' }}
      >
        <div className="relative aspect-[2/3] overflow-hidden rounded-lg md:rounded-xl">
          {media.poster_path ? (
            <img
              src={imageUrl}
              alt={title}
              width={500}
              height={750}
              srcSet={getImageSrcSet(media.poster_path, 'poster')}
              sizes="(max-width: 640px) 33vw, (max-width: 768px) 25vw, (max-width: 1024px) 20vw, 175px"
              loading={priority ? 'eager' : 'lazy'}
              fetchPriority={priority ? 'high' : 'low'}
              decoding="async"
              className={cn(
                'h-full w-full object-cover transition-transform duration-700',
                // Skip scale animation on mobile — removes compositor layer cost
                !isMobile && 'sm:group-hover:scale-110 sm:group-hover:brightness-110'
              )}
            />
          ) : (
            // No poster: the title on a dark tile, not a blank grey box
            <div className="flex h-full w-full flex-col justify-end bg-gradient-to-b from-secondary to-card p-3">
              <Film className="mb-auto h-6 w-6 text-muted-foreground/40" aria-hidden="true" />
              <p className="line-clamp-3 text-sm font-semibold leading-snug text-foreground/90">{title}</p>
              {cardYear && <p className="mt-0.5 text-xs text-muted-foreground">{cardYear}</p>}
            </div>
          )}

          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent md:opacity-0 md:group-hover:opacity-100 transition-opacity duration-300" />

          {/* Play Overlay (hover + touch) */}
          {!disliked && (
            <div
              className="absolute inset-0 z-10 flex flex-col items-center justify-center opacity-0 md:group-hover:opacity-100 transition-all duration-300 pointer-events-none"
            >
              <div className="rounded-full bg-white/90 p-3 shadow-lg shadow-black/30 transform scale-75 md:group-hover:scale-100 transition-all duration-300 pointer-events-auto hover:bg-white hover:scale-110">
                <Play className="h-6 w-6 text-black fill-black ml-0.5" />
              </div>
            </div>
          )}

          {/* Favourite / dislike controls are desktop-only: on a phone they sat
              permanently on top of the artwork (no hover to hide behind) and
              turned every row into a wall of buttons. Both actions live in the
              title's detail view instead. */}
          {isAuthenticated && (
            <div className="absolute right-2 top-2 z-10 hidden flex-col gap-2 md:flex">
              <button
                onClick={handleFavorite}
                aria-label={favorited ? 'Remove from favorites' : 'Add to favorites'}
                className={cn(
                  'rounded-full bg-background/90 shadow-lg transition-all active:scale-95',
                  'p-3 md:p-2',
                  'md:opacity-0 md:group-hover:opacity-100 hover:scale-110 hover:bg-background cursor-pointer'
                )}
              >
                <Heart
                  className={cn(
                    'transition-all',
                    'h-5 w-5 md:h-4 md:w-4',
                    favorited ? 'fill-red-500 text-red-500' : 'text-red-500'
                  )}
                />
              </button>
              <button
                onClick={handleDislike}
                aria-label={disliked ? 'Remove dislike' : 'Dislike this title'}
                className={cn(
                  'rounded-full bg-background/90 shadow-lg transition-all active:scale-95',
                  'p-3 md:p-2',
                  'md:opacity-0 md:group-hover:opacity-100 hover:scale-110 hover:bg-background cursor-pointer'
                )}
              >
                <ThumbsDown
                  className={cn(
                    'transition-all',
                    'h-5 w-5 md:h-4 md:w-4',
                    disliked
                      ? 'fill-white text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.8)] scale-110'
                      : 'text-zinc-400 hover:text-white'
                  )}
                />
              </button>
            </div>
          )}

          {/* Score badge — desktop only, see note on the favourite controls;
              none at all for a title nobody has rated yet (it said "N/A") */}
          {rating && (
            <div className="absolute left-2 top-2 z-10 hidden items-center gap-1 rounded-lg bg-background/90 px-2 py-1 text-xs font-medium shadow-lg md:flex">
              <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
              <span className="text-foreground">{rating}</span>
            </div>
          )}
        </div>

        {/* Quick View Overlay — desktop only */}
        {!isMobile && showQuickView && (
          <QuickViewModal
            media={media}
            onClose={() => setShowQuickView(false)}
            onPlay={handleQuickViewPlay}
            triggerRef={cardRef}
          />
        )}
      </div>
    </>
  )
}

// Custom equality check: only re-render if the media item identity or click handler changed
function mediaCardPropsAreEqual(
  prev: MediaCardProps,
  next: MediaCardProps
) {
  return prev.media.id === next.media.id &&
    prev.onClick === next.onClick &&
    prev.variant === next.variant &&
    prev.priority === next.priority
}

// Memoized export — prevents re-renders when parent state changes (e.g. scroll, search query)
export const MediaCard = memo(MediaCardComponent, mediaCardPropsAreEqual)

export const MediaCardSkeleton = memo(function MediaCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl bg-card border border-border/50">
      <div className="aspect-[2/3] animate-shimmer" />
    </div>
  )
})
