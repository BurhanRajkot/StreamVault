import { useState, useRef, memo } from 'react'
import { Play, Star, Heart, ThumbsDown, Info } from 'lucide-react'
import { Media } from '@/lib/config'
import { getImageUrl, getImageSrcSet, logRecommendationInteraction } from '@/lib/api'
import { cn } from '@/lib/utils'
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
  const rating = media.vote_average ? media.vote_average.toFixed(1) : 'N/A'

  const { isAuthenticated, getAccessTokenSilently } = useAuth0()
  const { toggleFavorite, isFavorited } = useFavorites()
  const { toggleDislike, isDisliked } = useDislikes()
  const isMobile = useIsMobile()

  const [showQuickView, setShowQuickView] = useState(false)
  const hoverTimeout = useRef<NodeJS.Timeout | null>(null)
  const quickViewTimeout = useRef<NodeJS.Timeout | null>(null)
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
    const genreIds = media.genres?.map((g: any) => g.id).filter(Boolean) as number[] | undefined
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
    if (quickViewTimeout.current) clearTimeout(quickViewTimeout.current)
    setShowQuickView(false)
  }

  const handleQuickViewPlay = (media: Media, provider?: string) => {
    if (provider) {
      localStorage.setItem('stream_provider', provider)
    }

    const genreIds = media.genres?.map((g: any) => g.id).filter(Boolean) as number[] | undefined

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

    return (
      <div
        onClick={() => onClick(media)}
        onKeyDown={handleCardKeyDown}
        role="button"
        tabIndex={0}
        aria-label={`Open ${title}`}
        className="relative h-full w-full cursor-pointer overflow-hidden active:scale-[0.99] group/hero"
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

        <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-6 lg:p-8 hidden md:flex flex-col justify-end h-full">
          <div className="space-y-2 sm:space-y-3 mb-2 transform transition-all duration-300 translate-y-2 opacity-0 group-hover/hero:translate-y-0 group-hover/hero:opacity-100 sm:translate-y-0 sm:opacity-100">
            {/* Title */}
            <h2 className="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-bold text-white drop-shadow-md leading-tight line-clamp-2">
              {title}
            </h2>

            {/* Metadata Badges Row */}
            <div className="flex items-center gap-2.5 text-xs sm:text-sm font-medium text-zinc-200">
              <div className="flex items-center gap-1">
                <Star className="h-3.5 w-3.5 sm:h-4 sm:w-4 fill-yellow-400 text-yellow-400" />
                <span>{rating}</span>
              </div>

              {releaseYear && (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-zinc-400" />
                  <span>{releaseYear}</span>
                </>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-3 pt-1">
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onClick(media, undefined, undefined, undefined, true)
                }}
                className="flex min-h-11 items-center justify-center gap-2 rounded bg-primary px-5 py-2 text-xs sm:text-sm font-bold text-white hover:bg-primary/90 transition-colors"
              >
                <Play className="h-3.5 w-3.5 sm:h-4 sm:w-4 fill-current" />
                Play
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const imageUrl = getImageUrl(media.poster_path, 'poster')

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
        aria-label={`Open ${title}`}
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
                  'rounded-full bg-background/90 backdrop-blur-sm shadow-lg transition-all active:scale-95',
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
                  'rounded-full bg-background/90 backdrop-blur-sm shadow-lg transition-all active:scale-95',
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

          {/* Hover Video Player - Removed for 'Poster Only' requirement */}
          {/* <div className="hidden md:block absolute inset-0 z-20 pointer-events-none group-hover:pointer-events-auto">
            {showQuickView && <HoverVideoPlayer media={media} />}
          </div> */}

          {/* Score badge — desktop only, see note on the favourite controls */}
          <div className="absolute left-2 top-2 hidden items-center gap-1 rounded-lg bg-background/90 backdrop-blur-sm px-2 py-1 text-xs font-medium shadow-lg z-10 md:flex">
            <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
            <span className="text-foreground">{rating}</span>
          </div>
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
