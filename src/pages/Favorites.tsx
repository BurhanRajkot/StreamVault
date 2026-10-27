import { useMemo, useState } from 'react'
import { useNavigate, useLocation, useSearchParams, Link } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useAuth0 } from '@auth0/auth0-react'
import { Heart, AlertCircle, ArrowUpDown, Clock, Star, ArrowUpAZ } from 'lucide-react'
import { useFavorites } from '@/context/FavoritesContext'
import { Media, MODE_PATHS } from '@/lib/config'
import { fetchMediaSummaries } from '@/lib/api'
import { MediaGrid } from '@/components/media/MediaGrid'
import { Header } from '@/components/layout/Header'
import { MobileNav } from '@/mobile-ui/MobileNav'
import { PageMeta } from '@/seo/PageMeta'
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

const isMovie = (m: Media) => m.media_type === 'movie' || (m.title && !m.name)

const SORT_OPTIONS: { key: SortOption; label: string; icon: typeof Clock }[] = [
  { key: 'recent', label: 'Recently Added', icon: Clock },
  { key: 'alpha', label: 'A–Z', icon: ArrowUpAZ },
  { key: 'rating', label: 'Top Rated', icon: Star },
]

const pageGutter = 'mx-auto w-full max-w-[2560px] px-3 sm:px-6 xl:px-8 2xl:px-12 [@media(min-width:2000px)]:px-16'

const Favorites = () => {
  const { isAuthenticated, isLoading: authLoading, loginWithRedirect } = useAuth0()
  const { favorites } = useFavorites()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const [sortBy, setSortBy] = useState<SortOption>('recent')

  const activeTab = (searchParams.get('tab') as FilterTab) || 'all'
  const setActiveTab = (tab: FilterTab) => {
    setSearchParams((prev) => {
      if (tab === 'all') prev.delete('tab')
      else prev.set('tab', tab)
      return prev
    })
  }

  // The saved titles' artwork and ratings, in batched requests. Keyed on the
  // list itself, so adding or removing one refetches — while the previous
  // answer stays up, filtered to what's still saved (a removal is instant).
  const items = useMemo(() => favorites.map(({ tmdbId, mediaType }) => ({ tmdbId, mediaType })), [favorites])
  const {
    data,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['favorites-media', items.map((i) => `${i.mediaType}:${i.tmdbId}`)],
    queryFn: () => fetchMediaSummaries(items),
    enabled: isAuthenticated && items.length > 0,
    staleTime: 10 * 60 * 1000,
    placeholderData: keepPreviousData,
  })

  const media = useMemo(() => {
    const saved = new Set(items.map((i) => `${i.mediaType}:${i.tmdbId}`))
    return (data ?? []).filter((m) => saved.has(`${m.media_type}:${m.id}`))
  }, [data, items])

  const stats = useMemo(() => {
    const movies = media.filter(isMovie).length
    return { total: media.length, movies, tv: media.length - movies }
  }, [media])

  const filteredMedia = useMemo(() => {
    let list: Media[]
    if (activeTab === 'movie') list = media.filter(isMovie)
    else if (activeTab === 'tv') list = media.filter((m) => !isMovie(m))
    else list = media

    switch (sortBy) {
      case 'alpha':
        return [...list].sort((a, b) => (a.title || a.name || '').localeCompare(b.title || b.name || ''))
      case 'rating':
        return [...list].sort((a, b) => (b.vote_average || 0) - (a.vote_average || 0))
      case 'recent':
      default:
        return list
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
  const activeSort = SORT_OPTIONS.find((s) => s.key === sortBy) ?? SORT_OPTIONS[0]

  if (authLoading) return null

  const loading = isAuthenticated && isLoading
  const showControls = isAuthenticated && !loading && !isError && media.length > 0

  return (
    <>
      <PageMeta title="My Favorites" description="Your private list of saved movies and TV shows on StreamVault." noindex />

      <div className="flex min-h-screen flex-col">
        <Header
          onModeChange={(m) => navigate(MODE_PATHS[m])}
          // The header searches every title, not this list — the home page owns the results
          onSearch={(q) => navigate('/', { state: { search: q } })}
          searchQuery=""
          onClearSearch={() => {}}
          onLogoClick={() => navigate('/')}
        />
        <MobileNav
          mode="home"
          // Browsing modes live on the home page — carry the tap over to it
          onModeChange={(m) => navigate(MODE_PATHS[m])}
        />

        {/* Page header */}
        <div className="border-b border-border/50 pt-[var(--sv-header-h)]">
          <div className={`${pageGutter} py-4 sm:py-6`}>
            <div className="flex items-center gap-3">
              <Heart className="h-5 w-5 text-primary" fill="currentColor" />
              <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Favorites</h1>
              {showControls && (
                <span className="text-sm text-muted-foreground">
                  {stats.total} title{stats.total !== 1 ? 's' : ''}
                </span>
              )}
            </div>

            {/* Tabs + Sort */}
            {showControls && (
              <div className="mt-4 flex items-center gap-6">
                <nav className="flex gap-5" role="tablist">
                  {tabs.map(({ key, label, count }) => (
                    <button
                      key={key}
                      role="tab"
                      aria-selected={activeTab === key}
                      onClick={() => setActiveTab(key)}
                      className={`relative pb-1 text-sm font-medium transition-colors ${
                        activeTab === key ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {label}
                      {count > 0 && <span className="ml-1.5 text-xs text-muted-foreground">{count}</span>}
                      {activeTab === key && <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-foreground" />}
                    </button>
                  ))}
                </nav>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="ml-auto h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground">
                      <ArrowUpDown className="h-3 w-3" />
                      {activeSort.label}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    {SORT_OPTIONS.map(({ key, label, icon: Icon }) => (
                      <DropdownMenuItem key={key} onClick={() => setSortBy(key)} className="gap-2 text-sm">
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
        <main className={`${pageGutter} flex-1 py-4 pb-tabbar sm:py-6`}>
          {!isAuthenticated ? (
            <EmptyState
              title="Sign in to keep a list"
              body="Tap the heart on any movie or show to save it. Your list stays with your account, on every device you sign in on."
            >
              <Button onClick={() => loginWithRedirect({ appState: { returnTo: '/favorites' } })} size="sm">
                Sign in
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link to="/">Browse titles</Link>
              </Button>
            </EmptyState>
          ) : isError ? (
            <EmptyState
              icon={<AlertCircle className="h-5 w-5 text-destructive/70" />}
              title="Your list didn't load"
              body="Check your connection and try again."
            >
              <Button onClick={() => void refetch()} variant="outline" size="sm">
                Try again
              </Button>
            </EmptyState>
          ) : loading ? (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="aspect-[2/3] animate-pulse rounded-lg bg-muted md:rounded-xl" />
              ))}
            </div>
          ) : filteredMedia.length === 0 ? (
            <EmptyState
              title={activeTab !== 'all' ? `No ${activeTab === 'movie' ? 'movies' : 'TV shows'} yet` : 'Nothing saved yet'}
              body={
                activeTab !== 'all'
                  ? `Tap the heart on any ${activeTab === 'movie' ? 'movie' : 'show'} to add it.`
                  : 'Browse and tap the heart icon to save your favorites.'
              }
            >
              <Button onClick={() => navigate('/')} variant="outline" size="sm">
                Browse
              </Button>
            </EmptyState>
          ) : (
            <MediaGrid media={filteredMedia} isLoading={false} hasMore={false} onLoadMore={() => {}} onMediaClick={handleMediaClick} />
          )}
        </main>
      </div>
    </>
  )
}

function EmptyState({
  icon = <Heart className="h-5 w-5 text-muted-foreground/60" />,
  title,
  body,
  children,
}: {
  icon?: React.ReactNode
  title: string
  body: string
  children?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-20 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-border">{icon}</div>
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">{body}</p>
      {children && <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">{children}</div>}
    </div>
  )
}

export default Favorites
