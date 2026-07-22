import { useLocation, useParams, useNavigate } from 'react-router-dom'
import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchMediaDetails } from '@/lib/api'
import { MediaMode } from '@/lib/config'
import { MovieDetailModal } from '@/components/modals/MovieDetailModal'
import { MovieMeta } from '@/seo/MovieMeta'
import { MovieJsonLd, VideoObjectJsonLd, WatchActionJsonLd } from '@/seo/JsonLd'
import { slugify } from '@/lib/utils'

const Watch = () => {
  const { mediaType, idAndSlug } = useParams<{
    mediaType: 'movie' | 'tv'
    idAndSlug: string
  }>()
  const navigate = useNavigate()
  const location = useLocation()
  const { season, episode, server, autoPlay } = location.state || {}

  const tmdbId = idAndSlug ? idAndSlug.split('-')[0] : ''

  // Backend caches this same response for 2hrs (Redis + Cache-Control), so
  // matching staleTime here means revisiting a title you already opened is
  // instant — no re-fetch, no loading-spinner flash.
  const { data: media, isError, isLoading: loading } = useQuery({
    queryKey: ['mediaDetails', mediaType, tmdbId],
    queryFn: () => fetchMediaDetails(mediaType as MediaMode, Number(tmdbId)),
    enabled: !!mediaType && !!tmdbId,
    staleTime: 2 * 60 * 60 * 1000,
    gcTime: 4 * 60 * 60 * 1000,
    retry: 1,
  })
  // fetchMediaDetails resolves with `null` (rather than rejecting) on a
  // non-ok response — treat that the same as a fetch failure.
  const error = isError || (!loading && media === null)

  useEffect(() => {
    if (media && mediaType && idAndSlug) {
      const title = media.title || media.name || ''
      if (title) {
        const expectedSlug = `${media.id}-${slugify(title)}`
        if (idAndSlug !== expectedSlug) {
          navigate(`/watch/${mediaType}/${expectedSlug}`, { replace: true })
        }
      }
    }
  }, [media, mediaType, idAndSlug, navigate])

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#0a0a0a] text-white">
        <h1 className="text-4xl font-bold mb-4">404 - Not Found</h1>
        <p className="text-zinc-400">Failed to load media or media not found.</p>
        <button onClick={() => navigate('/')} className="mt-6 px-6 py-2 bg-blue-600 rounded-lg font-medium hover:bg-blue-500 transition-colors">
          Go Home
        </button>
      </div>
    )
  }

  if (loading || !media) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#0a0a0a]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    )
  }

  if (!mediaType) return null

  const mode: MediaMode = mediaType
  const typedMediaType = mediaType as 'movie' | 'tv'

  return (
    <>
      {/* Dynamic per-movie SEO meta tags */}
      <MovieMeta media={media} mediaType={typedMediaType} />

      {/* Schema.org structured data for Google rich results */}
      <MovieJsonLd media={media} mediaType={typedMediaType} />
      <VideoObjectJsonLd media={media} mediaType={typedMediaType} />
      <WatchActionJsonLd media={media} mediaType={typedMediaType} />

      <MovieDetailModal
        media={media}
        mode={mode}
        onClose={() => {
          if (location.state?.backgroundLocation) {
            navigate(location.state.backgroundLocation)
          } else if (window.history.length > 2) {
            navigate(-1)
          } else {
            navigate('/')
          }
        }}
        initialSeason={season}
        initialEpisode={episode}
        initialServer={server}
        autoPlay={autoPlay || season !== undefined || episode !== undefined || server !== undefined}
      />
    </>
  )
}

export default Watch
