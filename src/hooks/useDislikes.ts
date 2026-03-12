import { useAuth0 } from '@auth0/auth0-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

const API_URL = import.meta.env.VITE_API_URL || 'https://streamvault-backend-bq9p.onrender.com'

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
  // Track in-flight requests to prevent race conditions from rapid double-clicks
  const pendingRef = useRef<Set<string>>(new Set())

  const getHeaders = useCallback(async () => {
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
  }, [getAccessTokenSilently])

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
  }, [isAuthenticated, getHeaders])

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

    // Prevent rapid double-clicks from sending concurrent requests for the same item
    const pendingKey = `${mediaType}:${tmdbId}`
    if (pendingRef.current.has(pendingKey)) return
    pendingRef.current.add(pendingKey)

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
            if (res.status === 404) return // Already deleted — treat as success
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

          // 200 means the backend found an existing record (idempotent) — still a success
          // 201 means freshly created — both return the dislike object
          if (res.status === 200 || res.status === 201) {
            return res.json()
          }

          const errorText = await res.text()
          const error: any = new Error(errorText)
          error.status = res.status
          throw error
        })

        // Replace temp ID with real ID from backend
        setDislikes((prev) =>
          prev.map((d) => (d.id === tempId ? newDislike : d))
        )

        toast.success("We'll show you less of this")
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
    } finally {
      // Always clear the in-flight guard when done
      pendingRef.current.delete(pendingKey)
    }
  }

  return {
    dislikes,
    isDisliked,
    toggleDislike,
  }
}
