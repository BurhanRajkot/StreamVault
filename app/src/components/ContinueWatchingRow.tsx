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
    // A hint, not a pick: an account with Premium starts on Premium regardless (lib/startServer)
    if (item.server) params.set('saved', item.server)
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
          <div key={`${item.mediaType}-${item.tmdbId}`} className="group/card relative w-[268px] shrink-0 lg:w-[330px] 2xl:w-[370px]">
            <button onClick={() => resume(entry)} aria-label={`Resume ${titleOf(media)}`} className="press block w-full text-left">
              <span className="skeleton relative block aspect-video w-full overflow-hidden rounded-[10px] transition-transform duration-300 ease-[cubic-bezier(0.25,1,0.5,1)] [@media(hover:hover)]:group-hover/card:scale-[1.04]">
                <FadeImg src={tmdbImg(media.backdrop_path || media.poster_path, 'w780')} loading="lazy" className="h-full w-full object-cover" />
                <span className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/70 to-transparent" />
                <span className="absolute inset-x-3 bottom-3 flex items-center gap-2">
                  <Play className="h-3.5 w-3.5 shrink-0 fill-white text-white" />
                  <span className="block h-[4px] flex-1 overflow-hidden rounded-full bg-white/30">
                    <span className="block h-full rounded-full bg-white" style={{ width: `${percent}%` }} />
                  </span>
                </span>
              </span>
              <span className="t-subhead mt-2 block truncate font-semibold text-white">{titleOf(media)}</span>
              <span className="t-footnote block truncate text-label-2">
                {item.mediaType === 'tv' ? `Season ${item.season ?? 1}, Episode ${item.episode ?? 1}` : `${100 - percent}% left`}
              </span>
            </button>
            <button
              onClick={() => void remove(entry)}
              aria-label={`Remove ${titleOf(media)} from Continue Watching`}
              className="glass-button absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full text-white/90 transition-opacity lg:opacity-0 lg:group-hover/card:opacity-100"
            >
              <X className="h-3.5 w-3.5" strokeWidth={2.6} />
            </button>
          </div>
        )
      })}
    </Row>
  )
}
