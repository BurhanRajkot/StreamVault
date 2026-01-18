import { useState, useEffect } from 'react'
import { Helmet } from 'react-helmet-async'
import { Media, MediaMode } from '@/lib/config'
import { useMedia } from '@/hooks/useMedia'
import { Header } from '@/components/Header'
import { HeroCarousel } from '@/components/HeroCarousel'
import { MediaGrid } from '@/components/MediaGrid'
import { PlayerModal } from '@/components/PlayerModal'
import { DisclaimerModal } from '@/components/DisclaimerModal'
import { Footer } from '@/components/Footer'
import { AuthorsChoiceSection } from '@/components/AuthorsChoiceSection'
import { ContinueWatchingSection } from '@/components/ContinueWatchingSection'
import Downloads from './Downloads'

const Index = () => {
  const [mode, setMode] = useState<MediaMode>('movie')
  const [selectedMedia, setSelectedMedia] = useState<Media | null>(null)
  const [playMode, setPlayMode] = useState<MediaMode>('movie')
  const [showDisclaimer, setShowDisclaimer] = useState(false)

  const {
    media,
    trending,
    isLoading,
    hasMore,
    loadMore,
    search,
    clearSearch,
    searchQuery,
  } = useMedia(mode)

  useEffect(() => {
    if (sessionStorage.getItem('disclaimerAccepted') !== 'true') {
      setShowDisclaimer(true)
    }
  }, [])

  const handleMediaClick = (media: Media) => {
    // Detect actual media type from TMDB data
    const detectedMode: MediaMode = media.title ? 'movie' : 'tv'
    setPlayMode(detectedMode)
    setSelectedMedia(media)
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

        <main className="container flex-1 py-6">
          {mode === 'downloads' ? (
            <Downloads />
          ) : (
            <>
              {!searchQuery && trending.length > 0 && (
                <HeroCarousel
                  items={trending}
                  onMediaClick={handleMediaClick}
                />
              )}

              {!searchQuery && (
                <ContinueWatchingSection
                  onMediaClick={handleMediaClick}
                />
              )}

              {!searchQuery && (
                <AuthorsChoiceSection
                  onMediaClick={handleMediaClick}
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
            onClose={() => setSelectedMedia(null)}
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
