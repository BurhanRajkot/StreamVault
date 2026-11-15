import { useQuery } from '@tanstack/react-query'
import { fetchMediaSummaries } from '@/lib/api'
import { useFavorites } from '@/context/FavoritesContext'
import { PosterRow } from './media'

/** My List (the website's favorites) as poster art, in the order they were added. */
export function useMyList() {
  const { favorites } = useFavorites()
  const items = favorites.map((f) => ({ tmdbId: f.tmdbId, mediaType: f.mediaType }))
  const key = items.map((i) => `${i.mediaType}:${i.tmdbId}`).join(',')
  return useQuery({
    queryKey: ['app-my-list', key],
    queryFn: () => fetchMediaSummaries(items),
    enabled: items.length > 0,
    staleTime: 10 * 60 * 1000,
    placeholderData: (previous) => previous,
  })
}

export function MyListRow() {
  const { favorites } = useFavorites()
  const { data } = useMyList()
  if (favorites.length === 0) return null
  return <PosterRow title="My List" items={data} />
}
