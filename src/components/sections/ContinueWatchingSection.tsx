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
import { ContinueWatchingCard } from '@/components/media/ContinueWatchingCard'
import { toast } from 'sonner'
import { useScrollArrows } from '@/hooks/useScrollArrows'
import { readSnapshot, writeSnapshot } from '@/lib/querySnapshot'
import { cn } from '@/lib/utils'

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
  const { isAuthenticated, isLoading: authLoading, user, getAccessTokenSilently } = useAuth0()
  const queryClient = useQueryClient()

  // Include the user's unique ID in the key so each account gets its own isolated
  // cache entry. Without this, User B logging in would see User A's cached data.
  const accountKey = isAuthenticated ? (user?.sub ?? 'user') : 'guest'
  const queryKey = ['continueWatching', accountKey, refreshKey]
  const snapshotKey = `continueWatching:${accountKey}`


  const { data: entries = [] } = useQuery<ContinueWatchingEntry[]>({
    queryKey,
    queryFn: async () => {
      let data: ContinueWatchingItem[]

      if (isAuthenticated) {
        try {
          // Don't pass `authorizationParams: { audience }` here — that can force
          // a silent-auth iframe round-trip. Auth0 serves a cached token by default.
          const token = await getAccessTokenSilently()
          data = await fetchContinueWatching(token)
        } catch (tokenErr) {
          // Token refresh failed (e.g. invalid/expired refresh token, 403).
          // Fall back to guest localStorage so the section still renders.
          console.warn('[ContinueWatching] Token refresh failed, falling back to guest mode:', tokenErr)
          data = getGuestProgress()
        }
      } else {
        data = getGuestProgress()
      }

      // Hide almost-finished items (Netflix behavior) and cap max items
      const filtered = data.filter((i) => i.progress < 0.95).slice(0, 10)

      // This completely eliminates the old N+1 fetching bottleneck
      const resolved = filtered.length === 0
        ? []
        : (await fetchAggregatedContinueWatching(filtered)) as ContinueWatchingEntry[]

      writeSnapshot(snapshotKey, resolved)
      return resolved
    },
    // Paint last visit's row immediately while the real fetch runs. Held back
    // until Auth0 has resolved who the user is, so a signed-in user never
    // flashes the guest snapshot first.
    placeholderData: () =>
      authLoading ? undefined : readSnapshot<ContinueWatchingEntry[]>(snapshotKey),
    // Don't run while Auth0 is still restoring session from localStorage —
    // otherwise the query fires as 'guest' first, caches guest data, and then
    // the user-key query fires too late (stale cache wins).
    enabled: !authLoading,
    staleTime: 2 * 60 * 1000,   // 2 minutes — short enough to stay fresh
    gcTime: 10 * 60 * 1000,     // keep in cache 10 min after unmount
    refetchOnMount: true,        // always re-validate on mount (user-data must be fresh)
    refetchOnWindowFocus: false, // prevent expensive re-fetch when returning to tab
  })

  const { ref: rowRef, showLeftButton, showRightButton, scrollBy } = useScrollArrows([entries])

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
        const token = await getAccessTokenSilently()
        await removeContinueWatching(token, item.tmdbId, item.mediaType)
      } else {
        removeGuestProgress(item.tmdbId, item.mediaType)
      }

      toast.success('Removed from Continue Watching')
      // invalidate to refetch in bg to ensure total sync
      queryClient.invalidateQueries({ queryKey })
    } catch {
      // Revert optimism on error
      queryClient.invalidateQueries({ queryKey })
      toast.error('Could not remove item')
    }
  }

  // Nothing to continue (or nothing known yet, on a first visit with no
  // snapshot): no section at all, rather than an empty heading — or a
  // skeleton that collapses into one and shifts the page under the viewer.
  if (entries.length === 0) return null

  return (
    <section className="group/row relative mb-5 sm:mb-6">
      <div className="mb-2.5 flex flex-col gap-1 sm:mb-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-[17px] font-bold sm:text-xl">Continue Watching</h2>
        <span className="hidden text-sm text-foreground/80 sm:block">Pick up where you left off</span>
      </div>

      {/* Row arrows — revealed by CSS group-hover, never by state (see useScrollArrows) */}
      {(['left', 'right'] as const).map((side) => (
        <div
          key={side}
          className={cn(
            'pointer-events-none absolute bottom-4 top-10 z-30 hidden items-center justify-center opacity-0 transition-opacity duration-300 md:flex',
            side === 'left' ? 'left-0 md:-left-4' : 'right-0 md:-right-4',
            (side === 'left' ? showLeftButton : showRightButton) && 'group-hover/row:opacity-100'
          )}
        >
          <button
            onClick={() => scrollBy(side)}
            className="pointer-events-auto text-white/70 drop-shadow-[0_0_6px_rgba(0,0,0,0.8)] transition-all duration-200 hover:scale-125 hover:text-white"
            aria-label={side === 'left' ? 'Scroll left' : 'Scroll right'}
          >
            {side === 'left' ? (
              <ChevronLeft className="h-10 w-10 md:h-12 md:w-12" strokeWidth={2} />
            ) : (
              <ChevronRight className="h-10 w-10 md:h-12 md:w-12" strokeWidth={2} />
            )}
          </button>
        </div>
      ))}

      <div
        ref={rowRef}
        className="no-scrollbar -mx-3 flex gap-2 overflow-x-auto scroll-smooth px-3 pb-2 sm:-mx-4 sm:gap-4 sm:px-4 md:mx-0 md:px-0"
      >
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
