import { useEffect, useState } from 'react'
import { useAuth0 } from '@auth0/auth0-react'
import {
  fetchContinueWatching,
  fetchMediaDetails,
  removeContinueWatching,
} from '@/lib/api'
import { Media } from '@/lib/config'
import { ContinueWatchingCard } from './ContinueWatchingCard'
import { useToast } from '@/hooks/use-toast'

type ContinueWatchingItem = {
  tmdbId: number
  mediaType: 'movie' | 'tv'
  season?: number
  episode?: number
  progress: number
}

type ContinueWatchingEntry = {
  media: Media
  item: ContinueWatchingItem
}

interface Props {
  onMediaClick: (media: Media) => void
}

export function ContinueWatchingSection({ onMediaClick }: Props) {
  const { isAuthenticated, getAccessTokenSilently } = useAuth0()
  const { toast } = useToast()

  const [entries, setEntries] = useState<ContinueWatchingEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!isAuthenticated) return

    async function load() {
      try {
        setLoading(true)
        const token = await getAccessTokenSilently()

        const data: ContinueWatchingItem[] = await fetchContinueWatching(token)

        // Netflix behavior: hide almost-finished items
        const filtered = data.filter((i) => i.progress < 0.95)

        const resolved = await Promise.all(
          filtered.map(async (item) => {
            const media = await fetchMediaDetails(item.mediaType, item.tmdbId)
            if (!media) return null
            return { media, item }
          })
        )

        setEntries(resolved.filter(Boolean) as ContinueWatchingEntry[])
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [isAuthenticated, getAccessTokenSilently])

  const handleRemove = async (item: ContinueWatchingItem) => {
    try {
      const token = await getAccessTokenSilently()
      await removeContinueWatching(token, item.tmdbId, item.mediaType)

      setEntries((prev) =>
        prev.filter(
          (e) =>
            !(
              e.item.tmdbId === item.tmdbId &&
              e.item.mediaType === item.mediaType
            )
        )
      )

      toast({
        title: 'Removed',
        description: 'Removed from Continue Watching',
      })
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to remove item',
        variant: 'destructive',
      })
    }
  }

  if (!isAuthenticated || loading || entries.length === 0) return null

  return (
    <section className="mb-10">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-bold">▶ Continue Watching</h2>
        <span className="text-sm text-muted-foreground">
          Resume where you left off
        </span>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-2 no-scrollbar">
        {entries.map(({ media, item }) => (
          <ContinueWatchingCard
            key={`${item.mediaType}-${item.tmdbId}`}
            media={media}
            item={item}
            onResume={onMediaClick}
            onRemove={handleRemove}
          />
        ))}
      </div>
    </section>
  )
}
