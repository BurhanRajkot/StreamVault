import { useAuth0 } from '@auth0/auth0-react'
import { useCallback, useEffect, useState } from 'react'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000'

export interface Favorite {
  id: string
  tmdbId: number
  mediaType: 'movie' | 'tv'
}

export function useFavoritesInternal() {
  const { isAuthenticated, getAccessTokenSilently } = useAuth0()
  const [favorites, setFavorites] = useState<Favorite[]>([])
  const [loading, setLoading] = useState(false)

  const getHeaders = async () => {
    const token = await getAccessTokenSilently()
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

    const headers = await getHeaders()
    const res = await fetch(`${API_URL}/favorites`, { headers })
    const data = await res.json()
    setFavorites(data)
  }, [isAuthenticated])

  useEffect(() => {
    loadFavorites()
  }, [loadFavorites])

  const isFavorited = (tmdbId: number, mediaType: 'movie' | 'tv') =>
    favorites.some((f) => f.tmdbId === tmdbId && f.mediaType === mediaType)

  const toggleFavorite = async (tmdbId: number, mediaType: 'movie' | 'tv') => {
    if (!isAuthenticated) return
    setLoading(true)

    const headers = await getHeaders()
    const existing = favorites.find(
      (f) => f.tmdbId === tmdbId && f.mediaType === mediaType
    )

    if (existing) {
      await fetch(`${API_URL}/favorites/${existing.id}`, {
        method: 'DELETE',
        headers,
      })
      setFavorites((prev) => prev.filter((f) => f.id !== existing.id))
    } else {
      const res = await fetch(`${API_URL}/favorites`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ tmdbId, mediaType }),
      })

      if (res.ok) {
        const newFav = await res.json()
        setFavorites((prev) => [newFav, ...prev])
      }
    }

    setLoading(false)
  }

  return {
    favorites,
    loading,
    isFavorited,
    toggleFavorite,
  }
}
