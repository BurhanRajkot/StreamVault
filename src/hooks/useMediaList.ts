import { useAuth0 } from '@auth0/auth0-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000'

export interface MediaItem {
  id: string
  tmdbId: number
  mediaType: 'movie' | 'tv'
}

// Retry utility with exponential backoff
export async function retryWithBackoff<T>(
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
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }

  throw lastError || new Error('Max retries exceeded')
}

interface UseMediaListOptions {
  endpoint: string
  unauthenticatedMessage: string
  messages: {
    addSuccess: string
    removeSuccess: string
    addError: string
    removeError: string
  }
  onAddSuccess?: (tmdbId: number, mediaType: 'movie' | 'tv', genreIds?: number[]) => void
  /** Auth0 user.sub — include so different accounts never share the same in-memory list */
  userId?: string | null
}

export function useMediaList({
  endpoint,
  unauthenticatedMessage,
  messages,
  onAddSuccess,
  userId,
}: UseMediaListOptions) {
  const { isAuthenticated, getAccessTokenSilently } = useAuth0()
  const [items, setItems] = useState<MediaItem[]>([])

  // When the logged-in user changes (e.g. friend logs in on same browser),
  // wipe the list immediately so the old user's data is never visible.
  useEffect(() => {
    setItems([])
  }, [userId])

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

  const loadItems = useCallback(async () => {
    if (!isAuthenticated) {
      setItems([])
      return
    }

    try {
      const headers = await getHeaders()
      const res = await fetch(`${API_URL}/${endpoint}`, { headers })

      if (!res.ok) {
        throw new Error(await res.text())
      }

      const data = await res.json()
      setItems(data)
    } catch (err) {
      console.error(`Failed to load ${endpoint}:`, err)
      setItems([])
    }
  // userId is intentionally included: if the account changes, we must re-fetch
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, getHeaders, endpoint, userId])

  useEffect(() => {
    loadItems()
  }, [loadItems])

  // O(1) lookup map for items
  const itemsMap = useMemo(() => {
    const map = new Map<string, MediaItem>()
    items.forEach((item) => map.set(`${item.mediaType}:${item.tmdbId}`, item))
    return map
  }, [items])

  const hasItem = useCallback(
    (tmdbId: number, mediaType: 'movie' | 'tv') => {
      return itemsMap.has(`${mediaType}:${tmdbId}`)
    },
    [itemsMap]
  )

  const toggleItem = async (
    tmdbId: number,
    mediaType: 'movie' | 'tv',
    genreIds?: number[]
  ) => {
    if (!isAuthenticated) {
      toast.error(unauthenticatedMessage)
      return
    }

    // Prevent rapid double-clicks from sending concurrent requests for the same item
    const pendingKey = `${mediaType}:${tmdbId}`
    if (pendingRef.current.has(pendingKey)) return
    pendingRef.current.add(pendingKey)

    // Optimistic update
    const existing = itemsMap.get(pendingKey)
    const tempId = `temp-${Date.now()}-${tmdbId}`

    if (existing) {
      setItems((prev) => prev.filter((item) => item.id !== existing.id))
    } else {
      setItems((prev) => [{ id: tempId, tmdbId, mediaType }, ...prev])
    }

    // Background API Sync
    try {
      const headers = await getHeaders()

      if (existing) {
        // Reverse an action
        await retryWithBackoff(async () => {
          // DELETE endpoints for some items are `/favorites/:id` and for some are `/dislikes/:mediaType/:tmdbId`
          // Let's check what the API calls are in the originals:
          // Dislikes: fetch(`${API_URL}/dislikes/${mediaType}/${tmdbId}`, { method: 'DELETE' })
          // Favorites: fetch(`${API_URL}/favorites/${existing.id}`, { method: 'DELETE' })

          // Using `/${endpoint}/${mediaType}/${tmdbId}` or `/${endpoint}/${existing.id}`
          // We need to resolve this difference.
          const deleteUrl = endpoint === 'favorites'
            ? `${API_URL}/${endpoint}/${existing.id}`
            : `${API_URL}/${endpoint}/${mediaType}/${tmdbId}`;

          const res = await fetch(deleteUrl, {
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

        toast.success(messages.removeSuccess)
      } else {
        // Add an item
        const newItem = await retryWithBackoff(async () => {
          const res = await fetch(`${API_URL}/${endpoint}`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ tmdbId, mediaType }),
          })

          if (res.status === 200 || res.status === 201) {
            return res.json()
          }

          const errorText = await res.text()
          const error: any = new Error(errorText)
          error.status = res.status
          throw error
        })

        // Replace temp ID with real ID from backend
        setItems((prev) =>
          prev.map((item) => (item.id === tempId ? newItem : item))
        )

        // Run side-effect on successful add
        if (onAddSuccess) {
          onAddSuccess(tmdbId, mediaType, genreIds)
        }

        toast.success(messages.addSuccess)
      }
    } catch (err: any) {
      console.error(`${endpoint} toggle failed:`, err)

      // Rollback on error
      if (existing) {
        setItems((prev) => [existing, ...prev])
        toast.error(messages.removeError)
      } else {
        setItems((prev) => prev.filter((item) => item.id !== tempId))
        toast.error(messages.addError)
      }
    } finally {
      // Always clear the in-flight guard when done
      pendingRef.current.delete(pendingKey)
    }
  }

  return {
    items,
    hasItem,
    toggleItem,
  }
}
