import React, { useRef, useState, useCallback, useEffect } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  Play,
  ThumbsDown,
  Sparkles,
  TrendingUp,
  Users,
  Gem,
  Clock,
  Tag,
  UserCircle,
} from 'lucide-react'
import { RecoSection, RecoItem, getImageUrl, getImageSrcSet } from '../lib/api'
import { cn } from '../lib/utils'
import { useDislikes } from '../context/DislikesContext'
import { motion, useAnimation, useMotionValue } from 'framer-motion'
import { QuickViewModal } from './QuickViewModal'

interface RecommendationRowProps {
  section: RecoSection
  onCardClick: (item: RecoItem, index: number, source: string) => void
  onDislike?: (item: RecoItem) => void
  isLoading?: boolean
}

/** Pick a section-appropriate icon */
function SectionIcon({ source }: { source: string }) {
  if (source === 'collaborative') return <Users size={15} className="text-primary flex-shrink-0" />
  if (source === 'hidden_gems')   return <Gem  size={15} className="text-primary flex-shrink-0" />
  if (source === 'new_releases')  return <Clock size={15} className="text-primary flex-shrink-0" />
  if (source === 'trending')      return <TrendingUp size={15} className="text-primary flex-shrink-0" />
  if (source === 'genre_discovery') return <Sparkles size={15} className="text-purple-400 flex-shrink-0" />
  if (source === 'keyword_discovery') return <Tag size={15} className="text-emerald-400 flex-shrink-0" />
  if (source === 'cast_discovery')  return <UserCircle size={15} className="text-blue-400 flex-shrink-0" />
  if (source === 'tmdb_similar' || source === 'tmdb_recommendations') return <Play size={15} className="text-primary flex-shrink-0" />
  return <Sparkles size={15} className="text-primary flex-shrink-0" />
}

// ── Skeleton card ──────────────────────────────────────────
function RecoCardSkeleton() {
  return (
    <div className="flex-shrink-0 w-[clamp(110px,13vw,165px)]">
      <div className="aspect-[2/3] rounded-xl animate-shimmer bg-card border border-border/30" />
    </div>
  )
}

// ── Main row ───────────────────────────────────────────────
export function RecommendationRow({
  section,
  onCardClick,
  onDislike,
  isLoading = false,
}: RecommendationRowProps) {
  const [carouselWidth, setCarouselWidth] = useState(0)
  const carouselRef = useRef<HTMLDivElement>(null)
  const innerTrackRef = useRef<HTMLDivElement>(null)

  // Custom physics controller for imperative button scrolling
  const controls = useAnimation()
  const x = useMotionValue(0)

  // Is the user actively dragging? Prevent click events if so.
  const [isDragging, setIsDragging] = useState(false)
  const [showLeftButton, setShowLeftButton] = useState(false)
  const [showRightButton, setShowRightButton] = useState(true)
  const [isHovered, setIsHovered] = useState(false)

  // Measure the true width of the content vs the container to set drag constraints
  useEffect(() => {
    if (carouselRef.current && innerTrackRef.current) {
      const width = innerTrackRef.current.scrollWidth - carouselRef.current.offsetWidth
      setCarouselWidth(Math.max(0, width))
      setShowRightButton(width > 0 && Math.abs(x.get()) < width - 10)
      setShowLeftButton(x.get() < -10)
    }
  }, [section.items, isLoading, x])

  useEffect(() => {
    let unsubscribe: any;
    const handleXChange = (latest: number) => {
      setShowLeftButton(latest < -10);
      setShowRightButton(latest > -carouselWidth + 10 && carouselWidth > 0);
    };

    if (x.on) {
      unsubscribe = x.on('change', handleXChange);
    } else if ((x as any).onChange) {
      unsubscribe = (x as any).onChange(handleXChange);
    }
    
    return () => {
      if (unsubscribe) unsubscribe();
    }
  }, [x, carouselWidth])

  const handleArrowScroll = (direction: 'left' | 'right') => {
    if (!carouselRef.current) return

    // Get the actual mathematical value of the current physical location
    const currentX = x.get()
    const shiftAmount = carouselRef.current.offsetWidth * 0.75

    let targetX = direction === 'right' ? currentX - shiftAmount : currentX + shiftAmount

    // Clamp targets so the buttons don't fire physics past the constraints
    if (targetX > 0) targetX = 0
    if (targetX < -carouselWidth) targetX = -carouselWidth

    // Apply the heavy physics snap action
    controls.start({
        x: targetX,
        transition: {
            type: "spring",
            bounce: 0,
            duration: 0.6, // Slower, heavier slide
            mass: 0.8,
            stiffness: 70,
            damping: 15
        }
    })
  }

  const { isDisliked, toggleDislike } = useDislikes()

  if (!isLoading && section.items.length === 0) return null

  return (
    <section 
      className="relative mb-5 sm:mb-6"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* ── Header ─────────────────────────────────────── */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5 min-w-0">
          <SectionIcon source={section.source} />
          <h2 className="text-lg sm:text-xl font-bold text-foreground leading-tight truncate">
            {section.title}
          </h2>
        </div>

        {/* Mobile-only scroll indicators */}
        <div className="flex gap-2 md:hidden flex-shrink-0 ml-3">
          <button 
            onClick={() => handleArrowScroll('left')}
            disabled={!showLeftButton}
            className={`p-1.5 rounded-full bg-white/5 ${!showLeftButton ? 'opacity-30' : 'active:bg-white/10'}`}
          >
            <ChevronLeft className="w-4 h-4 text-white" />
          </button>
          <button 
            onClick={() => handleArrowScroll('right')}
            disabled={!showRightButton}
            className={`p-1.5 rounded-full bg-white/5 ${!showRightButton ? 'opacity-30' : 'active:bg-white/10'}`}
          >
            <ChevronRight className="w-4 h-4 text-white" />
          </button>
        </div>
      </div>

      {/* ── Outer Carousel Bounds (Used for measurement and hiding off-screen stuff) ── */}
      <div className="relative">
        {/* Left Navigation Button (Desktop) */}
        <div 
          className={`absolute left-0 md:-left-4 top-0 bottom-4 z-30 
            flex items-center justify-center
            transition-opacity duration-300 pointer-events-none
            ${showLeftButton && isHovered ? 'opacity-100' : 'opacity-0'}
            hidden md:flex`}
        >
          <button
            onClick={() => handleArrowScroll('left')}
            className="text-white/70 hover:text-white hover:scale-125 transition-all duration-200 pointer-events-auto drop-shadow-[0_0_6px_rgba(0,0,0,0.8)]"
            aria-label="Scroll left"
          >
            <ChevronLeft className="w-10 h-10 md:w-12 md:h-12" strokeWidth={2} />
          </button>
        </div>

        <div
          ref={carouselRef}
          className="overflow-hidden pb-4"
        >
        {/* ── Inner Physics Track ───────────────────────────────── */}
        <motion.div
          ref={innerTrackRef}
          className="flex gap-3 cursor-grab active:cursor-grabbing w-max pr-10" // Allow enough right padding so the last item breathes
          drag="x"
          dragDirectionLock
          dragConstraints={{ right: 0, left: -carouselWidth }}
          // Here is the requested custom TikTok/Netflix Physics Math:
          dragElastic={0.15} // How far past the end can you 'rubberband' pull it?
          dragTransition={{
              bounceStiffness: 200, // How aggressively it snaps back if pulled out of bounds
              bounceDamping: 20,    // Friction against the bounce. Lower = wobblier
              timeConstant: 350,    // Momentum loss over time (higher = glides further)
              power: 0.5            // Sensitivity of velocity transfer map
          }}
          style={{ x }}
          animate={controls}
          onDragStart={() => setIsDragging(true)}
          // Slight delay on turning off dragging to prevent click firing on release
          onDragEnd={() => setTimeout(() => setIsDragging(false), 50)}
        >
          {isLoading
            ? Array.from({ length: 8 }).map((_, i) => <RecoCardSkeleton key={i} />)
            : section.items.map((item, index) => (
                <RecoCard
                  key={`${item.mediaType}:${item.tmdbId}`}
                  item={item}
                  index={index}
                  source={section.source}
                  isDragging={isDragging}
                  onClick={onCardClick}
                  onDislike={() => {
                    onDislike?.(item)
                    toggleDislike(item.tmdbId, item.mediaType)
                  }}
                  isDisliked={isDisliked(item.tmdbId, item.mediaType)}
                />
              ))}
        </motion.div>
        
        {/* Right Navigation Button (Desktop) */}
        <div 
          className={`absolute right-0 md:-right-4 top-0 bottom-4 z-30 
            flex items-center justify-center
            transition-opacity duration-300 pointer-events-none
            ${showRightButton && isHovered ? 'opacity-100' : 'opacity-0'}
            hidden md:flex`}
        >
          <button
            onClick={() => handleArrowScroll('right')}
            className="text-white/70 hover:text-white hover:scale-125 transition-all duration-200 pointer-events-auto drop-shadow-[0_0_6px_rgba(0,0,0,0.8)]"
            aria-label="Scroll right"
          >
            <ChevronRight className="w-10 h-10 md:w-12 md:h-12" strokeWidth={2} />
          </button>
        </div>
      </div>
      </div>
    </section>
  )
}

// ── Individual card ────────────────────────────────────────
interface RecoCardProps {
  item: RecoItem
  index: number
  source: string
  isDragging?: boolean
  onClick: (item: RecoItem, index: number, source: string) => void
  onDislike?: (item: RecoItem) => void
  isDisliked?: boolean
}

function RecoCard({ item, index, source, isDragging = false, onClick, onDislike, isDisliked = false }: RecoCardProps) {
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

  const imgSrc = !imgError && item.posterPath
    ? getImageUrl(item.posterPath, 'poster')
    : null

  const handleDislike = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    onDislike?.(item)
  }, [item, onDislike])

  const handleClick = (e: React.MouseEvent) => {
    if (isDragging) {
      e.preventDefault()
      return
    }
    onClick(item, index, source)
  }

  const handleCardKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onClick(item, index, source)
    }
  }

  return (
    <div
      ref={cardRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onKeyDown={handleCardKeyDown}
      className={cn(
        'group relative flex-shrink-0 cursor-pointer text-left',
        'w-[clamp(120px,14vw,175px)]',
        'rounded-xl bg-card border border-border/50',
        'transition-[transform,opacity,box-shadow,border-color] duration-300 ease-in-out',
        showQuickView ? 'z-50' : 'hover:scale-[1.04] hover:shadow-elevated hover:shadow-primary/10 hover:border-primary/40 active:scale-[0.97] overflow-hidden',
        isDisliked && 'grayscale contrast-125 opacity-70 hover:opacity-100'
      )}
      style={{ scrollSnapAlign: 'start' }}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      aria-label={`Open ${item.title}`}
    >
      {/* ── Poster ─────────────────────────────────────── */}
      <div className="relative aspect-[2/3] overflow-hidden rounded-t-xl bg-secondary/30">
        {imgSrc ? (
          <img
            src={imgSrc}
            alt={item.title}
            srcSet={getImageSrcSet(item.posterPath, 'poster')}
            sizes="(max-width: 640px) 33vw, (max-width: 1024px) 20vw, 175px"
            loading="lazy"
            fetchPriority="low"
            decoding="async"
            width={500}
            height={750}
            className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110 group-hover:brightness-110"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-secondary to-secondary/50">
            <span className="text-3xl font-bold text-muted-foreground/30">
              {item.title.charAt(0).toUpperCase()}
            </span>
          </div>
        )}

        {/* Play Overlay (hover + touch) */}
        {!isDisliked && (
          <div
            className="absolute inset-0 z-10 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 pointer-events-none"
          >
            <div className="rounded-full bg-white/90 p-3 shadow-lg shadow-black/30 transform scale-75 group-hover:scale-100 transition-all duration-300 pointer-events-auto hover:scale-110 hover:bg-white">
              <Play className="h-6 w-6 text-black fill-black ml-0.5" />
            </div>
          </div>
        )}

        {/* Dislike button – top-right, visible on hover */}
        {onDislike && (
          <button
            onClick={handleDislike}
            aria-label={`Not interested in ${item.title}`}
            className={cn(
              'absolute right-2 top-2 z-10 rounded-full bg-background/90 backdrop-blur-sm shadow-lg',
              'p-2',
              'opacity-0 group-hover:opacity-100 transition-all duration-200',
              'hover:scale-110 active:scale-95',
              'hover:bg-background cursor-pointer'
            )}
          >
            <ThumbsDown
              className={cn(
                'transition-all h-4 w-4',
                isDisliked
                  ? 'fill-white text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.8)] scale-110'
                  : 'text-zinc-400 hover:text-white'
              )}
            />
          </button>
        )}


      </div>

      {showQuickView && (
        <QuickViewModal
          media={{
            id: item.tmdbId,
            title: item.title,
            poster_path: item.posterPath,
            backdrop_path: item.backdropPath,
            overview: item.overview,
            vote_average: item.voteAverage,
            release_date: item.mediaType === 'movie' ? item.releaseDate : undefined,
            first_air_date: item.mediaType === 'tv' ? item.releaseDate : undefined,
            media_type: item.mediaType,
          }}
          onClose={() => setShowQuickView(false)}
          onPlay={() => onClick(item, index, source)}
          triggerRef={cardRef}
        />
      )}
    </div>
  )
}
