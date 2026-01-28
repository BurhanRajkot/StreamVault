import { Play, Star, Heart } from 'lucide-react'
import { Media } from '@/lib/config'
import { getImageUrl } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useFavorites } from '@/context/FavoritesContext'
import { useAuth0 } from '@auth0/auth0-react'

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

  /**
   * TMDB media type detection
   */
  const mediaType: 'movie' | 'tv' = media.release_date ? 'movie' : 'tv'
  const favorited = isFavorited(media.id, mediaType)

  const handleFavorite = (e: React.MouseEvent) => {
    e.stopPropagation()
    toggleFavorite(media.id, mediaType)
  }

  /* ================= HERO CARD ================= */

  if (variant === 'hero') {
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

        <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-6">
          <div className="mb-2 flex items-center gap-2">
            <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
            <span className="text-sm font-medium text-white">{rating}</span>
          </div>

          <h2 className="mb-2 line-clamp-2 max-w-2xl text-xl font-bold text-white sm:text-2xl">
            {title}
          </h2>

          <p className="line-clamp-2 max-w-2xl text-sm text-white/80">
            {media.overview || 'No description available.'}
          </p>

              <div className="mt-4 flex items-center gap-3">
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onClick(media)
                  }}
                  className="flex items-center gap-2 rounded-xl bg-gradient-primary px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-primary/25 transition-all hover:shadow-xl hover:shadow-primary/40 hover:scale-105 active:scale-95"
                >
                  <Play className="h-4 w-4 fill-current" />
                  Watch
                </button>

                {isAuthenticated && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      toggleFavorite(media.id, mediaType)
                    }}
                    className="rounded-full bg-background/80 backdrop-blur-sm p-2.5 shadow-lg transition-all hover:scale-110 hover:bg-background active:scale-95"
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

    /* ================= GRID CARD ================= */

    const imageUrl = getImageUrl(media.poster_path, 'poster')

      return (
        <div
          onClick={(e) => {
            e.stopPropagation()
            onClick(media)
          }}
          className={cn(
            'group relative cursor-pointer overflow-hidden rounded-xl bg-card transition-all duration-300 border border-border/50',
            'hover:scale-[1.03] hover:shadow-elevated hover:shadow-primary/10 hover:border-primary/50',
            'active:scale-[0.97]'
          )}
        >
        <div className="relative aspect-[2/3] overflow-hidden">
          <img
            src={imageUrl}
            alt={title}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110 group-hover:brightness-110"
          />

          {/* Gradient overlay on hover */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

              {isAuthenticated && (
                <button
                  onClick={handleFavorite}
                  className="absolute right-2 top-2 z-10 rounded-full bg-background/90 backdrop-blur-sm p-2 shadow-lg transition-all hover:scale-110 hover:bg-background active:scale-95 opacity-0 group-hover:opacity-100"
                >
                  <Heart
                    className={cn(
                      'h-4 w-4 transition-all',
                      favorited ? 'fill-red-500 text-red-500' : 'text-red-500'
                    )}
                  />
                </button>
              )}

          <div className="absolute left-2 top-2 flex items-center gap-1 rounded-lg bg-background/90 backdrop-blur-sm px-2 py-1 text-xs font-medium shadow-lg">
            <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
            <span className="text-foreground">{rating}</span>
          </div>

          {/* Play button overlay on hover */}
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
            <div className="rounded-full bg-primary/90 backdrop-blur-sm p-4 shadow-xl">
              <Play className="h-8 w-8 fill-white text-white" />
            </div>
          </div>
        </div>

        <div className="p-3 bg-gradient-to-b from-card to-card/80">
          <h3 className="line-clamp-1 text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
            {title}
          </h3>
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
            {media.overview || 'No description available.'}
          </p>
        </div>
      </div>
    )
}

export function MediaCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl bg-card border border-border/50">
      <div className="aspect-[2/3] animate-shimmer" />
      <div className="space-y-2 p-3">
        <div className="h-4 w-3/4 animate-shimmer rounded" />
        <div className="h-3 w-full animate-shimmer rounded" />
        <div className="h-3 w-2/3 animate-shimmer rounded" />
      </div>
    </div>
  )
}
