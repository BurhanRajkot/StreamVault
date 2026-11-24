import { useQuery, type QueryClient } from '@tanstack/react-query'
import { fetchMediaDetails, fetchTVSeasons } from '@/lib/api'
import type { Media } from '@/lib/config'

export type TitleKind = 'movie' | 'tv'

export function parseKind(value: string | undefined): TitleKind | null {
  return value === 'movie' || value === 'tv' ? value : null
}

const DETAILS_STALE_MS = 2 * 60 * 60 * 1000

/** A title's full details — the same query (and cache entry) the website's title page uses. */
function detailsQuery(kind: TitleKind, id: number) {
  return {
    queryKey: ['mediaDetails', kind, String(id)],
    queryFn: () => fetchMediaDetails(kind, id),
    staleTime: DETAILS_STALE_MS,
    gcTime: 4 * 60 * 60 * 1000,
  }
}

/**
 * The title page opens on `preview` — the card that was clicked already knows
 * the name, artwork, year, rating and overview — and fills in the rest
 * (logo, runtime, cast, similar titles) when the details arrive.
 */
export function useTitleDetails(kind: TitleKind | null, id: number, preview?: Media | null) {
  return useQuery({
    ...detailsQuery(kind ?? 'movie', id),
    enabled: !!kind && id > 0,
    placeholderData: preview && preview.id === id ? preview : undefined,
    retry: 1,
  })
}

/** Starts loading a title's details before it's opened (a pointer resting on its card). */
export function prefetchTitleDetails(queryClient: QueryClient, kind: TitleKind, id: number): void {
  if (id > 0) void queryClient.prefetchQuery(detailsQuery(kind, id))
}

/** A title's details from the cache, or loaded now — the same entry the title page and the player read. */
export function fetchTitleDetails(queryClient: QueryClient, kind: TitleKind, id: number): Promise<Media> {
  return queryClient.fetchQuery(detailsQuery(kind, id))
}

export function useSeasons(kind: TitleKind | null, id: number) {
  return useQuery({
    queryKey: ['tvSeasons', id],
    queryFn: async () => (await fetchTVSeasons(id)).filter((s) => s.season_number > 0 && s.episode_count > 0),
    enabled: kind === 'tv' && id > 0,
    staleTime: 2 * 60 * 60 * 1000,
  })
}
