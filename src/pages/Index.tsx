import { useState, useEffect } from 'react'
import { Helmet } from 'react-helmet-async'
import { Media, MediaMode } from '@/lib/config'
import { useMedia } from '@/hooks/useMedia'
import { Header } from '@/components/Header'
import { HeroCarousel } from '@/components/HeroCarousel'
import { MediaGrid } from '@/components/MediaGrid'
import { PlayerModal } from '@/components/PlayerModal'
import { DisclaimerModal } from '@/components/DisclaimerModal'
import { AnimeSection } from '@/components/AnimeSection'
import { Footer } from '@/components/Footer'
import { AuthorsChoiceSection } from '@/components/AuthorsChoiceSection'
import { ContinueWatchingSection } from '@/components/ContinueWatchingSection'

const Index = () => {
  const [mode, setMode] = useState<MediaMode>('movie')
  const [selectedMedia, setSelectedMedia] = useState<Media | null>(null)
  const [isPlayerOpen, setIsPlayerOpen] = useState(false)
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
    const accepted = sessionStorage.getItem('disclaimerAccepted')
    if (accepted !== 'true') {
      setShowDisclaimer(true)
    }
  }, [])

  const handleAcceptDisclaimer = () => {
    sessionStorage.setItem('disclaimerAccepted', 'true')
    setShowDisclaimer(false)
  }

  const handleMediaClick = (mediaItem: Media) => {
    setSelectedMedia(mediaItem)
    setIsPlayerOpen(true)
  }

  const handleModeChange = (newMode: MediaMode) => {
    setMode(newMode)
  }

  const getModeTitle = () => {
    switch (mode) {
      case 'movie':
        return 'Popular Movies'
      case 'tv':
        return 'Popular TV Shows'
      case 'anime':
        return 'Anime'
      default:
        return 'Popular'
    }
  }

  return (
    <>
      <Helmet>
        <title>StreamVault - Stream Movies, TV Shows & Anime</title>
        <meta
          name="description"
          content="StreamVault is a modern streaming platform for movies, TV shows, and anime."
        />
      </Helmet>

      <div className="flex min-h-screen flex-col">
        <Header
          mode={mode}
          onModeChange={handleModeChange}
          onSearch={search}
          searchQuery={searchQuery}
          onClearSearch={clearSearch}
        />

        <main className="container flex-1 py-4 sm:py-6">
          {mode === 'anime' ? (
            <AnimeSection onMediaClick={handleMediaClick} />
          ) : (
            <>
              {/* 🎞 HERO CAROUSEL */}
              {!searchQuery && trending.length > 0 && (
                <div className="mb-5 h-[220px] sm:mb-6 sm:h-[360px] md:h-[420px] overflow-hidden rounded-xl">
                  <HeroCarousel
                    items={trending}
                    onMediaClick={handleMediaClick}
                  />
                </div>
              )}

              {/* ▶ CONTINUE WATCHING */}
              {!searchQuery && (
                <ContinueWatchingSection onMediaClick={handleMediaClick} />
              )}

              {/* ⭐ AUTHOR'S CHOICE */}
              {!searchQuery && (
                <AuthorsChoiceSection onMediaClick={handleMediaClick} />
              )}

              {/* 🔍 SEARCH RESULTS TITLE */}
              {searchQuery && (
                <div className="mb-3 sm:mb-4">
                  <h2 className="text-base font-semibold text-foreground sm:text-lg">
                    Search results for "{searchQuery}"
                  </h2>
                </div>
              )}

              {/* 🎬 MAIN MEDIA GRID */}
              <MediaGrid
                media={media}
                isLoading={isLoading}
                hasMore={hasMore}
                onLoadMore={loadMore}
                onMediaClick={handleMediaClick}
                title={!searchQuery ? getModeTitle() : undefined}
              />
            </>
          )}
        </main>

        <Footer />

        {/* ▶ PLAYER MODAL */}
        <PlayerModal
          media={selectedMedia}
          mode={mode}
          isOpen={isPlayerOpen}
          onClose={() => setIsPlayerOpen(false)}
        />

        {/* ⚠ DISCLAIMER */}
        <DisclaimerModal
          isOpen={showDisclaimer}
          onAccept={handleAcceptDisclaimer}
        />
      </div>
    </>
  )
}

export default Index
