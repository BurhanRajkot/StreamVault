import { useEffect, useState } from 'react'
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react'
import { Media, MediaMode } from '@/lib/config'
import { fetchRecentlyAdded } from '@/lib/api'
import { OTT_PROVIDERS } from '@/lib/ottProviders'
import { MediaCard, MediaCardSkeleton } from '@/components/MediaCard'

interface RecentlyAddedSectionProps {
  mode: MediaMode
  providerId: string | null
  onMediaClick: (media: Media) => void
}

export function RecentlyAddedSection({ mode, providerId, onMediaClick }: RecentlyAddedSectionProps) {
  const [items, setItems] = useState<Media[]>([])
  const [isLoading, setIsLoading] = useState(false)

  const [isHovered, setIsHovered] = useState(false)
  const [showLeftButton, setShowLeftButton] = useState(false)
  const [showRightButton, setShowRightButton] = useState(true)

  useEffect(() => {
    const row = document.getElementById('recently-added-row')
    if (!row) return
    const handleScroll = () => {
      setShowLeftButton(row.scrollLeft > 10)
      setShowRightButton(row.scrollLeft < row.scrollWidth - row.clientWidth - 10)
    }
    row.addEventListener('scroll', handleScroll)
    // Delay initial check to ensure render is complete
    setTimeout(handleScroll, 100)
    return () => row.removeEventListener('scroll', handleScroll)
  }, [items])

  const providerName = providerId
    ? (OTT_PROVIDERS.find(p => p.id === providerId)?.displayName || 'Provider')
    : 'Recently Added'

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true)
      try {
        const data = await fetchRecentlyAdded(mode, providerId)
        // Filter out items without posters, cap at 12 for scroll row performance
        setItems(data.filter(m => m.poster_path).slice(0, 12))
      } catch (error) {
        console.error('Failed to load recently added:', error)
      } finally {
        setIsLoading(false)
      }
    }

    if (providerId || mode === 'documentary') {
      loadData()
    }
  }, [mode, providerId])

  if (!isLoading && items.length === 0) return null

  return (
    <section 
      className="relative mb-6 animate-in fade-in slide-in-from-bottom-4 duration-700"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Header */}
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center p-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
            <Calendar className="w-4 h-4 md:w-5 md:h-5 text-emerald-500" />
          </div>
          <h2 className="text-lg md:text-xl font-bold text-foreground">
            {providerId ? (
              <>Recently Added on <span className="text-primary">{providerName}</span></>
            ) : (
              // Generic title for global view
              <>Recently Added <span className="text-primary">Documentaries</span></>
            )}
          </h2>
        </div>
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
          onClick={() => {
            const row = document.getElementById('recently-added-row')
            if (row) row.scrollBy({ left: -600, behavior: 'smooth' })
          }}
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
          onClick={() => {
            const row = document.getElementById('recently-added-row')
            if (row) row.scrollBy({ left: 600, behavior: 'smooth' })
          }}
          className="text-white/70 hover:text-white hover:scale-125 transition-all duration-200 pointer-events-auto drop-shadow-[0_0_6px_rgba(0,0,0,0.8)]"
          aria-label="Scroll right"
        >
          <ChevronRight className="w-10 h-10 md:w-12 md:h-12" strokeWidth={2} />
        </button>
      </div>

      {/* Horizontal Scroll Row */}
      <div
        id="recently-added-row"
        className="flex gap-4 overflow-x-auto scroll-smooth px-8 pb-4 no-scrollbar"
      >
        {isLoading
          ? Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="w-[160px] flex-shrink-0">
                <MediaCardSkeleton />
              </div>
            ))
          : items.map((media) => (
              <div key={media.id} className="w-[160px] flex-shrink-0">
                <MediaCard media={media} onClick={onMediaClick} />
              </div>
            ))}
      </div>

      {!isLoading && items.length > 0 && items.length < 5 && (
        <p className="mt-4 text-sm text-muted-foreground text-center">
          Limited recent content available for this provider
        </p>
      )}
    </section>
  )
}
