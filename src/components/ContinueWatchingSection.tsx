import { useEffect, useState } from 'react'
import { useAuth0 } from '@auth0/auth0-react'
import { fetchContinueWatching, fetchMediaDetails } from '@/lib/api'
import { Media } from '@/lib/config'
import { MediaCard } from './MediaCard'

type ContinueWatchingItem = {
  tmdbId: number
  mediaType: 'movie' | 'tv'
  season?: number
  episode?: number
  progress: number
}

interface Props {
  onMediaClick: (media: Media) => void
}

export function ContinueWatchingSection({ onMediaClick }: Props) {
  const { isAuthenticated, getAccessTokenSilently } = useAuth0()

  const [items, setItems] = useState<ContinueWatchingItem[]>([])
  const [media, setMedia] = useState<Media[]>([])

  useEffect(() => {
    if (!isAuthenticated) return

    async function load() {
      const token = await getAccessTokenSilently()

      const data: ContinueWatchingItem[] = await fetchContinueWatching(token)

      setItems(data)

      const details = await Promise.all(
        data.map((item) => fetchMediaDetails(item.mediaType, item.tmdbId))
      )

      setMedia(details.filter(Boolean) as Media[])
    }

    load()
  }, [isAuthenticated, getAccessTokenSilently])

  if (!isAuthenticated || media.length === 0) return null

  return (
    <section className="mb-10">
      <h2 className="mb-4 text-xl font-bold">▶ Continue Watching</h2>

      <div className="flex gap-4 overflow-x-auto no-scrollbar">
        {media.map((m) => (
          <div key={m.id} className="w-[160px] flex-shrink-0">
            <MediaCard media={m} onClick={onMediaClick} />
          </div>
        ))}
      </div>
    </section>
  )
}
