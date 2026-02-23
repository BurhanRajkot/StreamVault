// ============================================================
// CineMatch AI — RecommendationRow Component
// Netflix-style "Because you watched X" horizontal scroll row.
// Design matches the existing MediaCard / AuthorsChoiceSection
// look: dark obsidian theme, red accent, skeleton loading,
// hover → play overlay, dislike button (thumbs down).
// ============================================================

import React, { useRef, useState, useCallback } from 'react'
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
import { RecoSection, RecoItem, getImageUrl } from '../lib/api'
import { cn } from '../lib/utils'
import { useDislikes } from '../context/DislikesContext'

interface RecommendationRowProps {
  section: RecoSection
  onCardClick: (item: RecoItem) => void
  onDislike?: (item: RecoItem) => void
  isLoading?: boolean
}

/** Pick a section-appropriate icon */
function SectionIcon({ source }: { source: string }) {
  if (source === 'collaborative') return <Users size={15} className="text-[#e50914] flex-shrink-0" />
  if (source === 'hidden_gems')   return <Gem  size={15} className="text-[#e50914] flex-shrink-0" />
  if (source === 'new_releases')  return <Clock size={15} className="text-[#e50914] flex-shrink-0" />
  if (source === 'trending')      return <TrendingUp size={15} className="text-[#e50914] flex-shrink-0" />
  if (source === 'genre_discovery') return <Sparkles size={15} className="text-purple-400 flex-shrink-0" />
  if (source === 'keyword_discovery') return <Tag size={15} className="text-emerald-400 flex-shrink-0" />
  if (source === 'cast_discovery')  return <UserCircle size={15} className="text-blue-400 flex-shrink-0" />
  if (source === 'tmdb_similar' || source === 'tmdb_recommendations') return <Play size={15} className="text-[#e50914] flex-shrink-0" />
  return <Sparkles size={15} className="text-[#e50914] flex-shrink-0" />
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
  const scrollRef = useRef<HTMLDivElement>(null)

  const scroll = (direction: 'left' | 'right') => {
    if (!scrollRef.current) return
    const amount = scrollRef.current.clientWidth * 0.75
    scrollRef.current.scrollBy({
      left: direction === 'right' ? amount : -amount,
      behavior: 'smooth',
    })
  }

  const { isDisliked, toggleDislike } = useDislikes()

  if (!isLoading && section.items.length === 0) return null

  return (
    <section className="relative mb-5 sm:mb-6">
      {/* ── Header ─────────────────────────────────────── */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5 min-w-0">
          <SectionIcon source={section.source} />
          <h2 className="text-lg sm:text-xl font-bold text-foreground leading-tight truncate">
            {section.title}
          </h2>
        </div>

        {/* Arrow buttons – same style as AuthorsChoiceSection */}
        <div className="flex gap-1.5 flex-shrink-0 ml-3">
          <button
            onClick={() => scroll('left')}
            aria-label="Scroll left"
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary/70 text-muted-foreground hover:bg-secondary hover:text-foreground transition-all hover:scale-110 active:scale-95"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            onClick={() => scroll('right')}
            aria-label="Scroll right"
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary/70 text-muted-foreground hover:bg-secondary hover:text-foreground transition-all hover:scale-110 active:scale-95"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      {/* ── Scroll track ───────────────────────────────── */}
      <div
        ref={scrollRef}
        className="flex gap-3 overflow-x-auto scroll-smooth pb-3 no-scrollbar"
        style={{ scrollSnapType: 'x mandatory' }}
      >
        {isLoading
          ? Array.from({ length: 8 }).map((_, i) => <RecoCardSkeleton key={i} />)
          : section.items.map((item) => (
              <RecoCard
                key={`${item.mediaType}:${item.tmdbId}`}
                item={item}
                onClick={onCardClick}
                onDislike={() => {
                  onDislike?.(item)
                  toggleDislike(item.tmdbId, item.mediaType)
                }}
                isDisliked={isDisliked(item.tmdbId, item.mediaType)}
              />
            ))}
      </div>
    </section>
  )
}

// ── Individual card ────────────────────────────────────────
interface RecoCardProps {
  item: RecoItem
  onClick: (item: RecoItem) => void
  onDislike?: (item: RecoItem) => void
  isDisliked?: boolean
}

function RecoCard({ item, onClick, onDislike, isDisliked = false }: RecoCardProps) {
  const [imgError, setImgError] = useState(false)

  const imgSrc = !imgError && item.posterPath
    ? getImageUrl(item.posterPath, 'poster')
    : null

  const handleDislike = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    onDislike?.(item)
  }, [item, onDislike])

  return (
    <button
      className={cn(
        'group relative flex-shrink-0 cursor-pointer text-left',
        'w-[clamp(120px,14vw,175px)]',
        'rounded-xl bg-card border border-border/50',
        'transition-all duration-300 ease-in-out',
        'hover:scale-[1.04] hover:shadow-elevated hover:shadow-primary/10 hover:border-primary/40',
        'active:scale-[0.97] overflow-hidden',
        isDisliked && 'grayscale contrast-125 opacity-70 hover:opacity-100'
      )}
      style={{ scrollSnapAlign: 'start' }}
      onClick={() => onClick(item)}
      aria-label={`Play ${item.title}`}
    >
      {/* ── Poster ─────────────────────────────────────── */}
      <div className="relative aspect-[2/3] overflow-hidden rounded-t-xl bg-secondary/30">
        {imgSrc ? (
          <img
            src={imgSrc}
            alt={item.title}
            loading="lazy"
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

        {/* Gradient overlay on hover */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

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
              isDisliked ? 'bg-background' : 'hover:bg-background'
            )}
          >
            <ThumbsDown
              className={cn(
                'h-4 w-4 transition-all',
                isDisliked
                  ? 'fill-white text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.8)] scale-110'
                  : 'text-zinc-400 hover:text-white'
              )}
            />
          </button>
        )}

        {/* Play overlay – center, on hover */}
        <div className="absolute inset-0 hidden md:flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
          <div className="rounded-full bg-primary/90 backdrop-blur-sm p-3.5 shadow-xl">
            <Play className="h-6 w-6 fill-white text-white" />
          </div>
        </div>
      </div>
    </button>
  )
}
