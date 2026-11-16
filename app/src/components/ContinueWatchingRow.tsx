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
import { FadeImg, Row, titleOf, tmdbImg } from './media'

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
    <Row title="Continue Watching">
      {entries.map((entry) => {
        const { media, item } = entry
        const percent = Math.max(4, Math.round(item.progress * 100))
        return (
          <div key={`${item.mediaType}-${item.tmdbId}`} className="group/card w-[230px] shrink-0 lg:w-[320px] 2xl:w-[350px]">
            <button
              onClick={() => resume(entry)}
              aria-label={`Resume ${titleOf(media)}`}
              className="press relative block w-full overflow-hidden rounded-xl ring-1 ring-white/[0.08] transition-[transform,box-shadow] duration-300 ease-[cubic-bezier(0.2,0.9,0.3,1.15)] hover:-translate-y-1 hover:scale-[1.03] hover:shadow-[0_24px_50px_-14px_rgb(0_0_0/0.9),0_0_0_1px_rgb(255_255_255/0.16)]"
            >
              <span className="skeleton block aspect-video w-full">
                <FadeImg src={tmdbImg(media.backdrop_path || media.poster_path, 'w780')} loading="lazy" className="h-full w-full object-cover transition-transform duration-700 group-hover/card:scale-105" />
              </span>
              <span className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/10 to-transparent" />
              <span className="absolute inset-0 flex items-center justify-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/20 ring-1 ring-white/40 backdrop-blur-md transition-all duration-300 group-hover/card:scale-110 group-hover/card:bg-white group-hover/card:text-black">
                  <Play className="ml-0.5 h-5 w-5 fill-current" />
                </span>
              </span>
              <span className="absolute inset-x-3 bottom-3 text-left">
                <span className="font-display block truncate text-[14px] font-extrabold text-white drop-shadow">{titleOf(media)}</span>
                <span className="mt-0.5 flex items-center justify-between text-[11px] font-medium text-white/65">
                  <span>{item.mediaType === 'tv' ? `S${item.season ?? 1} · E${item.episode ?? 1}` : 'Film'}</span>
                  <span>{percent}%</span>
                </span>
                <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-white/20">
                  <span className="block h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
                </span>
              </span>
            </button>
            <button
              onClick={() => void remove(entry)}
              className="mt-1.5 flex items-center gap-1 rounded-full px-1.5 py-1 text-[11px] font-medium text-white/40 transition-colors hover:text-white/80"
            >
              <X className="h-3 w-3" /> Remove
            </button>
          </div>
        )
      })}
    </Row>
  )
}
