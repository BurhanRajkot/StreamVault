import { useState, useEffect, useCallback } from 'react'
import { Helmet } from 'react-helmet-async'
import { Media, MediaMode } from '@/lib/config'
import { useMedia } from '@/hooks/useMedia'
import { Header } from '@/components/Header'
import { MobileNav } from '@/components/MobileNav'
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
import Downloads from './Downloads'

const Index = () => {
  const [mode, setMode] = useState<MediaMode>('home')
  const [showDisclaimer, setShowDisclaimer] = useState(false)
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null)

  const [detailMedia, setDetailMedia] = useState<Media | null>(null)
  const [detailMode, setDetailMode] = useState<MediaMode>('movie')

  const [initialSeason, setInitialSeason] = useState<number | undefined>()
  const [initialEpisode, setInitialEpisode] = useState<number | undefined>()
  const [initialServer, setInitialServer] = useState<string | undefined>()
  const [refreshKey, setRefreshKey] = useState(0)

  const { isAuthenticated, getAccessTokenSilently } = useAuth0()
  const { sections: recoSections, isLoading: recoLoading } = useRecommendations()

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

  useEffect(() => {
    if (sessionStorage.getItem('disclaimerAccepted') !== 'true') {
      setShowDisclaimer(true)
    }
  }, [])

  const handleMediaClick = (media: Media, season?: number, episode?: number, server?: string) => {
    const detectedMode: MediaMode = media.title ? 'movie' : 'tv'

    setDetailMode(detectedMode)
    setDetailMedia(media)
    setInitialSeason(season)
    setInitialEpisode(episode)
    setInitialServer(server)
  }

  const handleCloseDetail = () => {
    setDetailMedia(null)
    setInitialSeason(undefined)
    setInitialEpisode(undefined)
    setInitialServer(undefined)
    setRefreshKey(prev => prev + 1)
  }

  // Handle click on a CineMatch recommendation card
  const handleRecoCardClick = useCallback(async (item: RecoItem) => {
    const mediaForPlayer: Media = {
      id: item.tmdbId,
      title: item.mediaType === 'movie' ? item.title : undefined as any,
      name: item.mediaType === 'tv' ? item.title : undefined as any,
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
        })
      } catch { /* non-critical */ }
    }
  }, [isAuthenticated, getAccessTokenSilently])

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

  // Removed handleClosePlayer since PlayerModal is removed

  return (
    <>
      <Helmet>
        <title>StreamVault</title>
      </Helmet>

      <div className="flex min-h-screen flex-col">
        <Header
          mode={mode}
          onModeChange={setMode}
          onSearch={search}
          searchQuery={searchQuery}
          onClearSearch={clearSearch}
        />
        <MobileNav mode={mode} onModeChange={setMode} />

        {/* WIDER CONTAINER FOR LARGE MONITORS */}
        <main className="w-full px-2 sm:px-4 flex-1 py-2">
          {mode === 'downloads' ? (
            <Downloads />
          ) : (
            <>
              {!searchQuery && (
                <HeroCarousel
                  items={trending}
                  onMediaClick={handleMediaClick}
                />
              )}

              {/* OTT Provider Selector */}
              {!searchQuery && (
                  <PlatformSelector
                      selected={selectedProvider}
                      onSelect={setSelectedProvider}
                  />
              )}

              {/* Recently Added Section (Global for Docs, Provider-specific for others) */}
              {!searchQuery && selectedProvider && (
                <RecentlyAddedSection
                  mode={mode}
                  providerId={selectedProvider || null}
                  onMediaClick={handleMediaClick}
                />
              )}

              {!searchQuery && !selectedProvider && (
                <ContinueWatchingSection
                  onMediaClick={handleMediaClick}
                  refreshKey={refreshKey}
                />
              )}

              {!searchQuery && (
                <AuthorsChoiceSection
                  onMediaClick={handleMediaClick}
                  mode={mode as 'movie' | 'tv' | 'documentary'}
                />
              )}

              {/* CineMatch AI — Recommendation Sections */}
              {!searchQuery && (recoLoading ? [
                { title: 'Recommended For You', items: [], source: 'personal' },
                { title: 'Because You Watched...', items: [], source: 'because_you_watched' },
              ] : recoSections).map((section) => (
                <RecommendationRow
                  key={section.title}
                  section={section}
                  onCardClick={handleRecoCardClick}
                  onDislike={isAuthenticated ? handleRecoDislike : undefined}
                  isLoading={recoLoading}
                />
              ))}

              <MediaGrid
                media={media}
                isLoading={isLoading}
                hasMore={hasMore}
                onLoadMore={loadMore}
                onMediaClick={handleMediaClick}
              />
            </>
          )}
        </main>

        <Footer />

        {detailMedia && (
          <MovieDetailModal
            media={detailMedia}
            mode={detailMode}
            onClose={handleCloseDetail}
            initialSeason={initialSeason}
            initialEpisode={initialEpisode}
            initialServer={initialServer}
            autoPlay={initialSeason !== undefined || initialEpisode !== undefined || initialServer !== undefined}
          />
        )}

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
