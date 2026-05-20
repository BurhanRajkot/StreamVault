import { useAuth0 } from '@auth0/auth0-react'
import { useCallback } from 'react'
import { logRecommendationInteraction } from '@/lib/api'
import { useMediaList } from './useMediaList'

export interface Favorite {
  id: string
  tmdbId: number
  mediaType: 'movie' | 'tv'
}

export function useFavoritesInternal() {
  const { getAccessTokenSilently } = useAuth0()

  const handleAddSuccess = useCallback(
    (tmdbId: number, mediaType: 'movie' | 'tv', genreIds?: number[]) => {
      // ── CineMatch: log favorite signal (fire-and-forget) ──
      void (async () => {
        try {
          const token = await getAccessTokenSilently()
          logRecommendationInteraction(token, {
            tmdbId,
            mediaType,
            eventType: 'favorite',
            genreIds,
          })
        } catch {
          /* non-critical */
        }
      })()
    },
    [getAccessTokenSilently]
  )

  const {
    items: favorites,
    hasItem: isFavorited,
    toggleItem: toggleFavorite,
  } = useMediaList({
    endpoint: 'favorites',
    unauthenticatedMessage: 'Please log in to add favorites',
    messages: {
      addSuccess: 'Added to favorites',
      removeSuccess: 'Removed from favorites',
      addError: 'Failed to add favorite',
      removeError: 'Failed to remove favorite',
    },
    onAddSuccess: handleAddSuccess,
  })

  return {
    favorites: favorites as Favorite[],
    isFavorited,
    toggleFavorite,
  }
}
