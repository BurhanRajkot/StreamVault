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
  onMediaClick: (media: Media, season?: number, episode?: number) => void
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

        // Hide almost-finished items (Netflix behavior)
        const filtered = data.filter((i) => i.progress < 0.95)

        const resolved = await Promise.all(
          filtered.map(async (item) => {
            const media = await fetchMediaDetails(item.mediaType, item.tmdbId)
            if (!media) return null
            return { media, item }
          })
        )

        setEntries(resolved.filter(Boolean) as ContinueWatchingEntry[])
      } catch (err) {
        console.error(err)
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
        description: 'Could not remove item',
        variant: 'destructive',
      })
    }
  }

  // Always rendered for logged-in users
  if (!isAuthenticated) return null

  return (
    <section className="mb-8 sm:mb-10">
      <div className="mb-3 flex flex-col gap-1 sm:mb-4 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-bold sm:text-xl">▶ Continue Watching</h2>
        <span className="text-xs text-muted-foreground sm:text-sm">
          Pick up where you left off
        </span>
      </div>

      {/* Loading skeleton */}
      {loading && (
        <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar sm:gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="h-[240px] w-[160px] animate-pulse rounded-lg bg-muted"
            />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && entries.length === 0 && (
        <p className="text-sm text-muted-foreground">
          You haven't started watching anything yet.
        </p>
      )}

      {/* Content */}
      {!loading && entries.length > 0 && (
        <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar sm:gap-4">
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
      )}
    </section>
  )
}
