// ============================================================
// CineMatch AI — useRecommendations Hook (React Query edition)
// Uses useQuery for automatic caching and deduplication.
// staleTime: 10 min — recommendations are expensive to compute
// and change slowly; no need to re-fetch on every page visit.
// ============================================================

import { useCallback, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth0 } from '@auth0/auth0-react'
import {
  fetchRecommendations,
  fetchGuestRecommendations,
  RecoSection,
} from '../lib/api'

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

  const { data, isLoading, error } = useQuery({
    queryKey,
    queryFn: async ({ signal }) => {
      if (isAuthenticated) {
        const token = await getAccessTokenSilently()
        void signal // signal passed for potential future use
        return fetchRecommendations(token)
      }
      return fetchGuestRecommendations()
    },
    enabled: enabled && !authLoading,
    staleTime: 10 * 60 * 1000,  // 10 min — recommendations change slowly
    gcTime: 15 * 60 * 1000,     // keep 15 min after unmount
    retry: 1,
    retryDelay: 0,               // retry immediately — no exponential backoff delay
    refetchOnMount: false,       // don't re-fetch if data already in cache from eager load
    refetchOnWindowFocus: false, // don't re-trigger the expensive pipeline on tab switch
  })

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
