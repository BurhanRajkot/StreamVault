import { useQuery } from '@tanstack/react-query'
import { fetchSeasonEpisodes } from '@/lib/api'

/** Episode lists change rarely; the backend caches them for two hours too. */
const EPISODES_STALE_MS = 2 * 60 * 60 * 1000

export function useSeasonEpisodes(tvId: number, season: number, enabled: boolean) {
  return useQuery({
    queryKey: ['seasonEpisodes', tvId, season],
    queryFn: () => fetchSeasonEpisodes(tvId, season),
    enabled: enabled && tvId > 0,
    staleTime: EPISODES_STALE_MS,
    gcTime: EPISODES_STALE_MS * 2,
    retry: 1,
  })
}
