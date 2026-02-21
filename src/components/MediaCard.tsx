import { useState, useRef } from 'react'
import { Play, Star, Heart } from 'lucide-react'
import { Media } from '@/lib/config'
import { getImageUrl } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useFavorites } from '@/context/FavoritesContext'
import { useAuth0 } from '@auth0/auth0-react'
import { HoverVideoPlayer } from './HoverVideoPlayer'
import { QuickViewModal } from './QuickViewModal'

interface MediaCardProps {
  media: Media
  onClick: (media: Media) => void
  variant?: 'default' | 'hero'
}

export function MediaCard({
  media,
  onClick,
  variant = 'default',
}: MediaCardProps) {
  const title = media.title || media.name || 'Unknown'
  const rating = media.vote_average ? media.vote_average.toFixed(1) : 'N/A'

  const { isAuthenticated } = useAuth0()
  const { toggleFavorite, isFavorited } = useFavorites()
  const [isExpanded, setIsExpanded] = useState(false)
  const [showQuickView, setShowQuickView] = useState(false)
  const hoverTimeout = useRef<NodeJS.Timeout | null>(null)
  const quickViewTimeout = useRef<NodeJS.Timeout | null>(null)

  /**
   * TMDB media type detection
   */
  const mediaType: 'movie' | 'tv' = media.release_date ? 'movie' : 'tv'
  const favorited = isFavorited(media.id, mediaType)

  const handleFavorite = (e: React.MouseEvent) => {
    e.stopPropagation()
    toggleFavorite(media.id, mediaType)
  }

  /* ================= HOVER LOGIC ================= */

  const handleMouseEnter = () => {
    if (variant === 'hero') return
    if (window.innerWidth < 768) return

    // Stage 1: Card Expansion (1.5s)
    hoverTimeout.current = setTimeout(() => {
      setShowQuickView(true)
    }, 1500)

    // Stage 2: Quick View Modal - Removed (Consolidated to single 3.5s trigger)
    // quickViewTimeout.current = setTimeout(() => {
    //   setShowQuickView(true)
    //   setIsExpanded(false)
    // }, 5000)
  }

  const handleMouseLeave = () => {
    if (hoverTimeout.current) clearTimeout(hoverTimeout.current)
    if (quickViewTimeout.current) clearTimeout(quickViewTimeout.current)
    setIsExpanded(false)
    setShowQuickView(false) // Clean up quick view modal
  }

  const handleQuickViewPlay = (media: Media, provider?: string) => {
    if (provider) {
      localStorage.setItem('stream_provider', provider)
    }
    onClick(media)
    setShowQuickView(false)
  }

  /* ================= RENDER ================= */

  // Hero Card Rendering (unchanged)
  if (variant === 'hero') {
     // ... keeping existing hero logic ...
     const backdrop = getImageUrl(
      media.backdrop_path || media.poster_path,
      'backdrop'
    )

    return (
      <div
        onClick={() => onClick(media)}
        className="relative h-full w-full cursor-pointer overflow-hidden active:scale-[0.99]"
      >
        <img
          src={backdrop}
          alt={title}
          className="absolute inset-0 h-full w-full object-cover"
        />

        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />

        <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-6 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          <div className="mt-4 flex items-center justify-center gap-3">
            <button
              onClick={(e) => {
                e.stopPropagation()
                onClick(media)
              }}
              className="group/btn flex items-center gap-2 rounded-xl bg-gradient-to-r from-primary via-blue-500 to-primary bg-[length:200%_100%] px-8 py-3 text-sm font-bold text-white shadow-lg shadow-primary/30 transition-all hover:shadow-2xl hover:shadow-primary/50 hover:scale-105 active:scale-95 hover:bg-[100%_0]"
            >
              <Play className="h-4 w-4 fill-current transition-transform group-hover/btn:scale-125" />
              Watch Now
            </button>

            {isAuthenticated && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  toggleFavorite(media.id, mediaType)
                }}
                className={cn(
                  'rounded-full bg-background/80 backdrop-blur-sm p-2.5 shadow-lg transition-all active:scale-95 hover:scale-110 hover:bg-background cursor-pointer'
                )}
              >
                <Heart
                  className={cn(
                    'h-5 w-5 transition-all',
                    favorited
                      ? 'fill-red-500 text-red-500'
                      : 'text-red-500'
                  )}
                />
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  const imageUrl = getImageUrl(media.poster_path, 'poster')

  return (
    <>
      <div
        onClick={(e) => {
          e.stopPropagation()
          onClick(media)
        }}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className={cn(
          'group relative cursor-pointer rounded-lg md:rounded-xl bg-card border border-border/50 transition-all duration-300 ease-in-out',
          showQuickView ? 'z-50' : 'hover:scale-[1.03] hover:shadow-elevated hover:shadow-primary/10 hover:border-primary/50 active:scale-[0.97] overflow-hidden'
        )}
      >
        <div className="relative aspect-[2/3] overflow-hidden rounded-lg md:rounded-xl">
          <img
            src={imageUrl}
            alt={title}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110 group-hover:brightness-110"
          />

          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent md:opacity-0 md:group-hover:opacity-100 transition-opacity duration-300" />

          {isAuthenticated && (
            <button
              onClick={handleFavorite}
              className={cn(
                'absolute right-2 top-2 z-10 rounded-full bg-background/90 backdrop-blur-sm shadow-lg transition-all active:scale-95',
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
          )}

          {/* Hover Video Player - Removed for 'Poster Only' requirement */}
          {/* <div className="hidden md:block absolute inset-0 z-20 pointer-events-none group-hover:pointer-events-auto">
            {showQuickView && <HoverVideoPlayer media={media} />}
          </div> */}

          <div className="absolute left-2 top-2 flex items-center gap-1 rounded-lg bg-background/90 backdrop-blur-sm px-2 py-1 text-xs font-medium shadow-lg">
            <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
            <span className="text-foreground">{rating}</span>
          </div>

          {/* Play button overlay */}
          <div className={cn(
            "absolute inset-0 hidden md:flex items-center justify-center transition-opacity duration-300",
             !showQuickView ? "opacity-0 group-hover:opacity-100" : "opacity-0"
          )}>
            <div className="rounded-full bg-primary/90 backdrop-blur-sm p-4 shadow-xl">
              <Play className="h-8 w-8 fill-white text-white" />
            </div>
          </div>
        </div>

        {/* Quick View Overlay */}
        {showQuickView && (
          <QuickViewModal
            media={media}
            onClose={() => setShowQuickView(false)}
            onPlay={handleQuickViewPlay}
          />
        )}
      </div>
    </>
  )
}

export function MediaCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl bg-card border border-border/50">
      <div className="aspect-[2/3] animate-shimmer" />
    </div>
  )
}
