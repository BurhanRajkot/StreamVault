import { useState, useRef, memo } from 'react'
import { Play, Heart, ThumbsDown, Film } from 'lucide-react'
import { CONFIG, Media } from '@/lib/config'
import { getImageUrl, getImageSrcSet, logRecommendationInteraction } from '@/lib/api'
import { cn, genreIdsOf, shouldHandleCardClick, watchPath } from '@/lib/utils'
import { useFavorites } from '@/context/FavoritesContext'
import { useDislikes } from '@/context/DislikesContext'
import { useAuth0 } from '@auth0/auth0-react'
import { useIsMobile } from '@/hooks/useIsMobile'

import { QuickViewModal } from '@/components/modals/QuickViewModal'

interface MediaCardProps {
  media: Media
  onClick: (media: Media, season?: number, episode?: number, server?: string, autoPlay?: boolean) => void
  priority?: boolean
}

function MediaCardComponent({
  media,
  onClick,
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
    if (isMobile) return

    // Hover intent: the pointer has to rest on the poster. A card that merely
    // passed under it while the page scrolled doesn't count.
    const startY = window.scrollY
    hoverTimeout.current = setTimeout(() => {
      if (Math.abs(window.scrollY - startY) < 4) setShowQuickView(true)
    }, CONFIG.QUICK_VIEW_HOVER_DELAY_MS)
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

  const imageUrl = getImageUrl(media.poster_path, 'poster')
  const cardYear = (media.release_date || media.first_air_date || '').slice(0, 4)

  return (
    <>
      <div
        ref={cardRef}
        onClick={(e) => {
          e.stopPropagation()
          if (shouldHandleCardClick(e)) onClick(media)
        }}
        onKeyDown={handleCardKeyDown}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        role="button"
        tabIndex={0}
        // The score is visible text, so it has to be part of the name
        aria-label={rating ? `Open ${title}, rated ${rating}` : `Open ${title}`}
        data-testid="media-card"
        className={cn(
          'group relative min-w-0 cursor-pointer rounded-lg outline-none',
          showQuickView && 'z-50',
          disliked && 'grayscale contrast-125 opacity-60 hover:opacity-100'
        )}
        style={{ contain: 'layout' }}
      >
        <div
          className={cn(
            'relative aspect-[2/3] overflow-hidden rounded-lg bg-card ring-1 ring-inset ring-foreground/[0.06] transition-[transform,box-shadow] duration-300 ease-out',
            'group-focus-visible:ring-2 group-focus-visible:ring-foreground',
            !showQuickView && 'md:group-hover:-translate-y-1 md:group-hover:shadow-[0_18px_40px_-14px_rgba(0,0,0,0.85)] active:scale-[0.97]'
          )}
        >
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
                'h-full w-full object-cover transition-[transform,filter] duration-500 ease-out',
                // Skip the zoom on mobile — removes compositor layer cost
                !isMobile && 'md:group-hover:scale-[1.04] md:group-hover:brightness-[0.8]'
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

          {/* A ring that lights up on hover, drawn over the art */}
          <div className="pointer-events-none absolute inset-0 rounded-lg ring-1 ring-inset ring-transparent transition-colors duration-300 md:group-hover:ring-white/25" />

          {/* Play (desktop hover) */}
          {!disliked && (
            <div className="pointer-events-none absolute inset-0 z-10 hidden items-center justify-center opacity-0 transition-opacity duration-300 md:flex md:group-hover:opacity-100">
              <div className="pointer-events-auto flex h-12 w-12 scale-90 items-center justify-center rounded-full bg-white/95 shadow-lg shadow-black/40 transition-transform duration-300 hover:scale-105 md:group-hover:scale-100">
                <Play className="ml-0.5 h-5 w-5 fill-black text-black" />
              </div>
            </div>
          )}

          {/* Favourite / dislike controls are desktop-only: on a phone they sat
              permanently on top of the artwork (no hover to hide behind) and
              turned every row into a wall of buttons. Both actions live in the
              title's detail view instead. */}
          {isAuthenticated && (
            <div className="absolute right-2 top-2 z-10 hidden flex-col gap-1.5 md:flex">
              <button
                onClick={handleFavorite}
                aria-label={favorited ? 'Remove from favorites' : 'Add to favorites'}
                className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-md transition-all hover:scale-110 hover:bg-black/80 active:scale-95 md:opacity-0 md:group-hover:opacity-100"
              >
                <Heart className={cn('h-4 w-4', favorited ? 'fill-primary text-primary' : 'text-white')} />
              </button>
              <button
                onClick={handleDislike}
                aria-label={disliked ? 'Remove dislike' : 'Dislike this title'}
                className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-md transition-all hover:scale-110 hover:bg-black/80 active:scale-95 md:opacity-0 md:group-hover:opacity-100"
              >
                <ThumbsDown className={cn('h-4 w-4', disliked ? 'fill-white text-white' : 'text-white/80')} />
              </button>
            </div>
          )}
        </div>

        {/* Just the title under the art — score and year are in the preview */}
        <div className="px-0.5 pt-2" aria-hidden="true">
          {/* A real link (out of the tab order — the card is the control) so
              crawlers can reach the title page from any list */}
          <a href={watchPath(mediaType, media.id, title)} tabIndex={-1} className="block truncate text-[13px] font-medium leading-tight text-foreground/75 transition-colors md:text-sm md:group-hover:text-foreground">
            {title}
          </a>
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
    prev.priority === next.priority
}

// Memoized export — prevents re-renders when parent state changes (e.g. scroll, search query)
export const MediaCard = memo(MediaCardComponent, mediaCardPropsAreEqual)

export const MediaCardSkeleton = memo(function MediaCardSkeleton() {
  return (
    <div>
      <div className="aspect-[2/3] overflow-hidden rounded-lg bg-card">
        <div className="h-full w-full animate-shimmer" />
      </div>
      <div className="mt-2 h-3 w-3/4 rounded bg-card" />
    </div>
  )
})
