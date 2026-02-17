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

      setMedia(results.filter(Boolean) as Media[])
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
        return '🎬 Author’s Choice: Movies'
      case 'tv':
        return '📺 Author’s Choice: TV Shows'
      case 'documentary':
        return '🌍 Author’s Choice: Documentaries'
      default:
        return '👑 Author’s Choice'
    }
  }

  return (
    <section className="relative mb-10">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-foreground">{getTitle()}</h2>
          <p className="text-sm text-muted-foreground">
            Hand-picked recommendations by the creator of StreamVault
          </p>
        </div>
      </div>

      {/* Left Arrow */}
      <button
        onClick={() => scroll('left')}
        className="absolute left-0 top-1/2 z-10 -translate-y-1/2 rounded-lg bg-background/80 p-2 shadow-md backdrop-blur hover:scale-110"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>

      {/* Right Arrow */}
      <button
        onClick={() => scroll('right')}
        className="absolute right-0 top-1/2 z-10 -translate-y-1/2 rounded-lg bg-background/80 p-2 shadow-md backdrop-blur hover:scale-110"
      >
        <ChevronRight className="h-5 w-5" />
      </button>

      {/* Horizontal Scroll Row */}
      <div
        id={`authors-choice-row-${mode}`}
        className="flex gap-4 overflow-x-auto scroll-smooth px-8 pb-4 no-scrollbar"
      >
        {loading
          ? Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="w-[160px] flex-shrink-0">
                <MediaCardSkeleton />
              </div>
            ))
          : media.map((item, index) => (
              <div
                key={`${item.id}-${index}`}
                className="w-[160px] flex-shrink-0"
              >
                <MediaCard media={item} onClick={onMediaClick} />
              </div>
            ))}
      </div>
    </section>
  )
}
