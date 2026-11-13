import React, { useCallback } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  Play,
  ThumbsDown,
} from 'lucide-react'
import { RecoSection, RecoItem } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useDislikes } from '@/context/DislikesContext'
import { useScrollArrows } from '@/hooks/useScrollArrows'

interface RecommendationRowProps {
  section: RecoSection
  onCardClick: (item: RecoItem, index: number, source: string) => void
  onDislike?: (item: RecoItem) => void
  isLoading?: boolean
}

// ── Skeleton card ──────────────────────────────────────────
function RecoCardSkeleton() {
  return (
    <div className="flex-shrink-0 w-[30vw] min-w-[104px] max-w-[150px] md:w-[clamp(170px,12.5vw,340px)] md:max-w-none">
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
  const { ref: rowRef, showLeftButton, showRightButton, scrollBy } = useScrollArrows([
    section.items,
    isLoading,
  ])

  const { isDisliked, toggleDislike } = useDislikes()

  if (!isLoading && section.items.length === 0) return null

  return (
    <section
      className="group/row relative mb-6 sm:mb-6"
    >
      {/* ── Header ─────────────────────────────────────── */}
      <div className="mb-2.5 flex items-center justify-between sm:mb-3">
        <div className="flex items-center gap-2 min-w-0 sm:gap-2.5">
          <h2 className="text-[17px] font-semibold tracking-tight text-foreground sm:text-lg lg:text-[1.375rem] leading-tight truncate">
            {section.title}
          </h2>
        </div>

      </div>

      {/* ── Outer Carousel Bounds ── */}
      <div className="relative group/carousel">
        {/* Left Navigation Button (Desktop) */}
        <div 
          className={`absolute left-0 md:-left-4 top-0 bottom-4 z-30 
            flex items-center justify-center
            transition-opacity duration-300 pointer-events-none
            opacity-0 ${showLeftButton ? 'group-hover/row:opacity-100' : ''}
            hidden md:flex`}
        >
          <button
            onClick={() => scrollBy('left')}
            className="text-white/70 hover:text-white hover:scale-125 transition-all duration-200 pointer-events-auto drop-shadow-[0_0_6px_rgba(0,0,0,0.8)]"
            aria-label="Scroll left"
          >
            <ChevronLeft className="w-10 h-10 md:w-12 md:h-12" strokeWidth={2} />
          </button>
        </div>

        <div
          className="-mx-[var(--sv-gutter)] overflow-hidden pb-4"
          style={{ contain: 'layout' }}
        >
        {/* ── Inner Track (Native Scroll) ────────────────────────── */}
        <div
          ref={rowRef}
          className="flex gap-2 overflow-x-auto no-scrollbar scroll-smooth snap-x pb-2 px-[var(--sv-gutter)] scroll-pl-[var(--sv-gutter)] sm:gap-3 lg:gap-4"
        >
          {isLoading
            ? Array.from({ length: 8 }).map((_, i) => <div key={i} className="snap-start shrink-0"><RecoCardSkeleton /></div>)
            : section.items.map((item, index) => (
                <div key={`${item.mediaType}:${item.tmdbId}`} className="snap-start shrink-0">
                  <RecoCard
                    item={item}
                    index={index}
                    source={section.source}
                    onClick={onCardClick}
                    onDislike={() => {
                      onDislike?.(item)
                      toggleDislike(item.tmdbId, item.mediaType)
                    }}
                    isDisliked={isDisliked(item.tmdbId, item.mediaType)}
                  />
                </div>
              ))}
        </div>
        
        {/* Right Navigation Button (Desktop) */}
        <div 
          className={`absolute right-0 md:-right-4 top-0 bottom-4 z-30 
            flex items-center justify-center
            transition-opacity duration-300 pointer-events-none
            opacity-0 ${showRightButton ? 'group-hover/row:opacity-100' : ''}
            hidden md:flex`}
        >
          <button
            onClick={() => scrollBy('right')}
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

import { GenericMediaCard } from '@/components/media/GenericMediaCard'

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

function RecoCard({ item, index, source, onClick, onDislike, isDisliked = false }: RecoCardProps) {
  const handleDislike = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    onDislike?.(item)
  }, [item, onDislike])

  const handleClick = () => {
    onClick(item, index, source)
  }

  return (
    <GenericMediaCard
      id={item.tmdbId}
      title={item.title}
      posterPath={item.posterPath}
      backdropPath={item.backdropPath}
      overview={item.overview}
      voteAverage={item.voteAverage}
      releaseDate={item.releaseDate}
      mediaType={item.mediaType}
      isDisliked={isDisliked}
      className="w-[30vw] min-w-[104px] max-w-[150px] md:w-[clamp(170px,12.5vw,340px)] md:max-w-none"
      imageClassName="transition-[transform,filter] duration-500 ease-out md:group-hover:scale-[1.04] md:group-hover:brightness-[0.8]"
      onClick={handleClick}
      overlay={
        !isDisliked && (
          <div className="pointer-events-none absolute inset-0 z-10 hidden items-center justify-center opacity-0 transition-opacity duration-300 md:flex md:group-hover:opacity-100">
            <div className="pointer-events-auto flex h-12 w-12 scale-90 items-center justify-center rounded-full bg-white/95 shadow-lg shadow-black/40 transition-transform duration-300 hover:scale-105 md:group-hover:scale-100">
              <Play className="ml-0.5 h-5 w-5 fill-black text-black" />
            </div>
          </div>
        )
      }
      topRightOverlay={
        onDislike && (
          <button
            onClick={handleDislike}
            aria-label={`Not interested in ${item.title}`}
            className={cn(
              // Desktop-only: on touch it was an invisible tap target sitting
              // over the artwork, and "not interested" belongs in the detail view
              'absolute right-2 top-2 z-10 hidden h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-md md:flex',
              'opacity-0 group-hover:opacity-100 transition-all duration-200',
              'hover:scale-110 hover:bg-black/80 active:scale-95 cursor-pointer'
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
        )
      }
    />
  )
}
