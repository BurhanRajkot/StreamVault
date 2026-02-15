import { useEffect, useState } from 'react'
import { X, Play } from 'lucide-react'
import { Media, CONFIG, MediaMode } from '@/lib/config'
import { getImageUrl, fetchMediaDetails } from '@/lib/api'
import { cn } from '@/lib/utils'
import { HoverVideoPlayer } from './HoverVideoPlayer'

interface QuickViewModalProps {
  media: Media
  onClose: () => void
  onPlay: (media: Media, providerVal?: string) => void
}

export function QuickViewModal({ media, onClose, onPlay }: QuickViewModalProps) {
  const [details, setDetails] = useState<Media | null>(null)
  const [provider, setProvider] = useState('vidsrc_pro')
  const [isVisible, setIsVisible] = useState(false)

  const mode: MediaMode = media.media_type as MediaMode || (media.first_air_date ? 'tv' : 'movie')

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 20)

    fetchMediaDetails(mode, media.id)
      .then(setDetails)
      .catch((error) => {
        console.error('Failed to fetch media details:', error)
        // Continue without details - graceful degradation
      })

    return () => clearTimeout(timer)
  }, [media.id, mode])

  const providers = Object.entries(CONFIG.PROVIDER_NAMES)
  const backdrop = getImageUrl(media.backdrop_path || media.poster_path, 'backdrop')
  const title = media.title || media.name
  const year = media.release_date?.split('-')[0] || media.first_air_date?.split('-')[0]
  const rating = (media.vote_average * 10).toFixed(0)

  return (
    <div
      className={cn(
        "absolute z-[100] w-[420px] flex flex-col rounded-lg bg-[#181818] shadow-2xl transition-all duration-300 overflow-hidden",
        "top-[-50%] left-1/2 -translate-x-1/2",
        isVisible ? "scale-100 opacity-100" : "scale-95 opacity-0"
      )}
      style={{
        boxShadow: '0 8px 32px rgba(0,0,0,0.8)'
      }}
      onMouseLeave={onClose}
    >
      {/* Video/Image Section */}
      <div className="relative aspect-video w-full bg-black">
        <HoverVideoPlayer media={media} />

        {/* Close Button */}
        <button
          onClick={(e) => {
            e.stopPropagation()
            onClose()
          }}
          className="absolute top-2 right-2 z-50 rounded-full bg-black/70 hover:bg-white hover:text-black p-1.5 transition"
        >
          <X size={18} />
        </button>
      </div>

      {/* Info Section */}
      <div className="p-4 space-y-3">
        {/* Title */}
        <h3 className="text-xl font-bold text-white leading-tight">
          {title}
        </h3>

        {/* Metadata */}
        <div className="flex items-center gap-2 text-sm">
          <span className="text-green-400 font-semibold">{rating}% Match</span>
          <span className="text-gray-400">{year}</span>
          <span className="border border-gray-600 px-1 text-xs text-gray-400">HD</span>
          {details?.genres?.[0] && (
            <span className="text-gray-400">{details.genres[0].name}</span>
          )}
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2">
          {/* Play Button */}
          <button
            onClick={(e) => {
              e.stopPropagation()
              onPlay(media, provider)
            }}
            className="flex-1 flex items-center justify-center gap-2 bg-white hover:bg-gray-200 text-black font-semibold py-2.5 rounded-md transition active:scale-95"
          >
            <Play size={18} fill="currentColor" />
            Play
          </button>

          {/* Server Selector */}
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            className="px-3 py-2.5 bg-[#2a2a2a] border border-gray-700 hover:border-gray-500 text-white text-sm rounded-md transition cursor-pointer"
          >
            {providers.map(([key, name]) => (
              <option key={key} value={key}>{name}</option>
            ))}
          </select>
        </div>

        {/* Description */}
        {media.overview && (
          <p className="text-sm text-gray-400 line-clamp-3 leading-relaxed">
            {media.overview}
          </p>
        )}
      </div>
    </div>
  )
}
