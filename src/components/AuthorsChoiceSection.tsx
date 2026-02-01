import { useEffect, useState } from 'react'
import { AUTHORS_CHOICE } from '@/Data/authorsChoice'
import { fetchMediaDetails } from '@/lib/api'
import { Media } from '@/lib/config'
import { MediaCard, MediaCardSkeleton } from '@/components/MediaCard'
import { ChevronLeft, ChevronRight } from 'lucide-react'

interface Props {
  onMediaClick: (media: Media) => void
}

export function AuthorsChoiceSection({ onMediaClick }: Props) {
  const [media, setMedia] = useState<Media[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)

      const results = await Promise.all(
        AUTHORS_CHOICE.map((item) =>
          fetchMediaDetails(item.mediaType, item.tmdbId)
        )
      )

      setMedia(results.filter(Boolean) as Media[])
      setLoading(false)
    }

    load()
  }, [])

  const scroll = (dir: 'left' | 'right') => {
    const row = document.getElementById('authors-choice-row')
    if (!row) return

    row.scrollBy({
      left: dir === 'left' ? -600 : 600,
      behavior: 'smooth',
    })
  }

  return (
    <section className="relative mb-10">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-foreground">
            🎬 Author’s Choice
          </h2>
          <p className="text-sm text-muted-foreground">
            Hand-picked recommendations by the creator of StreamVault
          </p>
        </div>
      </div>

      {/* Left Arrow */}
      <button
        onClick={() => scroll('left')}
        className="absolute left-0 top-1/2 z-10 -translate-y-1/2 rounded-full bg-background/80 p-2 shadow-md backdrop-blur hover:scale-110"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>

      {/* Right Arrow */}
      <button
        onClick={() => scroll('right')}
        className="absolute right-0 top-1/2 z-10 -translate-y-1/2 rounded-full bg-background/80 p-2 shadow-md backdrop-blur hover:scale-110"
      >
        <ChevronRight className="h-5 w-5" />
      </button>

      {/* Horizontal Scroll Row */}
      <div
        id="authors-choice-row"
        className="flex gap-4 overflow-x-auto scroll-smooth px-8 pb-4 no-scrollbar"
      >
        {loading
          ? Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="w-[160px] flex-shrink-0">
                <MediaCardSkeleton />
              </div>
            ))
          : media.map((item, index) => (
              <div key={`${item.id}-${index}`} className="w-[160px] flex-shrink-0">
                <MediaCard media={item} onClick={onMediaClick} />
              </div>
            ))}
      </div>
    </section>
  )
}
