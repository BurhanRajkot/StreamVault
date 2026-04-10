import { useState, useEffect } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
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

  const [isHovered, setIsHovered] = useState(false)
  const [showLeftButton, setShowLeftButton] = useState(false)
  const [showRightButton, setShowRightButton] = useState(true)

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

  useEffect(() => {
    const row = document.getElementById('continue-watching-row')
    if (!row) return
    const handleScroll = () => {
      setShowLeftButton(row.scrollLeft > 10)
      setShowRightButton(row.scrollLeft < row.scrollWidth - row.clientWidth - 10)
    }
    row.addEventListener('scroll', handleScroll)
    // Delay initial check to ensure render is complete
    setTimeout(handleScroll, 100)
    return () => row.removeEventListener('scroll', handleScroll)
  }, [entries])

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
    <section 
      className="mb-5 sm:mb-6 relative"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="mb-2 flex flex-col gap-1 sm:mb-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-bold sm:text-xl">▶ Continue Watching</h2>
        <span className="text-sm text-foreground/80">
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
        <p className="text-sm text-foreground/75">
          You haven't started watching anything yet.
        </p>
      )}

      {/* Left Navigation Button */}
      {entries.length > 0 && (
        <div 
          className={`absolute left-0 md:-left-4 top-10 bottom-4 z-30 
            flex items-center justify-center
            transition-opacity duration-300 pointer-events-none
            ${showLeftButton && isHovered ? 'opacity-100' : 'opacity-0'}
            hidden md:flex`}
        >
          <button
            onClick={() => {
              const row = document.getElementById('continue-watching-row')
              if (row) row.scrollBy({ left: -600, behavior: 'smooth' })
            }}
            className="text-white/70 hover:text-white hover:scale-125 transition-all duration-200 pointer-events-auto drop-shadow-[0_0_6px_rgba(0,0,0,0.8)]"
            aria-label="Scroll left"
          >
            <ChevronLeft className="w-10 h-10 md:w-12 md:h-12" strokeWidth={2} />
          </button>
        </div>
      )}

      {/* Right Navigation Button */}
      {entries.length > 0 && (
        <div 
          className={`absolute right-0 md:-right-4 top-10 bottom-4 z-30 
            flex items-center justify-center
            transition-opacity duration-300 pointer-events-none
            ${showRightButton && isHovered ? 'opacity-100' : 'opacity-0'}
            hidden md:flex`}
        >
          <button
            onClick={() => {
              const row = document.getElementById('continue-watching-row')
              if (row) row.scrollBy({ left: 600, behavior: 'smooth' })
            }}
            className="text-white/70 hover:text-white hover:scale-125 transition-all duration-200 pointer-events-auto drop-shadow-[0_0_6px_rgba(0,0,0,0.8)]"
            aria-label="Scroll right"
          >
            <ChevronRight className="w-10 h-10 md:w-12 md:h-12" strokeWidth={2} />
          </button>
        </div>
      )}

      {/* Content */}
      {!loading && entries.length > 0 && (
        <div id="continue-watching-row" className="flex gap-3 overflow-x-auto pb-2 no-scrollbar scroll-smooth sm:gap-4">
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
