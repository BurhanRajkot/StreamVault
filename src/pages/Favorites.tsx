import { useCallback, useEffect, useMemo, useState } from 'react'
import { useFavorites } from '@/context/FavoritesContext'
import { Media } from '@/lib/config'
import { fetchMediaDetails } from '@/lib/api'
import { MediaGrid } from '@/components/MediaGrid'
import { Header } from '@/components/Header'
import { MobileNav } from '@/mobile-ui/MobileNav'
import { useAuth0 } from '@auth0/auth0-react'
import { PageMeta } from '@/seo/PageMeta'
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Heart, Film, Tv, Sparkles, AlertCircle, ArrowUpDown, Clock, Star, ArrowUpAZ } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { slugify } from '@/lib/utils'
import { motion } from 'framer-motion'
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

  const tabs: { key: FilterTab; label: string; icon: typeof Film; count: number }[] = [
    { key: 'all', label: 'All', icon: Heart, count: stats.total },
    { key: 'movie', label: 'Movies', icon: Film, count: stats.movies },
    { key: 'tv', label: 'TV Shows', icon: Tv, count: stats.tv },
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

        {/* Hero Header */}
        <div className="relative overflow-hidden pt-[72px]">
          <div className="absolute inset-0 bg-gradient-to-b from-primary/8 via-transparent to-transparent" />
          <div className="absolute -right-32 -top-32 h-96 w-96 rounded-full bg-primary/5 blur-3xl" />
          <div className="absolute -left-24 top-12 h-64 w-64 rounded-full bg-accent/5 blur-3xl" />

          <div className="relative container py-8 sm:py-12">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/')}
              className="mb-6 flex items-center gap-2 text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Browse
            </Button>

            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div className="flex items-start gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20 ring-1 ring-primary/20">
                  <Heart className="h-7 w-7 text-primary" fill="currentColor" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                    My Favorites
                  </h1>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {loading
                      ? 'Loading your collection...'
                      : `${stats.total} title${stats.total !== 1 ? 's' : ''} saved`}
                  </p>
                </div>
              </div>
            </div>

            {/* Filter Tabs + Sort */}
            {!loading && !error && media.length > 0 && (
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <div className="flex gap-2">
                  {tabs.map(({ key, label, icon: Icon, count }) => (
                    <button
                      key={key}
                      role="tab"
                      aria-pressed={activeTab === key}
                      onClick={() => setActiveTab(key)}
                      className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-all ${
                        activeTab === key
                          ? 'bg-primary/10 text-foreground ring-1 ring-primary/20 backdrop-blur-sm'
                          : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground'
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      {label}
                      {count > 0 && (
                        <span
                          className={`ml-1 rounded-full px-2 py-0.5 text-xs ${
                            activeTab === key
                              ? 'bg-primary/20 text-primary'
                              : 'bg-muted text-muted-foreground'
                          }`}
                        >
                          {count}
                        </span>
                      )}
                    </button>
                  ))}
                </div>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="ml-auto h-9 gap-2 rounded-full border-border/50 text-sm"
                    >
                      <ArrowUpDown className="h-3.5 w-3.5" />
                      {activeSort.label}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    {sortOptions.map(({ key, label, icon: Icon }) => (
                      <DropdownMenuItem
                        key={key}
                        onClick={() => setSortBy(key)}
                        className="gap-2"
                      >
                        <Icon className="h-4 w-4" />
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
        <main className="w-full flex-1 px-2 pb-8 sm:px-4">
          {error ? (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center justify-center py-16 text-center"
            >
              <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-destructive/10">
                <AlertCircle className="h-10 w-10 text-destructive" />
              </div>
              <h3 className="text-lg font-semibold text-foreground">Something went wrong</h3>
              <p className="mt-2 max-w-sm text-sm text-muted-foreground">{error}</p>
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
                className="mt-6 rounded-full"
                variant="destructive"
              >
                Try Again
              </Button>
            </motion.div>
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
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center justify-center py-16 text-center"
            >
              <div className="relative mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-muted/50">
                <Heart className="h-10 w-10 text-muted-foreground/60" />
                <Sparkles className="absolute -right-1 -top-1 h-5 w-5 text-primary/40" />
              </div>
              <h3 className="text-lg font-semibold text-foreground">
                {activeTab !== 'all'
                  ? `No ${activeTab === 'movie' ? 'movies' : 'TV shows'} saved yet`
                  : 'Your collection is empty'}
              </h3>
              <p className="mt-2 max-w-sm text-sm text-muted-foreground">
                {activeTab !== 'all'
                  ? `Browse and tap the heart icon on any ${activeTab === 'movie' ? 'movie' : 'show'} to add it here.`
                  : 'Start exploring and save your favorite movies and TV shows by tapping the heart icon.'}
              </p>
              <Button
                onClick={() => navigate('/')}
                className="mt-6 rounded-full"
              >
                Browse Now
              </Button>
            </motion.div>
          ) : (
            <motion.div
              key={`${activeTab}-${sortBy}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3 }}
            >
              <MediaGrid
                media={filteredMedia}
                isLoading={false}
                hasMore={false}
                onLoadMore={() => {}}
                onMediaClick={handleMediaClick}
              />
            </motion.div>
          )}
        </main>
      </div>
    </>
  )
}

export default Favorites
