import { useState, useRef, useCallback } from 'react'
import { QuickViewModal } from './QuickViewModal'
import { cn } from '@/lib/utils'
import { getImageUrl, getImageSrcSet } from '@/lib/api'

export interface GenericMediaCardProps {
  id: number
  title: string
  posterPath: string | null
  backdropPath?: string | null
  overview?: string
  voteAverage?: number
  releaseDate?: string
  mediaType: 'movie' | 'tv'

  // Common UI states
  isDisliked?: boolean
  className?: string
  imageClassName?: string
  aspectRatio?: string

  // Custom overlays
  overlay?: React.ReactNode
  topRightOverlay?: React.ReactNode
  bottomLeftOverlay?: React.ReactNode
  bottomOverlay?: React.ReactNode

  // Handlers
  onClick?: () => void
  onDislike?: (e: React.MouseEvent) => void

  // Additional props
  role?: string
  tabIndex?: number
  ariaLabel?: string

  // Provide raw item for quick view
  rawMedia?: any
}

export function GenericMediaCard({
  id,
  title,
  posterPath,
  backdropPath,
  overview,
  voteAverage,
  releaseDate,
  mediaType,
  isDisliked = false,
  className,
  imageClassName,
  aspectRatio = 'aspect-[2/3]',
  overlay,
  topRightOverlay,
  bottomLeftOverlay,
  bottomOverlay,
  onClick,
  role = 'button',
  tabIndex = 0,
  ariaLabel,
  rawMedia
}: GenericMediaCardProps) {
  const [imgError, setImgError] = useState(false)
  const [showQuickView, setShowQuickView] = useState(false)
  const hoverTimeout = useRef<NodeJS.Timeout | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)

  const handleMouseEnter = () => {
    if (window.innerWidth < 768) return
    hoverTimeout.current = setTimeout(() => {
      setShowQuickView(true)
    }, 1500)
  }

  const handleMouseLeave = () => {
    if (hoverTimeout.current) clearTimeout(hoverTimeout.current)
    setShowQuickView(false)
  }

  const imgSrc = !imgError && posterPath
    ? getImageUrl(posterPath, 'poster')
    : null

  const handleCardKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onClick?.()
    }
  }

  const quickViewMedia = rawMedia || {
    id,
    title,
    poster_path: posterPath,
    backdrop_path: backdropPath,
    overview,
    vote_average: voteAverage,
    release_date: mediaType === 'movie' ? releaseDate : undefined,
    first_air_date: mediaType === 'tv' ? releaseDate : undefined,
    media_type: mediaType,
  }

  return (
    <div
      ref={cardRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onKeyDown={handleCardKeyDown}
      className={cn(
        'group relative flex-shrink-0 cursor-pointer text-left',
        'rounded-xl bg-card border border-border/50',
        'transition-[transform,opacity,box-shadow,border-color] duration-300 ease-in-out',
        showQuickView ? 'z-50' : 'z-0',
        isDisliked && 'grayscale contrast-125 opacity-70 hover:opacity-100',
        className
      )}
      style={{ scrollSnapAlign: 'start' }}
      onClick={onClick}
      role={role}
      tabIndex={tabIndex}
      aria-label={ariaLabel || `Open ${title}`}
    >
      <div className={cn("relative overflow-hidden rounded-t-xl bg-secondary/30", aspectRatio)}>
        {imgSrc ? (
          <img
            src={imgSrc}
            alt={title}
            srcSet={getImageSrcSet(posterPath, 'poster')}
            sizes="(max-width: 640px) 33vw, (max-width: 1024px) 20vw, 175px"
            loading="lazy"
            fetchPriority="low"
            decoding="async"
            width={500}
            height={750}
            className={cn(
              "h-full w-full object-cover transition-transform duration-700",
              imageClassName
            )}
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-secondary to-secondary/50">
            <span className="text-3xl font-bold text-muted-foreground/30">
              {title.charAt(0).toUpperCase()}
            </span>
          </div>
        )}

        {overlay}
        {topRightOverlay}
        {bottomLeftOverlay}
      </div>

      {bottomOverlay}

      {showQuickView && (
        <QuickViewModal
          media={quickViewMedia}
          onClose={() => setShowQuickView(false)}
          onPlay={() => onClick?.()}
          triggerRef={cardRef}
        />
      )}
    </div>
  )
}
