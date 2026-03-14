import { useEffect, useState, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, Play, ThumbsUp, ThumbsDown } from 'lucide-react'
import { Media, CONFIG, MediaMode } from '@/lib/config'
import { getImageUrl, fetchMediaDetails, logRecommendationInteraction } from '@/lib/api'
import { cn } from '@/lib/utils'
import { HoverVideoPlayer } from './HoverVideoPlayer'
import { useAuth0 } from '@auth0/auth0-react'
import { useDislikes } from '@/context/DislikesContext'

interface QuickViewModalProps {
  media: Media
  onClose: () => void
  onPlay: (media: Media, providerVal?: string) => void
  triggerRef: React.RefObject<HTMLElement>
}

export function QuickViewModal({ media, onClose, onPlay, triggerRef }: QuickViewModalProps) {
  const [details, setDetails] = useState<Media | null>(null)
  const [provider, setProvider] = useState(() => {
    const isMobile = typeof window !== 'undefined' && window.innerWidth <= 850;
    return isMobile ? 'vidfast_pro' : 'vidlink_pro';
  })
  const [isVisible, setIsVisible] = useState(false)
  const [feedback, setFeedback] = useState<'rate' | 'dislike' | null>(null)
  const [modalStyle, setModalStyle] = useState<React.CSSProperties>({})

  const { isAuthenticated, getAccessTokenSilently } = useAuth0()
  const { isDisliked, toggleDislike } = useDislikes()

  const mode = (media.media_type === 'tv' || media.first_air_date ? 'tv' : 'movie') as 'movie' | 'tv'
  const disliked = isDisliked(media.id, mode)

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 20)

    fetchMediaDetails(mode, media.id)
      .then(setDetails)
      .catch((error) => {
        console.error('Failed to fetch media details:', error)
      })

    return () => clearTimeout(timer)
  }, [media.id, mode])

  useLayoutEffect(() => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect()

      const modalWidth = 420

      // Calculate top and left to center over the trigger
      // Taking into account current scroll position
      const scrollY = window.scrollY || window.pageYOffset
      const scrollX = window.scrollX || window.pageXOffset

      let left = scrollX + rect.left + (rect.width / 2) - (modalWidth / 2)
      const top = scrollY + rect.top - (modalWidth * 0.5) // Approximate height shift

      // Prevent clipping on left/right screen edges
      const margin = 20
      if (left < scrollX + margin) left = scrollX + margin
      if (left + modalWidth > scrollX + window.innerWidth - margin) {
        left = scrollX + window.innerWidth - modalWidth - margin
      }

      setModalStyle({
        position: 'absolute',
        top: `${top}px`,
        left: `${left}px`,
        width: `${modalWidth}px`,
        zIndex: 1000,
      })
    }
  }, [triggerRef])

  const handleFeedback = async (type: 'rate' | 'dislike') => {
    if (!isAuthenticated) return

    // Optimistic UI toggle
    setFeedback((prev) => (prev === type ? null : type))

    try {
      const token = await getAccessTokenSilently()
      logRecommendationInteraction(token, {
        tmdbId: media.id,
        mediaType: mode as 'movie' | 'tv',
        eventType: type,
        ...(type === 'rate' && { rating: 5 }) // 'rate' with 5 stars = Loved it
      })
    } catch (err) {
      console.error('Feedback failed', err)
    }
  }

  const providers = Object.entries(CONFIG.PROVIDER_NAMES)
  const backdrop = getImageUrl(media.backdrop_path || media.poster_path, 'backdrop')
  const title = media.title || media.name
  const year = media.release_date?.split('-')[0] || media.first_air_date?.split('-')[0]
  const rating = (media.vote_average * 10).toFixed(0)

  return createPortal(
    <div
      className={cn(
        "flex flex-col rounded-lg bg-card text-card-foreground shadow-2xl transition-[opacity,transform] duration-300 overflow-hidden",
        isVisible ? "scale-100 opacity-100" : "scale-95 opacity-0",
        disliked && "grayscale contrast-125 opacity-70 hover:opacity-100"
      )}
      style={{
        ...modalStyle,
        boxShadow: '0 8px 32px rgba(0,0,0,0.8)'
      }}
      onMouseLeave={onClose}
    >
      {/* Video/Image Section */}
      <div className="relative aspect-video w-full bg-background">
        <HoverVideoPlayer media={media} />

        {/* Close Button */}
        <button
          onClick={(e) => {
            e.stopPropagation()
            onClose()
          }}
          aria-label="Close quick view"
          className="absolute top-2 right-2 z-50 rounded-full bg-background/80 hover:bg-foreground hover:text-background p-1.5 transition-colors"
        >
          <X size={18} />
        </button>
      </div>

      {/* Info Section */}
      <div className="p-4 space-y-3">
        {/* Title */}
        <h3 className="text-xl font-bold text-foreground leading-tight">
          {title}
        </h3>

        {/* Metadata */}
        <div className="flex items-center gap-2 text-sm">
          <span className="text-emerald-400 font-semibold">{rating}% Match</span>
          <span className="text-muted-foreground">{year}</span>
          <span className="border border-border px-1 text-xs text-muted-foreground">HD</span>
          {details?.genres?.[0] && (
            <span className="text-muted-foreground">{details.genres[0].name}</span>
          )}
        </div>

        {/* Controls */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-1">
            {/* Play Button */}
            <button
              onClick={(e) => {
                e.stopPropagation()
                onPlay(media, provider)
              }}
              className="flex-shrink-0 flex min-h-11 items-center justify-center gap-2 bg-white hover:bg-gray-200 text-black font-semibold px-6 py-2.5 rounded-md transition-colors active:scale-95"
            >
              <Play size={18} fill="currentColor" />
              Play
            </button>

            {/* Server Selector */}
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              className="px-3 py-2.5 min-h-11 flex-1 bg-secondary/80 border border-border hover:border-ring text-foreground text-sm rounded-md transition-colors cursor-pointer"
            >
              {providers.map(([key, name]) => (
                <option key={key} value={key}>{name}</option>
              ))}
            </select>
          </div>

          {/* Feedback Buttons */}
          {isAuthenticated && (
            <div className="flex items-center gap-2 ml-2">
              <button
                onClick={(e) => { e.stopPropagation(); toggleDislike(media.id, mode); }}
                aria-label={disliked ? 'Remove dislike' : 'Dislike this title'}
                aria-pressed={disliked}
                className={cn(
                  "p-2.5 rounded-full border border-border transition-colors",
                  disliked ? "bg-muted text-foreground border-ring shadow-inner" : "text-foreground hover:border-foreground"
                )}
                title="Not for me"
              >
                <ThumbsDown size={18} className={disliked ? "fill-foreground" : ""} />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); handleFeedback('rate'); }}
                aria-label={feedback === 'rate' ? 'Remove like' : 'Like this title'}
                aria-pressed={feedback === 'rate'}
                className={cn(
                  "p-2.5 rounded-full border border-border transition-colors",
                  feedback === 'rate' ? "bg-white text-black" : "text-foreground hover:border-foreground"
                )}
                title="Loved it!"
              >
                <ThumbsUp size={18} />
              </button>
            </div>
          )}
        </div>

        {/* Description */}
        {media.overview && (
          <p className="text-sm text-muted-foreground line-clamp-3 leading-relaxed">
            {media.overview}
          </p>
        )}
      </div>
    </div>,
    document.body
  )
}
