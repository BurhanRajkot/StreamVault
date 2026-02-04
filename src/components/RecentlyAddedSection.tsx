import { useEffect, useState } from 'react'
import { Calendar } from 'lucide-react'
import { Media, MediaMode } from '@/lib/config'
import { fetchRecentlyAdded } from '@/lib/api'
import { OTT_PROVIDERS } from '@/lib/ottProviders'
import { MediaCard, MediaCardSkeleton } from '@/components/MediaCard'

interface RecentlyAddedSectionProps {
  mode: MediaMode
  providerId: string
  onMediaClick: (media: Media) => void
}

export function RecentlyAddedSection({ mode, providerId, onMediaClick }: RecentlyAddedSectionProps) {
  const [items, setItems] = useState<Media[]>([])
  const [isLoading, setIsLoading] = useState(false)

  const providerName = OTT_PROVIDERS.find(p => p.id === providerId)?.displayName || 'Provider'

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

    if (providerId) {
      loadData()
    }
  }, [mode, providerId])

  if (!isLoading && items.length === 0) return null

  return (
    <section className="mb-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex items-center gap-2 mb-4">
        <div className="flex items-center justify-center p-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
          <Calendar className="w-4 h-4 md:w-5 md:h-5 text-emerald-500" />
        </div>
        <h2 className="text-lg md:text-xl font-bold text-white">
          Recently Added on <span className="text-primary">{providerName}</span>
        </h2>
      </div>

      {/* Grid layout matching MediaGrid */}
      <div className="
        grid
        grid-cols-2
        gap-3
        sm:grid-cols-3
        sm:gap-4
        md:grid-cols-4
        lg:grid-cols-5
        xl:grid-cols-6
        2xl:grid-cols-7
      ">
        {isLoading ? (
          Array.from({ length: 14 }).map((_, i) => (
            <MediaCardSkeleton key={`skeleton-${i}`} />
          ))
        ) : (
          items.map((media) => (
            <MediaCard key={media.id} media={media} onClick={onMediaClick} />
          ))
        )}
      </div>

      {!isLoading && items.length > 0 && items.length < 5 && (
        <p className="mt-4 text-sm text-muted-foreground text-center">
          Limited recent content available for this provider
        </p>
      )}
    </section>
  )
}
