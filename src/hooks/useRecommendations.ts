// ============================================================
// CineMatch AI — useRecommendations Hook (React Query edition)
// Uses useQuery for automatic caching and deduplication.
// staleTime: 10 min — recommendations are expensive to compute
// and change slowly; no need to re-fetch on every page visit.
// ============================================================

import { useCallback, useEffect, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth0 } from '@auth0/auth0-react'
import {
  fetchRecommendations,
  fetchGuestRecommendations,
  RecoSection,
  RecommendationResult,
} from '../lib/api'
import { readSnapshot, writeSnapshot } from '../lib/querySnapshot'

/** Delay before re-requesting after the backend served stale recommendations (its rebuild takes ~1-4s). */
const STALE_REFETCH_DELAY_MS = 5000
const STALE_REFETCH_MAX_ATTEMPTS = 4

interface UseRecommendationsReturn {
  sections: RecoSection[]
  isLoading: boolean
  isPersonalized: boolean
  error: string | null
  refresh: () => void
}

export function useRecommendations(enabled = true): UseRecommendationsReturn {
  const { isAuthenticated, isLoading: authLoading, getAccessTokenSilently, user } = useAuth0()
  const queryClient = useQueryClient()

  // Key by user identity to prevent cross-account cache reuse.
  const queryKey = useMemo(
    () => ['recommendations', isAuthenticated ? (user?.sub || 'authenticated') : 'guest'],
    [isAuthenticated, user?.sub]
  )

  const snapshotKey = `recommendations:${queryKey[1]}`

  const { data, isLoading, isPlaceholderData, error } = useQuery<RecommendationResult>({
    queryKey,
    queryFn: async ({ signal }) => {
      if (isAuthenticated) {
        const token = await getAccessTokenSilently()
        void signal // signal passed for potential future use
        return fetchRecommendations(token)
      }
      return fetchGuestRecommendations()
    },
    // Last visit's rows, shown instantly while the real request runs. Waits
    // for Auth0 so a signed-in user never flashes the guest snapshot.
    placeholderData: () =>
      authLoading ? undefined : readSnapshot<RecommendationResult>(snapshotKey),
    enabled: enabled && !authLoading,
    staleTime: 10 * 60 * 1000,  // 10 min — recommendations change slowly
    gcTime: 15 * 60 * 1000,     // keep 15 min after unmount
    retry: 1,
    retryDelay: 0,               // retry immediately — no exponential backoff delay
    refetchOnMount: false,       // don't re-fetch if data already in cache from eager load
    refetchOnWindowFocus: false, // don't re-trigger the expensive pipeline on tab switch
    // The backend answers instantly from an out-of-date cache while it
    // rebuilds in the background — come back for the rebuilt result. Capped
    // so a rebuild that keeps failing can't turn into endless polling.
    refetchInterval: (query) =>
      query.state.data?.isStale && query.state.dataUpdateCount < STALE_REFETCH_MAX_ATTEMPTS
        ? STALE_REFETCH_DELAY_MS
        : false,
  })

  // Written from an effect rather than inside queryFn because the eager
  // prefetch in App.tsx fills this same cache entry without going through it.
  useEffect(() => {
    if (!data || isPlaceholderData) return
    writeSnapshot<RecommendationResult>(snapshotKey, {
      ...data,
      items: [], // the rows only render `sections`; keep the snapshot small
    })
  }, [data, isPlaceholderData, snapshotKey])

  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey })
  }, [queryClient, queryKey])

  return {
    sections: data?.sections ?? [],
    isLoading,
    isPersonalized: data?.isPersonalized ?? false,
    error: error ? 'Could not load recommendations' : null,
    refresh,
  }
}
