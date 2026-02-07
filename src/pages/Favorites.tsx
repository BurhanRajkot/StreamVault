import { useEffect, useState } from 'react'
import { useFavorites } from '@/context/FavoritesContext'
import { Media } from '@/lib/config'
import { fetchMediaDetails } from '@/lib/api'
import { MediaGrid } from '@/components/MediaGrid'
import { useAuth0 } from '@auth0/auth0-react'
import { Helmet } from 'react-helmet-async'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'

const Favorites = () => {
  const { isAuthenticated, loginWithRedirect } = useAuth0()
  const { favorites } = useFavorites()
  const navigate = useNavigate()

  const [media, setMedia] = useState<Media[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!isAuthenticated) {
      loginWithRedirect()
      return
    }

    const loadFavorites = async () => {
      setLoading(true)

      const results = await Promise.all(
        favorites.map((fav) => fetchMediaDetails(fav.mediaType, fav.tmdbId))
      )

      setMedia(results.filter(Boolean) as Media[])
      setLoading(false)
    }

    loadFavorites()
  }, [favorites, isAuthenticated])

  return (
    <>
      <Helmet>
        <title>My Favorites • StreamVault</title>
      </Helmet>

      <div className="container py-6">
        {/* Back Button */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/')}
          className="mb-4 flex items-center gap-2 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>

        <h1 className="mb-6 text-2xl font-bold">My Favorites</h1>

        {media.length === 0 && !loading ? (
          <p className="text-muted-foreground">
            You haven’t added any favorites yet.
          </p>
        ) : (
          <MediaGrid
            media={media}
            isLoading={loading}
            hasMore={false}
            onLoadMore={() => {}}
            onMediaClick={(media) =>
              navigate(`/watch/${media.title ? 'movie' : 'tv'}/${media.id}`)
            }
          />
        )}
      </div>
    </>
  )
}

export default Favorites
