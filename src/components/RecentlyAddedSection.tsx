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

  const providerName = providerId
    ? (OTT_PROVIDERS.find(p => p.id === providerId)?.displayName || 'Provider')
    : 'Recently Added'

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true)
      try {
        const data = await fetchRecentlyAdded(mode, providerId)
        // Filter out items without posters to keep UI clean
        setItems(data.filter(m => m.poster_path))
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
    <section className="relative mb-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center p-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
            <Calendar className="w-4 h-4 md:w-5 md:h-5 text-emerald-500" />
          </div>
          <h2 className="text-lg md:text-xl font-bold text-white">
            {providerId ? (
              <>Recently Added on <span className="text-primary">{providerName}</span></>
            ) : (
              // Generic title for global view
              <>Recently Added <span className="text-primary">Documentaries</span></>
            )}
          </h2>
        </div>
      </div>

      {/* Left Arrow */}
      <button
        onClick={() => {
          const row = document.getElementById('recently-added-row')
          if (row) row.scrollBy({ left: -600, behavior: 'smooth' })
        }}
        className="absolute left-0 top-1/2 z-10 -translate-y-1/2 rounded-full bg-background/80 p-2 shadow-md backdrop-blur hover:scale-110"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>

      {/* Right Arrow */}
      <button
        onClick={() => {
          const row = document.getElementById('recently-added-row')
          if (row) row.scrollBy({ left: 600, behavior: 'smooth' })
        }}
        className="absolute right-0 top-1/2 z-10 -translate-y-1/2 rounded-full bg-background/80 p-2 shadow-md backdrop-blur hover:scale-110"
      >
        <ChevronRight className="h-5 w-5" />
      </button>

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
