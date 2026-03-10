import { useAuth0 } from '@auth0/auth0-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchContinueWatching,
  fetchAggregatedContinueWatching,
  removeContinueWatching,
  getGuestProgress,
  removeGuestProgress,
} from '@/lib/api'
import { Media } from '@/lib/config'
import { ContinueWatchingCard } from './ContinueWatchingCard'
import { useToast } from '@/hooks/use-toast'

import { ContinueWatchingItem } from '@/lib/api'

type ContinueWatchingEntry = {
  media: Media
  item: ContinueWatchingItem
}

interface Props {
  onMediaClick: (media: Media, season?: number, episode?: number, server?: string) => void
  refreshKey?: number
}

export function ContinueWatchingSection({ onMediaClick, refreshKey = 0 }: Props) {
  const { isAuthenticated, getAccessTokenSilently } = useAuth0()
  const { toast } = useToast()
  const queryClient = useQueryClient()

  const queryKey = ['continueWatching', isAuthenticated ? 'user' : 'guest', refreshKey]

  const { data: entries = [], isLoading: loading } = useQuery<ContinueWatchingEntry[]>({
    queryKey,
    queryFn: async () => {
      let data: ContinueWatchingItem[] = []

      if (isAuthenticated) {
        const audience = import.meta.env.VITE_AUTH0_AUDIENCE
        const token = await getAccessTokenSilently({
          authorizationParams: { audience },
        })
        data = await fetchContinueWatching(token)
      } else {
        data = getGuestProgress()
      }

      // Hide almost-finished items (Netflix behavior) and cap max items
      const filtered = data.filter((i) => i.progress < 0.95).slice(0, 10)

      if (filtered.length === 0) return []

      // This completely eliminates the old N+1 fetching bottleneck
      const resolved = await fetchAggregatedContinueWatching(filtered)
      return resolved as ContinueWatchingEntry[]
    },
    staleTime: 60000, // 1 minute stale time
    refetchOnWindowFocus: true,
  })

  /* ================= HANDLERS ================= */

  const handleRemove = async (item: ContinueWatchingItem) => {
    // Optimistic update
    queryClient.setQueryData<ContinueWatchingEntry[]>(queryKey, (old = []) =>
      old.filter(
        (e) =>
          !(e.item.tmdbId === item.tmdbId && e.item.mediaType === item.mediaType)
      )
    )

    try {
      if (isAuthenticated) {
        const audience = import.meta.env.VITE_AUTH0_AUDIENCE
        const token = await getAccessTokenSilently({
          authorizationParams: { audience },
        })
        await removeContinueWatching(token, item.tmdbId, item.mediaType)
      } else {
        removeGuestProgress(item.tmdbId, item.mediaType)
      }

      toast({
        title: 'Removed',
        description: 'Removed from Continue Watching',
      })
      // invalidate to refetch in bg to ensure total sync
      queryClient.invalidateQueries({ queryKey })
    } catch {
      // Revert optimism on error
      queryClient.invalidateQueries({ queryKey })
      toast({
        title: 'Error',
        description: 'Could not remove item',
        variant: 'destructive',
      })
    }
  }

  // Render for both guests and logged-in users

  return (
    <section className="mb-5 sm:mb-6">
      <div className="mb-2 flex flex-col gap-1 sm:mb-3 sm:flex-row sm:items-center sm:justify-between">
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
