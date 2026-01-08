import { useEffect, useState } from 'react'
import { AUTHORS_CHOICE } from '@/Data/authorsChoice'
import { fetchMediaDetails } from '@/lib/api'
import { Media } from '@/lib/config'
import { MediaGrid } from './MediaGrid'

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

  return (
    <section className="mb-10">
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

      <MediaGrid
        media={media}
        isLoading={loading}
        hasMore={false}
        onLoadMore={() => {}}
        onMediaClick={onMediaClick}
      />
    </section>
  )
}
