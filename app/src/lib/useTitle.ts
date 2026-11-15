import { useQuery } from '@tanstack/react-query'
import { fetchMediaDetails, fetchTVSeasons } from '@/lib/api'

export type TitleKind = 'movie' | 'tv'

export function parseKind(value: string | undefined): TitleKind | null {
  return value === 'movie' || value === 'tv' ? value : null
}

/** A title's full details — the same query (and cache entry) the website's title page uses. */
export function useTitleDetails(kind: TitleKind | null, id: number) {
  return useQuery({
    queryKey: ['mediaDetails', kind, String(id)],
    queryFn: () => fetchMediaDetails(kind!, id),
    enabled: !!kind && id > 0,
    staleTime: 2 * 60 * 60 * 1000,
    gcTime: 4 * 60 * 60 * 1000,
    retry: 1,
  })
}

export function useSeasons(kind: TitleKind | null, id: number) {
  return useQuery({
    queryKey: ['tvSeasons', id],
    queryFn: async () => (await fetchTVSeasons(id)).filter((s) => s.season_number > 0 && s.episode_count > 0),
    enabled: kind === 'tv' && id > 0,
    staleTime: 2 * 60 * 60 * 1000,
  })
}
