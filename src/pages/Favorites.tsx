import { useEffect, useMemo, useState } from 'react'
import { useFavorites } from '@/context/FavoritesContext'
import { Media } from '@/lib/config'
import { fetchMediaDetails } from '@/lib/api'
import { MediaCard } from '@/components/MediaCard'
import { MediaGrid } from '@/components/MediaGrid'
import { Header } from '@/components/Header'
import { MobileNav } from '@/mobile-ui/MobileNav'
import { useAuth0 } from '@auth0/auth0-react'
import { PageMeta } from '@/seo/PageMeta'
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom'
import { Heart, Tv, AlertCircle, ArrowUpDown, Clock, Star, ArrowUpAZ } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { slugify } from '@/lib/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

type FilterTab = 'all' | 'movie' | 'tv'
type SortOption = 'recent' | 'alpha' | 'rating'

const isMovie = (m: Media) =>
  m.media_type === 'movie' || (m.title && !m.name)

const Favorites = () => {
  const { isAuthenticated, isLoading: authLoading, loginWithRedirect } = useAuth0()
  const { favorites } = useFavorites()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()

  const [media, setMedia] = useState<Media[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sortBy, setSortBy] = useState<SortOption>('recent')

  const activeTab = (searchParams.get('tab') as FilterTab) || 'all'
  const setActiveTab = (tab: FilterTab) => {
    setSearchParams((prev) => {
      if (tab === 'all') prev.delete('tab')
      else prev.set('tab', tab)
      return prev
    })
  }

  useEffect(() => {
    if (authLoading) return

    if (!isAuthenticated) {
      loginWithRedirect()
      return
    }

    let cancelled = false

    const loadFavorites = async () => {
      setLoading(true)
      setError(null)

      try {
        const results = await Promise.all(
          favorites.map((fav) => fetchMediaDetails(fav.mediaType, fav.tmdbId))
        )

        if (!cancelled) {
          setMedia(results.filter(Boolean) as Media[])
        }
      } catch {
        if (!cancelled) {
          setError('Failed to load your favorites. Please try again.')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadFavorites()

    return () => {
      cancelled = true
    }
  }, [favorites, isAuthenticated, authLoading, loginWithRedirect])

  const stats = useMemo(() => {
    const movies = media.filter(isMovie).length
    return {
      total: media.length,
      movies,
      tv: media.length - movies,
    }
  }, [media])

  const filteredMedia = useMemo(() => {
    let items: Media[]
    if (activeTab === 'movie') items = media.filter(isMovie)
    else if (activeTab === 'tv') items = media.filter((m) => !isMovie(m))
    else items = media

    switch (sortBy) {
      case 'alpha':
        return [...items].sort((a, b) => (a.title || a.name || '').localeCompare(b.title || b.name || ''))
      case 'rating':
        return [...items].sort((a, b) => (b.vote_average || 0) - (a.vote_average || 0))
      case 'recent':
      default:
        return items
    }
  }, [media, activeTab, sortBy])

  const handleMediaClick = (item: Media) => {
    const type = isMovie(item) ? 'movie' : 'tv'
    const slug = slugify(item.title || item.name || '')
    navigate(`/watch/${type}/${item.id}-${slug}`, { state: { backgroundLocation: location } })
  }

  const tabs: { key: FilterTab; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: stats.total },
    { key: 'movie', label: 'Movies', count: stats.movies },
    { key: 'tv', label: 'TV Shows', count: stats.tv },
  ]

  const sortOptions: { key: SortOption; label: string; icon: typeof Clock }[] = [
    { key: 'recent', label: 'Recently Added', icon: Clock },
    { key: 'alpha', label: 'A–Z', icon: ArrowUpAZ },
    { key: 'rating', label: 'Top Rated', icon: Star },
  ]
  const activeSort = sortOptions.find((s) => s.key === sortBy)!

  return (
    <>
      <PageMeta
        title="My Favorites"
        description="Your private list of saved movies and TV shows on StreamVault."
        noindex
      />

      <div className="flex min-h-screen flex-col">
        <Header
          mode="home"
          onModeChange={() => navigate('/')}
          onSearch={() => {}}
          searchQuery=""
          onClearSearch={() => {}}
          onLogoClick={() => navigate('/')}
        />
        <MobileNav mode="home" onModeChange={() => navigate('/')} />

        {/* Page header */}
        <div className="border-b border-border/50 pt-[72px]">
          <div className="mx-auto w-full max-w-[2560px] px-3 sm:px-6 xl:px-8 2xl:px-12 [@media(min-width:2000px)]:px-16 py-6">
            <div className="flex items-center gap-3">
              <Heart className="h-5 w-5 text-primary" fill="currentColor" />
              <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
                Favorites
              </h1>
              {!loading && (
                <span className="text-sm text-muted-foreground">
                  {stats.total} title{stats.total !== 1 ? 's' : ''}
                </span>
              )}
            </div>

            {/* Tabs + Sort */}
            {!loading && !error && media.length > 0 && (
              <div className="mt-4 flex items-center gap-6">
                <nav className="flex gap-5" role="tablist">
                  {tabs.map(({ key, label, count }) => (
                    <button
                      key={key}
                      role="tab"
                      aria-selected={activeTab === key}
                      onClick={() => setActiveTab(key)}
                      className={`relative pb-1 text-sm font-medium transition-colors ${
                        activeTab === key
                          ? 'text-foreground'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {label}
                      {count > 0 && (
                        <span className="ml-1.5 text-xs text-muted-foreground">
                          {count}
                        </span>
                      )}
                      {activeTab === key && (
                        <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-foreground rounded-full" />
                      )}
                    </button>
                  ))}
                </nav>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="ml-auto h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                    >
                      <ArrowUpDown className="h-3 w-3" />
                      {activeSort.label}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    {sortOptions.map(({ key, label, icon: Icon }) => (
                      <DropdownMenuItem
                        key={key}
                        onClick={() => setSortBy(key)}
                        className="gap-2 text-sm"
                      >
                        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                        {label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}
          </div>
        </div>

        {/* Content */}
        <main className="mx-auto w-full max-w-[2560px] px-3 sm:px-6 xl:px-8 2xl:px-12 [@media(min-width:2000px)]:px-16 py-6 flex-1">
          {error ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-full border border-destructive/20">
                <AlertCircle className="h-5 w-5 text-destructive/70" />
              </div>
              <p className="text-sm text-muted-foreground">{error}</p>
              <Button
                onClick={() => {
                  setError(null)
                  setLoading(true)
                  Promise.all(
                    favorites.map((fav) => fetchMediaDetails(fav.mediaType, fav.tmdbId))
                  )
                    .then((results) => {
                      setMedia(results.filter(Boolean) as Media[])
                      setError(null)
                    })
                    .catch(() => setError('Failed to load your favorites. Please try again.'))
                    .finally(() => setLoading(false))
                }}
                variant="outline"
                size="sm"
                className="mt-4"
              >
                Try Again
              </Button>
            </div>
          ) : loading ? (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8">
              {Array.from({ length: 12 }).map((_, i) => (
                <div
                  key={i}
                  className="aspect-[2/3] animate-pulse rounded-lg md:rounded-xl bg-muted"
                />
              ))}
            </div>
          ) : filteredMedia.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-border">
                <Heart className="h-5 w-5 text-muted-foreground/50" />
              </div>
              <h3 className="text-sm font-medium text-foreground">
                {activeTab !== 'all'
                  ? `No ${activeTab === 'movie' ? 'movies' : 'TV shows'} yet`
                  : 'Nothing saved yet'}
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {activeTab !== 'all'
                  ? `Tap the heart on any ${activeTab === 'movie' ? 'movie' : 'show'} to add it.`
                  : 'Browse and tap the heart icon to save your favorites.'}
              </p>
              <Button
                onClick={() => navigate('/')}
                variant="outline"
                size="sm"
                className="mt-5"
              >
                Browse
              </Button>
            </div>
          ) : (
            <MediaGrid
              media={filteredMedia}
              isLoading={loading}
              hasMore={false}
              onLoadMore={() => {}}
              onMediaClick={handleMediaClick}
            />
          )}
        </main>
      </div>
    </>
  )
}

export default Favorites
