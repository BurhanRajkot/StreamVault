import { useLocation, useParams, useNavigate } from 'react-router-dom'
import { useEffect, useState, useRef } from 'react'
import { fetchMediaDetails } from '@/lib/api'
import { Media, MediaMode } from '@/lib/config'
import { MovieDetailModal } from '@/components/MovieDetailModal'
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
  const [media, setMedia] = useState<Media | null>(null)

  const initialHistoryLength = useRef(window.history.length)

  const tmdbId = idAndSlug ? idAndSlug.split('-')[0] : ''

  useEffect(() => {
    if (!mediaType || !tmdbId) return

    fetchMediaDetails(mediaType, Number(tmdbId)).then(setMedia)
  }, [mediaType, tmdbId])

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

  if (!mediaType || !media) return null

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
          if (window.history.length <= 2) {
            navigate('/', { replace: true })
          } else {
            const stepsBack = window.history.length - initialHistoryLength.current + 1
            navigate(-stepsBack)
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
