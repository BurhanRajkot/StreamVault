import { useLocation, useParams, useNavigate } from 'react-router-dom'
import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchMediaDetails } from '@/lib/api'
import { MediaMode } from '@/lib/config'
import { MovieDetailModal } from '@/components/modals/MovieDetailModal'
import { MovieMeta } from '@/seo/MovieMeta'
import { BreadcrumbJsonLd, MovieJsonLd, VideoObjectJsonLd, WatchActionJsonLd } from '@/seo/JsonLd'
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
  const { data: media, isError, isLoading: loading, refetch, isFetching } = useQuery({
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
    // The details call answers null for a missing title and for a backend
    // hiccup alike (a cold start on Render is the usual one), so don't claim
    // a 404 — offer a retry, which fixes the common case.
    return (
      <div className="dark flex min-h-screen flex-col items-center justify-center bg-background px-6 text-center text-foreground">
        <h1 className="mb-3 text-2xl font-bold sm:text-3xl">Couldn&apos;t load this title</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          It may not exist, or the server is waking up. Trying again usually works.
        </p>
        <div className="mt-6 flex gap-3">
          <button
            onClick={() => void refetch()}
            disabled={isFetching}
            className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
          >
            {isFetching ? 'Trying…' : 'Try again'}
          </button>
          <button
            onClick={() => navigate('/')}
            className="rounded-lg bg-secondary px-5 py-2.5 text-sm font-medium text-secondary-foreground transition-colors hover:bg-secondary/80"
          >
            Go home
          </button>
        </div>
      </div>
    )
  }

  if (loading || !media) {
    return (
      <div className="dark flex min-h-screen items-center justify-center bg-background" role="status" aria-label="Loading">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-muted border-t-primary" />
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
      <BreadcrumbJsonLd media={media} mediaType={typedMediaType} />
      <VideoObjectJsonLd media={media} mediaType={typedMediaType} />
      <WatchActionJsonLd media={media} mediaType={typedMediaType} />

      {/*
        Keyed on the title so switching between two already-cached titles gets
        a fresh player. Without it React reuses the instance across the param
        change and the new title inherits the previous one's playback state —
        it auto-plays, keeps the old show's season/episode, and never logs its
        own watch event (the "already logged" ref is still set).
      */}
      <MovieDetailModal
        key={`${typedMediaType}:${media.id}`}
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
