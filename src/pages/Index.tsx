import { useState, useCallback, lazy } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { PageMeta } from '@/seo/PageMeta'
import { Media, MediaMode } from '@/lib/config'
import { useMedia } from '@/hooks/useMedia'
import { useInView } from '@/hooks/useInView'
import { Header } from '@/components/Header'
import { MobileNav } from '@/mobile-ui/MobileNav'
import { HeroCarousel } from '@/components/HeroCarousel'
import { MediaGrid } from '@/components/MediaGrid'
import { DisclaimerModal } from '@/components/DisclaimerModal'
import { Footer } from '@/components/Footer'
import { AuthorsChoiceSection } from '@/components/AuthorsChoiceSection'
import { ContinueWatchingSection } from '@/components/ContinueWatchingSection'
import { PlatformSelector } from '@/components/PlatformSelector'
import { RecentlyAddedSection } from '@/components/RecentlyAddedSection'
import { RecommendationRow } from '@/components/RecommendationRow'
import { MovieDetailModal } from '@/components/MovieDetailModal'
import { useRecommendations } from '@/hooks/useRecommendations'
import { logRecommendationInteraction, RecoItem } from '@/lib/api'
import { useAuth0 } from '@auth0/auth0-react'
import { slugify } from '@/lib/utils'
import { CineMatchOnboarding } from '@/components/CineMatchOnboarding'
import { useOnboarding } from '@/hooks/useOnboarding'
import { useContextualRecommendations } from '@/hooks/useContextualRecommendations'
import { SEOContent } from '../components/SEOContent'

const Downloads = lazy(() => import('./Downloads'))

const Index = () => {
  const [mode, setMode] = useState<MediaMode>('home')
  const [showDisclaimer, setShowDisclaimer] = useState(
    () => sessionStorage.getItem('disclaimerAccepted') !== 'true'
  )
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null)
  const [refreshKey] = useState(0)

  const location = useLocation()
  const navigate = useNavigate()
  const { isAuthenticated, getAccessTokenSilently } = useAuth0()

  // ─── CineMatch Onboarding (first-time users only) ────────────────────────
  const { shouldShowOnboarding, markDone } = useOnboarding()

  // ─── Guest contextual "Because you watched X" row ───────────────────────────
  // For authenticated users, the backend pipeline handles this.
  // For guests, we build it client-side from localStorage watch history.
  const { section: guestContextualSection } = useContextualRecommendations()

  // ─── InView gates for below-fold sections ───────────────────────────────
  // Each section only mounts/fetches once it scrolls near the viewport
  const [authorsRef, authorsVisible] = useInView('200px')
  const [recoRef, recoVisible] = useInView('200px')
  const [recentlyRef, recentlyVisible] = useInView('200px')
  const { sections: recoSections, isLoading: recoLoading, refresh: refreshRecommendations } = useRecommendations(recoVisible)

  const {
    media,
    trending,
    isLoading,
    hasMore,
    loadMore,
    search,
    clearSearch,
    searchQuery,
  } = useMedia(mode, selectedProvider)

  const handleMediaClick = useCallback((media: Media, season?: number, episode?: number, server?: string, forceAutoPlay?: boolean) => {
    const detectedMode: MediaMode = media.title ? 'movie' : 'tv'
    const slug = slugify(media.title || media.name || '')
    const url = `/watch/${detectedMode}/${media.id}${slug ? '-' + slug : ''}`

    navigate(url, { state: { season, episode, server, autoPlay: forceAutoPlay, backgroundLocation: location } })
  }, [location, navigate])

  const handleLogoClick = () => {
    setMode('home')
    setSelectedProvider(null)
    clearSearch()
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // Handle click on a CineMatch recommendation card
  const handleRecoCardClick = useCallback(async (item: RecoItem, index: number, source: string) => {
    const mediaForPlayer: Media = {
      id: item.tmdbId,
      title: item.mediaType === 'movie' ? item.title : undefined,
      name: item.mediaType === 'tv' ? item.title : undefined,
      poster_path: item.posterPath ?? '',
      backdrop_path: item.backdropPath ?? '',
      overview: item.overview,
      vote_average: item.voteAverage,
      release_date: item.mediaType === 'movie' ? item.releaseDate : undefined,
      first_air_date: item.mediaType === 'tv' ? item.releaseDate : undefined,
      genres: item.genreIds.map(id => ({ id, name: '' })),
      media_type: item.mediaType,
    }
    handleMediaClick(mediaForPlayer)

    // Fire click interaction for real-time recommendation adaptation
    if (isAuthenticated) {
      try {
        const token = await getAccessTokenSilently()
        logRecommendationInteraction(token, {
          tmdbId: item.tmdbId,
          mediaType: item.mediaType,
          eventType: 'click',
          displayPosition: index,
          recommendationSource: source,
        })
      } catch { /* non-critical */ }
    }
  }, [isAuthenticated, getAccessTokenSilently, handleMediaClick])

  // Handle dislike on a recommendation card
  const handleRecoDislike = useCallback(async (item: RecoItem) => {
    if (!isAuthenticated) return
    try {
      const token = await getAccessTokenSilently()
      logRecommendationInteraction(token, {
        tmdbId: item.tmdbId,
        mediaType: item.mediaType,
        eventType: 'dislike',
      })
    } catch { /* non-critical */ }
  }, [isAuthenticated, getAccessTokenSilently])

  return (
    <>
      {/* CineMatch Onboarding — first-time users only, full-screen portal overlay */}
      {shouldShowOnboarding && (
        <CineMatchOnboarding onComplete={() => {
          markDone()
          refreshRecommendations()
        }} />
      )}
      <PageMeta
        title="Watch Movies, TV Shows & Anime"
        description="StreamVault — Browse thousands of movies, TV shows, and anime. Stream instantly for free with no sign-up."
      />

      <div className="flex min-h-screen flex-col">
        <Header
          mode={mode}
          onModeChange={setMode}
          onSearch={search}
          searchQuery={searchQuery}
          onClearSearch={clearSearch}
          onLogoClick={handleLogoClick}
        />
        <MobileNav mode={mode} onModeChange={setMode} />

        {/* WIDER CONTAINER FOR LARGE MONITORS */}
        <main className="w-full flex-1 px-2 pt-[72px] pb-2 sm:px-4">
          {mode === 'downloads' ? (
            <Downloads />
          ) : (
            <>
              {!searchQuery && (
                <div className="-mt-[72px]">
                  <HeroCarousel
                    items={trending}
                    onMediaClick={handleMediaClick}
                  />
                </div>
              )}

              {/* OTT Provider Selector */}
              {!searchQuery && (
                  <PlatformSelector
                      selected={selectedProvider}
                      onSelect={setSelectedProvider}
                  />
              )}

              {/* Continue Watching — above the fold, render immediately */}
              {!searchQuery && !selectedProvider && (
                <ContinueWatchingSection
                  onMediaClick={handleMediaClick}
                  refreshKey={refreshKey}
                />
              )}

              {/* Author's Choice — lazy: only renders when scrolled near */}
              <div ref={authorsRef} className="below-fold-section">
                {!searchQuery && authorsVisible && (
                  <AuthorsChoiceSection
                    onMediaClick={handleMediaClick}
                    mode={mode as 'movie' | 'tv' | 'documentary'}
                  />
                )}
              </div>

              {/* CineMatch AI — lazy: only renders when scrolled near */}
              <div ref={recoRef} className="below-fold-section">
                {!searchQuery && recoVisible && (
                  <>
                    {/* Guest contextual row — shown before generic sections */}
                    {!isAuthenticated && guestContextualSection && (
                      <RecommendationRow
                        key={guestContextualSection.title}
                        section={guestContextualSection}
                        onCardClick={handleRecoCardClick}
                        onDislike={undefined}
                        isLoading={false}
                      />
                    )}
                    {/* CineMatch sections (personalized for auth, trending for guest) */}
                    {(recoLoading ? [
                      { title: 'Recommended For You', items: [], source: 'personal' as const },
                      { title: 'Because You Watched...', items: [], source: 'tmdb_similar' as const },
                    ] : recoSections).map((section) => (
                      <RecommendationRow
                        key={section.title}
                        section={section}
                        onCardClick={handleRecoCardClick}
                        onDislike={isAuthenticated ? handleRecoDislike : undefined}
                        isLoading={recoLoading}
                      />
                    ))}
                  </>
                )}
              </div>

              {/* Recently Added — lazy, only when provider selected */}
              <div ref={recentlyRef}>
                {!searchQuery && selectedProvider && recentlyVisible && (
                  <RecentlyAddedSection
                    mode={mode}
                    providerId={selectedProvider || null}
                    onMediaClick={handleMediaClick}
                  />
                )}
              </div>

              <MediaGrid
                media={media}
                isLoading={isLoading}
                hasMore={hasMore}
                onLoadMore={loadMore}
                onMediaClick={handleMediaClick}
              />
            </>
          )}

          {/* SEO Content & H1 Tag (Visually placed at the bottom to not disrupt the UI, but scannable by bots) */}
          {!searchQuery && mode === 'home' && !selectedProvider && (
            <SEOContent />
          )}
        </main>

        <Footer />

        <DisclaimerModal
          isOpen={showDisclaimer}
          onAccept={() => {
            sessionStorage.setItem('disclaimerAccepted', 'true')
            setShowDisclaimer(false)
          }}
        />
      </div>
    </>
  )
}

export default Index
