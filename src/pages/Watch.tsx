import { useParams, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { fetchMediaDetails } from '@/lib/api'
import { Media, MediaMode } from '@/lib/config'
import { PlayerModal } from '@/components/PlayerModal'

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

  if (!mediaType) return null

  const mode: MediaMode = mediaType

  return (
    <PlayerModal
      media={media}
      mode={mode}
      isOpen={true}
      onClose={() => navigate(-1)}
    />
  )
}

export default Watch
