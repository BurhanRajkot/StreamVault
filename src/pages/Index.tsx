import { useState, useEffect } from 'react'
import { Helmet } from 'react-helmet-async'
import { Media, MediaMode } from '@/lib/config'
import { useMedia } from '@/hooks/useMedia'
import { Header } from '@/components/Header'
import { MobileNav } from '@/components/MobileNav'
import { HeroCarousel } from '@/components/HeroCarousel'
import { MediaGrid } from '@/components/MediaGrid'
import { PlayerModal } from '@/components/PlayerModal'
import { DisclaimerModal } from '@/components/DisclaimerModal'
import { Footer } from '@/components/Footer'
import { AuthorsChoiceSection } from '@/components/AuthorsChoiceSection'
import { ContinueWatchingSection } from '@/components/ContinueWatchingSection'
import { PlatformSelector } from '@/components/PlatformSelector'
import { RecentlyAddedSection } from '@/components/RecentlyAddedSection'
import Downloads from './Downloads'

const Index = () => {
  const [mode, setMode] = useState<MediaMode>('movie')
  const [selectedMedia, setSelectedMedia] = useState<Media | null>(null)
  const [playMode, setPlayMode] = useState<MediaMode>('movie')
  const [showDisclaimer, setShowDisclaimer] = useState(false)
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null)

  const [initialSeason, setInitialSeason] = useState<number | undefined>()
  const [initialEpisode, setInitialEpisode] = useState<number | undefined>()

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

  const handleMediaClick = (media: Media, season?: number, episode?: number) => {
    const detectedMode: MediaMode = media.title ? 'movie' : 'tv'
    setPlayMode(detectedMode)
    setSelectedMedia(media)
    setInitialSeason(season)
    setInitialEpisode(episode)
  }

  const handleClosePlayer = () => {
    setSelectedMedia(null)
    setInitialSeason(undefined)
    setInitialEpisode(undefined)
  }

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
        <main className="w-full px-4 sm:px-6 flex-1 py-4">
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
                />
              )}

              {!searchQuery && (
                <AuthorsChoiceSection
                  onMediaClick={handleMediaClick}
                  mode={(mode === 'downloads' ? 'movie' : mode) as 'movie' | 'tv' | 'documentary'}
                />
              )}

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

        {selectedMedia && (
          <PlayerModal
            media={selectedMedia}
            mode={playMode}
            isOpen={true}
            onClose={handleClosePlayer}
            initialSeason={initialSeason}
            initialEpisode={initialEpisode}
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
