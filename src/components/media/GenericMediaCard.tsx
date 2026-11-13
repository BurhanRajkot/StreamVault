import { useState, useRef } from 'react'
import { QuickViewModal } from '@/components/modals/QuickViewModal'
import { cn } from '@/lib/utils'
import type { Media } from '@/lib/config'
import { getImageUrl, getImageSrcSet } from '@/lib/api'
import { Star } from 'lucide-react'

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
  rawMedia?: Media
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
        'group relative flex-shrink-0 cursor-pointer rounded-lg text-left outline-none',
        showQuickView ? 'z-50' : 'z-0',
        isDisliked && 'grayscale contrast-125 opacity-60 hover:opacity-100',
        className
      )}
      style={{ scrollSnapAlign: 'start' }}
      onClick={onClick}
      role={role}
      tabIndex={tabIndex}
      aria-label={ariaLabel || `Open ${title}`}
    >
      <div
        className={cn(
          'relative overflow-hidden rounded-lg bg-card ring-1 ring-inset ring-foreground/[0.06] transition-[transform,box-shadow] duration-300 ease-out',
          'group-focus-visible:ring-2 group-focus-visible:ring-foreground',
          !showQuickView && 'md:group-hover:-translate-y-1 md:group-hover:shadow-[0_18px_40px_-14px_rgba(0,0,0,0.85)] active:scale-[0.97]',
          aspectRatio
        )}
      >
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

        {/* A ring that lights up on hover, drawn over the art */}
        <div className="pointer-events-none absolute inset-0 rounded-lg ring-1 ring-inset ring-transparent transition-colors duration-300 md:group-hover:ring-white/25" />

        {overlay}
        {topRightOverlay}
        {bottomLeftOverlay}
      </div>

      {bottomOverlay ?? (
        // Title + one meta line under the art, like MediaCard
        <div className="px-0.5 pt-2" aria-hidden="true">
          <p className="truncate text-[13px] font-medium leading-tight text-foreground/90 md:text-sm md:group-hover:text-foreground">{title}</p>
          <p className="mt-1 flex items-center gap-1.5 text-[11.5px] leading-none text-muted-foreground md:text-xs">
            {voteAverage ? (
              <span className="flex items-center gap-1">
                <Star className="h-3 w-3 fill-primary text-primary" />
                {voteAverage.toFixed(1)}
              </span>
            ) : null}
            {voteAverage && releaseDate ? <span className="h-0.5 w-0.5 rounded-full bg-muted-foreground/70" /> : null}
            {releaseDate ? <span>{releaseDate.slice(0, 4)}</span> : null}
          </p>
        </div>
      )}

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
