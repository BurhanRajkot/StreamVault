import { useAuth0 } from '@auth0/auth0-react'
import { useCallback, useEffect, useState, useRef } from 'react'
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
  const [loading, setLoading] = useState(false)
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set())

  // Debounce map to prevent rapid successive calls
  const debounceTimers = useRef<Map<string, NodeJS.Timeout>>(new Map())

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

  const isProcessing = (tmdbId: number, mediaType: 'movie' | 'tv') => {
    const key = `${tmdbId}-${mediaType}`
    return processingIds.has(key)
  }

  const toggleFavorite = async (tmdbId: number, mediaType: 'movie' | 'tv') => {
    if (!isAuthenticated) {
      toast.error('Please log in to add favorites')
      return
    }

    const key = `${tmdbId}-${mediaType}`

    // Prevent double-clicks
    if (processingIds.has(key)) {
      return
    }

    // Clear any existing debounce timer for this item
    const existingTimer = debounceTimers.current.get(key)
    if (existingTimer) {
      clearTimeout(existingTimer)
    }

    // Debounce: wait 300ms before actually making the API call
    const timer = setTimeout(async () => {
      debounceTimers.current.delete(key)

      setProcessingIds(prev => new Set(prev).add(key))

      const existing = favorites.find(
        (f) => f.tmdbId === tmdbId && f.mediaType === mediaType
      )

      const tempId = `temp-${Date.now()}-${tmdbId}`

      // Optimistic update - instant UI feedback
      if (existing) {
        setFavorites((prev) => prev.filter((f) => f.id !== existing.id))
      } else {
        setFavorites((prev) => [{ id: tempId, tmdbId, mediaType }, ...prev])
      }

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
        } else {
          setFavorites((prev) => prev.filter((f) => f.id !== tempId))
        }

        // User-friendly error messages
        if (err.message?.includes('429') || err.status === 429) {
          toast.error('Too many requests. Please wait a moment and try again.')
        } else {
          toast.error('Failed to update favorites. Please try again.')
        }
      } finally {
        setProcessingIds(prev => {
          const next = new Set(prev)
          next.delete(key)
          return next
        })
      }
    }, 300)

    debounceTimers.current.set(key, timer)
  }

  // Cleanup debounce timers on unmount
  useEffect(() => {
    return () => {
      debounceTimers.current.forEach(timer => clearTimeout(timer))
      debounceTimers.current.clear()
    }
  }, [])

  return {
    favorites,
    loading,
    isFavorited,
    isProcessing,
    toggleFavorite,
  }
}
