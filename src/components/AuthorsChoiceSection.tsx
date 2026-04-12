import { useEffect, useState } from 'react'
import {
  AUTHORS_CHOICE_MOVIES,
  AUTHORS_CHOICE_TV,
  AUTHORS_CHOICE_DOCUMENTARIES,
  AuthorsChoiceItem,
} from '@/Data/authorsChoice'
import { fetchMediaDetails } from '@/lib/api'
import { Media } from '@/lib/config'
import { MediaCard, MediaCardSkeleton } from '@/components/MediaCard'
import { ChevronLeft, ChevronRight } from 'lucide-react'

interface Props {
  onMediaClick: (media: Media) => void
  mode?: 'movie' | 'tv' | 'documentary' | 'all'
}

export function AuthorsChoiceSection({ onMediaClick, mode = 'movie' }: Props) {
  const [media, setMedia] = useState<Media[]>([])
  const [loading, setLoading] = useState(true)

  const [isHovered, setIsHovered] = useState(false)
  const [showLeftButton, setShowLeftButton] = useState(false)
  const [showRightButton, setShowRightButton] = useState(true)

  useEffect(() => {
    const row = document.getElementById(`authors-choice-row-${mode}`)
    if (!row) return
    const handleScroll = () => {
      setShowLeftButton(row.scrollLeft > 10)
      setShowRightButton(row.scrollLeft < row.scrollWidth - row.clientWidth - 10)
    }
    row.addEventListener('scroll', handleScroll)
    // Delay initial check to ensure render is complete
    setTimeout(handleScroll, 100)
    return () => row.removeEventListener('scroll', handleScroll)
  }, [mode, media])

  useEffect(() => {
    async function load() {
      setLoading(true)

      let sourceData: AuthorsChoiceItem[] = []

      if (mode === 'movie') {
        sourceData = AUTHORS_CHOICE_MOVIES
      } else if (mode === 'tv') {
        sourceData = AUTHORS_CHOICE_TV
      } else if (mode === 'documentary') {
        sourceData = AUTHORS_CHOICE_DOCUMENTARIES
      } else {
        // 'all' - mix top items from each (e.g. top 5 of each)
        sourceData = [
          ...AUTHORS_CHOICE_MOVIES.slice(0, 5),
          ...AUTHORS_CHOICE_TV.slice(0, 5),
          ...AUTHORS_CHOICE_DOCUMENTARIES.slice(0, 5),
        ].sort(() => 0.5 - Math.random()) // Shuffle
      }

      const results = await Promise.all(
        sourceData.map((item) =>
          fetchMediaDetails(item.mediaType as any, item.tmdbId)
        )
      )

      // Cap at 12 to keep the horizontal row performant
      setMedia((results.filter(Boolean) as Media[]).slice(0, 12))
      setLoading(false)
    }

    load()
  }, [mode])

  const scroll = (dir: 'left' | 'right') => {
    const row = document.getElementById(`authors-choice-row-${mode}`)
    if (!row) return

    row.scrollBy({
      left: dir === 'left' ? -600 : 600,
      behavior: 'smooth',
    })
  }

  const getTitle = () => {
    switch (mode) {
      case 'movie':
        return "🎬 Author's Choice: Movies"
      case 'tv':
        return "📺 Author's Choice: TV Shows"
      case 'documentary':
        return "🌍 Author's Choice: Documentaries"
      default:
        return "👑 Author's Choice"
    }
  }

  return (
    <section 
      className="relative mb-6"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Header */}
      <div className="mb-4 flex flex-row items-end justify-between gap-4">
        <h2 className="text-xl sm:text-2xl font-bold text-foreground leading-none">{getTitle()}</h2>
        <p className="text-sm text-foreground/80 text-right shrink-0">
          Hand-picked recommendations by the creator of StreamVault
        </p>
      </div>

      {/* Left Navigation Button */}
      <div 
        className={`absolute left-0 md:-left-4 top-10 bottom-4 z-30 
          flex items-center justify-center
          transition-opacity duration-300 pointer-events-none
          ${showLeftButton && isHovered ? 'opacity-100' : 'opacity-0'}
          hidden md:flex`}
      >
        <button
          onClick={() => scroll('left')}
          className="text-white/70 hover:text-white hover:scale-125 transition-all duration-200 pointer-events-auto drop-shadow-[0_0_6px_rgba(0,0,0,0.8)]"
          aria-label="Scroll left"
        >
          <ChevronLeft className="w-10 h-10 md:w-12 md:h-12" strokeWidth={2} />
        </button>
      </div>

      {/* Right Navigation Button */}
      <div 
        className={`absolute right-0 md:-right-4 top-10 bottom-4 z-30 
          flex items-center justify-center
          transition-opacity duration-300 pointer-events-none
          ${showRightButton && isHovered ? 'opacity-100' : 'opacity-0'}
          hidden md:flex`}
      >
        <button
          onClick={() => scroll('right')}
          className="text-white/70 hover:text-white hover:scale-125 transition-all duration-200 pointer-events-auto drop-shadow-[0_0_6px_rgba(0,0,0,0.8)]"
          aria-label="Scroll right"
        >
          <ChevronRight className="w-10 h-10 md:w-12 md:h-12" strokeWidth={2} />
        </button>
      </div>

      {/* Horizontal Scroll Row */}
      <div
        id={`authors-choice-row-${mode}`}
        className="flex gap-4 overflow-x-auto scroll-smooth px-8 pb-4 no-scrollbar"
      >
        {loading
          ? Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="w-[clamp(160px,9vw,300px)] flex-shrink-0">
                <MediaCardSkeleton />
              </div>
            ))
          : media.map((item, index) => (
              <div
                key={`${item.id}-${index}`}
                className="w-[clamp(160px,9vw,300px)] flex-shrink-0"
              >
                <MediaCard media={item} onClick={onMediaClick} />
              </div>
            ))}
      </div>
    </section>
  )
}
