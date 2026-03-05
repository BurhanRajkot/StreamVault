import { useParams, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { fetchMediaDetails } from '@/lib/api'
import { Media, MediaMode } from '@/lib/config'
import { MovieDetailModal } from '@/components/MovieDetailModal'
import { MovieMeta } from '@/seo/MovieMeta'
import { MovieJsonLd, VideoObjectJsonLd, WatchActionJsonLd } from '@/seo/JsonLd'

const Watch = () => {
  const { mediaType, tmdbId } = useParams<{
    mediaType: 'movie' | 'tv'
    tmdbId: string
  }>()
  const navigate = useNavigate()
  const [media, setMedia] = useState<Media | null>(null)

  useEffect(() => {
    if (!mediaType || !tmdbId) return

    fetchMediaDetails(mediaType, Number(tmdbId)).then(setMedia)
  }, [mediaType, tmdbId])

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
        onClose={() => navigate(-1)}
        autoPlay={true}
      />
    </>
  )
}

export default Watch
