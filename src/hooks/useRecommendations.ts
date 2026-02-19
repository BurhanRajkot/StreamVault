// ============================================================
// CineMatch AI — useRecommendations Hook
// Fetches personalized (authed) or guest recommendation sections
// with local state caching via useRef to avoid re-fetching on
// every mount within the same session.
// ============================================================

import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth0 } from '@auth0/auth0-react'
import {
  fetchRecommendations,
  fetchGuestRecommendations,
  RecommendationResult,
  RecoSection,
} from '../lib/api'

interface UseRecommendationsReturn {
  sections: RecoSection[]
  isLoading: boolean
  isPersonalized: boolean
  error: string | null
  refresh: () => void
}

// Session-level in-memory cache (cleared on page reload)
const sessionCache = new Map<string, { data: RecommendationResult; fetchedAt: number }>()
const SESSION_CACHE_TTL = 5 * 60 * 1000  // 5 minutes

export function useRecommendations(): UseRecommendationsReturn {
  const { isAuthenticated, isLoading: authLoading, getAccessTokenSilently } = useAuth0()
  const [sections, setSections] = useState<RecoSection[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isPersonalized, setIsPersonalized] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [refreshTick, setRefreshTick] = useState(0)
  const abortRef = useRef<AbortController | null>(null)

  const refresh = useCallback(() => {
    // Clear session cache so next fetch re-runs pipeline
    sessionCache.clear()
    setRefreshTick(t => t + 1)
  }, [])

  useEffect(() => {
    if (authLoading) return

    // Abort any in-flight request
    abortRef.current?.abort()
    abortRef.current = new AbortController()

    async function load() {
      setIsLoading(true)
      setError(null)

      try {
        const cacheKey = isAuthenticated ? 'authed' : 'guest'
        const cached = sessionCache.get(cacheKey)

        if (cached && Date.now() - cached.fetchedAt < SESSION_CACHE_TTL) {
          setSections(cached.data.sections)
          setIsPersonalized(cached.data.isPersonalized)
          setIsLoading(false)
          return
        }

        let result: RecommendationResult

        if (isAuthenticated) {
          const token = await getAccessTokenSilently()
          result = await fetchRecommendations(token)
        } else {
          result = await fetchGuestRecommendations()
        }

        sessionCache.set(cacheKey, { data: result, fetchedAt: Date.now() })
        setSections(result.sections)
        setIsPersonalized(result.isPersonalized)
      } catch (err: any) {
        if (err?.name !== 'AbortError') {
          setError('Could not load recommendations')
          console.error('[CineMatch] Hook error:', err)
        }
      } finally {
        setIsLoading(false)
      }
    }

    load()

    return () => {
      abortRef.current?.abort()
    }
  }, [isAuthenticated, authLoading, refreshTick, getAccessTokenSilently])

  return { sections, isLoading, isPersonalized, error, refresh }
}
