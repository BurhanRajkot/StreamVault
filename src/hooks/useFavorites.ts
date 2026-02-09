import { useAuth0 } from '@auth0/auth0-react'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000'

export interface Favorite {
  id: string
  tmdbId: number
  mediaType: 'movie' | 'tv'
}

// Retry utility with exponential backoff
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  initialDelay = 1000
): Promise<T> {
  let lastError: Error | null = null

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn()
    } catch (error: any) {
      lastError = error

      // Don't retry if it's not a rate limit error
      if (!error.message?.includes('429') && error.status !== 429) {
        throw error
      }

      // Don't retry on last attempt
      if (i === maxRetries - 1) {
        break
      }

      // Exponential backoff: 1s, 2s, 4s
      const delay = initialDelay * Math.pow(2, i)
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }

  throw lastError || new Error('Max retries exceeded')
}

export function useFavoritesInternal() {
  const { isAuthenticated, getAccessTokenSilently } = useAuth0()
  const [favorites, setFavorites] = useState<Favorite[]>([])

  const getHeaders = async () => {
    const audience = import.meta.env.VITE_AUTH0_AUDIENCE

    const token = audience
      ? await getAccessTokenSilently({
          authorizationParams: { audience },
        })
      : await getAccessTokenSilently()

    return {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    }
  }

  const loadFavorites = useCallback(async () => {
    if (!isAuthenticated) {
      setFavorites([])
      return
    }

    try {
      const headers = await getHeaders()
      const res = await fetch(`${API_URL}/favorites`, { headers })

      if (!res.ok) {
        throw new Error(await res.text())
      }

      const data = await res.json()
      setFavorites(data)
    } catch (err) {
      console.error('Failed to load favorites:', err)
      setFavorites([])
    }
  }, [isAuthenticated])

  useEffect(() => {
    loadFavorites()
  }, [loadFavorites])

  const isFavorited = (tmdbId: number, mediaType: 'movie' | 'tv') =>
    favorites.some((f) => f.tmdbId === tmdbId && f.mediaType === mediaType)

  const toggleFavorite = async (tmdbId: number, mediaType: 'movie' | 'tv') => {
    if (!isAuthenticated) {
      toast.error('Please log in to add favorites')
      return
    }

    // Optimistic update - INSTANT UI FEEDBACK (0ms delay)
    // We don't wait for API, we don't debounce, we just update the state immediately.

    const existing = favorites.find(
      (f) => f.tmdbId === tmdbId && f.mediaType === mediaType
    )

    const tempId = `temp-${Date.now()}-${tmdbId}`

    // Apply strict optimistic update
    if (existing) {
      setFavorites((prev) => prev.filter((f) => f.id !== existing.id))
    } else {
      setFavorites((prev) => [{ id: tempId, tmdbId, mediaType }, ...prev])
    }

    // Background API Sync
    try {
      const headers = await getHeaders()

      if (existing) {
        // Remove from favorites with retry
        await retryWithBackoff(async () => {
          const res = await fetch(`${API_URL}/favorites/${existing.id}`, {
            method: 'DELETE',
            headers,
          })

          if (!res.ok) {
            if (res.status === 404) return // Already deleted
            const errorText = await res.text()
            const error: any = new Error(errorText)
            error.status = res.status
            throw error
          }

          return res
        })

        toast.success('Removed from favorites')
      } else {
        // Add to favorites with retry
        const newFav = await retryWithBackoff(async () => {
          const res = await fetch(`${API_URL}/favorites`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ tmdbId, mediaType }),
          })

          if (!res.ok) {
            const errorText = await res.text()
            const error: any = new Error(errorText)
            error.status = res.status
            throw error
          }

          return res.json()
        })

        // Replace temp ID with real ID from backend
        setFavorites((prev) =>
          prev.map((f) => (f.id === tempId ? newFav : f))
        )

        toast.success('Added to favorites')
      }
    } catch (err: any) {
      console.error('Favorite toggle failed:', err)

      // Rollback on error
      if (existing) {
        setFavorites((prev) => [existing, ...prev])
        toast.error('Failed to remove favorite')
      } else {
        setFavorites((prev) => prev.filter((f) => f.id !== tempId))
        toast.error('Failed to add favorite')
      }
    }
  }

  return {
    favorites,
    isFavorited,
    toggleFavorite,
  }
}
