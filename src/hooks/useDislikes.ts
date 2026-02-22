import { useAuth0 } from '@auth0/auth0-react'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000'

export interface DislikeItem {
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

export function useDislikesInternal() {
  const { isAuthenticated, getAccessTokenSilently } = useAuth0()
  const [dislikes, setDislikes] = useState<DislikeItem[]>([])

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

  const loadDislikes = useCallback(async () => {
    if (!isAuthenticated) {
      setDislikes([])
      return
    }

    try {
      const headers = await getHeaders()
      const res = await fetch(`${API_URL}/dislikes`, { headers })

      if (!res.ok) {
        throw new Error(await res.text())
      }

      const data = await res.json()
      setDislikes(data)
    } catch (err) {
      console.error('Failed to load dislikes:', err)
      setDislikes([])
    }
  }, [isAuthenticated])

  useEffect(() => {
    loadDislikes()
  }, [loadDislikes])

  const isDisliked = (tmdbId: number, mediaType: 'movie' | 'tv') =>
    dislikes.some((d) => d.tmdbId === tmdbId && d.mediaType === mediaType)

  const toggleDislike = async (tmdbId: number, mediaType: 'movie' | 'tv') => {
    if (!isAuthenticated) {
      toast.error('Please log in to use thumbs down')
      return
    }

    // Optimistic update
    const existing = dislikes.find(
      (d) => d.tmdbId === tmdbId && d.mediaType === mediaType
    )

    const tempId = `temp-${Date.now()}-${tmdbId}`

    if (existing) {
      setDislikes((prev) => prev.filter((d) => d.id !== existing.id))
    } else {
      setDislikes((prev) => [{ id: tempId, tmdbId, mediaType }, ...prev])
    }

    // Background API Sync
    try {
      const headers = await getHeaders()

      if (existing) {
        // Reverse a dislike
        await retryWithBackoff(async () => {
          const res = await fetch(`${API_URL}/dislikes/${mediaType}/${tmdbId}`, {
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

        toast.success('Removed from disliked')
      } else {
        // Add a dislike
        const newDislike = await retryWithBackoff(async () => {
          const res = await fetch(`${API_URL}/dislikes`, {
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
        setDislikes((prev) =>
          prev.map((d) => (d.id === tempId ? newDislike : d))
        )

        toast.success('We\'ll show you less of this')
      }
    } catch (err: any) {
      console.error('Dislike toggle failed:', err)

      // Rollback on error
      if (existing) {
        setDislikes((prev) => [existing, ...prev])
        toast.error('Failed to undo dislike')
      } else {
        setDislikes((prev) => prev.filter((d) => d.id !== tempId))
        toast.error('Failed to log dislike')
      }
    }
  }

  return {
    dislikes,
    isDisliked,
    toggleDislike,
  }
}
