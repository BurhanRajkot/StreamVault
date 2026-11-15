import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth0 } from '@auth0/auth0-react'
import { Play, X } from 'lucide-react'
import {
  fetchAggregatedContinueWatching,
  fetchContinueWatching,
  getGuestProgress,
  removeContinueWatching,
  removeGuestProgress,
  type ContinueWatchingItem,
} from '@/lib/api'
import type { Media } from '@/lib/config'
import { RowHeader, titleOf, tmdbImg } from './media'

interface Entry {
  media: Media
  item: ContinueWatchingItem
}

export const CONTINUE_WATCHING_KEY = 'continueWatching'

/** The account's (or this device's, signed out) unfinished titles — the website's same list. */
export function useContinueWatching() {
  const { isAuthenticated, isLoading: authLoading, user, getAccessTokenSilently } = useAuth0()
  const accountKey = isAuthenticated ? (user?.sub ?? 'user') : 'guest'
  return useQuery<Entry[]>({
    queryKey: [CONTINUE_WATCHING_KEY, accountKey, 'app'],
    queryFn: async () => {
      let items: ContinueWatchingItem[]
      if (isAuthenticated) {
        try {
          items = await fetchContinueWatching(await getAccessTokenSilently())
        } catch {
          items = getGuestProgress()
        }
      } else {
        items = getGuestProgress()
      }
      const unfinished = items.filter((i) => i.progress < 0.95).slice(0, 12)
      return unfinished.length ? ((await fetchAggregatedContinueWatching(unfinished)) as Entry[]) : []
    },
    enabled: !authLoading,
    staleTime: 60_000,
    refetchOnMount: true,
  })
}

export function ContinueWatchingRow() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { isAuthenticated, getAccessTokenSilently } = useAuth0()
  const { data: entries = [] } = useContinueWatching()

  if (entries.length === 0) return null

  const resume = ({ item }: Entry) => {
    const params = new URLSearchParams()
    if (item.mediaType === 'tv') {
      params.set('s', String(item.season ?? 1))
      params.set('e', String(item.episode ?? 1))
    }
    if (item.server) params.set('server', item.server)
    navigate(`/watch/${item.mediaType}/${item.tmdbId}?${params}`)
  }

  const remove = async ({ item }: Entry) => {
    queryClient.setQueriesData<Entry[]>({ queryKey: [CONTINUE_WATCHING_KEY] }, (old) =>
      old?.filter((e) => !(e.item.tmdbId === item.tmdbId && e.item.mediaType === item.mediaType))
    )
    try {
      if (isAuthenticated) await removeContinueWatching(await getAccessTokenSilently(), item.tmdbId, item.mediaType)
      else removeGuestProgress(item.tmdbId, item.mediaType)
    } finally {
      void queryClient.invalidateQueries({ queryKey: [CONTINUE_WATCHING_KEY] })
    }
  }

  return (
    <section className="mb-6 fade-up">
      <RowHeader title="Continue Watching" />
      <div className="row-scroll gap-2.5 px-4 lg:gap-3 lg:px-8">
        {entries.map((entry) => {
          const { media, item } = entry
          return (
            <div key={`${item.mediaType}-${item.tmdbId}`} className="w-[200px] shrink-0 lg:w-[260px]">
              <button onClick={() => resume(entry)} className="press relative block w-full overflow-hidden rounded-md bg-white/[0.04]">
                <img src={tmdbImg(media.backdrop_path || media.poster_path, 'w500')} alt="" loading="lazy" className="aspect-video w-full object-cover" />
                <span className="absolute inset-0 flex items-center justify-center bg-black/25">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full border border-white/70 bg-black/45">
                    <Play className="ml-0.5 h-4 w-4 fill-white text-white" />
                  </span>
                </span>
                <span className="absolute inset-x-0 bottom-0 h-[3px] bg-white/25">
                  <span className="block h-full bg-primary" style={{ width: `${Math.max(4, Math.round(item.progress * 100))}%` }} />
                </span>
              </button>
              <div className="mt-1.5 flex items-start gap-1">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12.5px] font-semibold text-white">{titleOf(media)}</p>
                  {item.mediaType === 'tv' && (
                    <p className="text-[11px] text-white/50">
                      S{item.season ?? 1}:E{item.episode ?? 1}
                    </p>
                  )}
                </div>
                <button onClick={() => void remove(entry)} aria-label={`Remove ${titleOf(media)}`} className="-mr-1 p-1 text-white/40">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
