// ============================================================
// useContextualRecommendations — Guest "Because you watched X"
// ============================================================
// For unauthenticated users, the backend pipeline uses an empty
// profile and returns only trending/popular rows. This hook fills
// the gap by reading the guest's last-watched item from localStorage
// (saved by MovieDetailModal via getGuestProgress) and fetching
// TMDB similar titles for it directly — building a client-side
// "Because you watched X" section at zero backend cost.
//
// For authenticated users, this returns [] — the backend pipeline
// handles "Because you watched X" via tmdbSimilar + tmdbRecommendations
// sources.
// ============================================================

import { useState, useEffect } from 'react'
import { useAuth0 } from '@auth0/auth0-react'
import { getGuestProgress, getImageUrl, RecoSection, RecoItem } from '../lib/api'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000'

export function useContextualRecommendations(): {
  section: RecoSection | null
  isLoading: boolean
} {
  const { isAuthenticated, isLoading: authLoading } = useAuth0()
  const [section, setSection] = useState<RecoSection | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    // Only run for guests — authenticated users get this from the backend
    if (authLoading || isAuthenticated) return

    const guestProgress = getGuestProgress()
    if (!guestProgress || guestProgress.length === 0) return

    // Sort by most recently updated (last item = most recent)
    const lastWatched = [...guestProgress].at(-1)
    if (!lastWatched) return

    let cancelled = false
    setIsLoading(true)

    ;(async () => {
      try {
        // Fetch similar titles for the last watched item
        // This endpoint is cached on the backend (15min stale-while-revalidate)
        const res = await fetch(
          `${API_BASE}/tmdb/${lastWatched.mediaType}/${lastWatched.tmdbId}/similar`
        )
        if (!res.ok || cancelled) return

        const data = await res.json()
        const results: any[] = data.results || []

        if (results.length === 0) return

        // Try to get the title from the basic details endpoint (cached)
        let seedTitle = 'a title you watched'
        try {
          const detailRes = await fetch(
            `${API_BASE}/tmdb/${lastWatched.mediaType}/${lastWatched.tmdbId}?include_image_language=en,null`
          )
          if (detailRes.ok && !cancelled) {
            const detail = await detailRes.json()
            seedTitle = detail.title || detail.name || seedTitle
          }
        } catch { /* non-critical */ }

        if (cancelled) return

        // Map TMDB results to RecoItem shape
        const items: RecoItem[] = results.slice(0, 20).map((r: any) => ({
          tmdbId: r.id,
          mediaType: (r.media_type === 'tv' || lastWatched.mediaType === 'tv') ? 'tv' : 'movie',
          title: r.title || r.name || '',
          posterPath: r.poster_path || null,
          backdropPath: r.backdrop_path || null,
          overview: r.overview || '',
          releaseDate: r.release_date || r.first_air_date || '',
          voteAverage: r.vote_average || 0,
          voteCount: r.vote_count || 0,
          popularity: r.popularity || 0,
          genreIds: r.genre_ids || [],
          source: 'tmdb_similar',
          score: r.popularity || 0,
          sourceReason: `Because you watched ${seedTitle}`,
        }))

        if (items.length >= 3) {
          setSection({
            title: `Because you watched ${seedTitle}`,
            items,
            source: 'tmdb_similar',
          })
        }
      } catch { /* non-critical */ } finally {
        if (!cancelled) setIsLoading(false)
      }
    })()

    return () => { cancelled = true }
  }, [isAuthenticated, authLoading])

  return { section, isLoading }
}
