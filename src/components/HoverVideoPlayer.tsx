import { useState, useRef } from "react"
import { Volume2, VolumeX } from "lucide-react"
import { Media, CONFIG } from "@/lib/config"
import { getImageUrl } from "@/lib/api"
import { cn } from "@/lib/utils"

interface HoverVideoPlayerProps {
  media: Media
}

export function HoverVideoPlayer({ media }: HoverVideoPlayerProps) {

  const [muted, setMuted] = useState(true)
  const [loaded, setLoaded] = useState(false)

  const iframeRef = useRef<HTMLIFrameElement>(null)

  const mediaType =
    media.media_type ||
    (media.first_air_date ? "tv" : "movie")

  const url =
    mediaType === "movie"
      ? CONFIG.STREAM_PROVIDERS.vidsrc_pro_movie.replace(
          "{tmdbId}",
          String(media.id)
        )
      : CONFIG.STREAM_PROVIDERS.vidsrc_pro
          .replace("{tmdbId}", String(media.id))
          .replace("{season}", "1")
          .replace("{episode}", "1")

  const backdrop = getImageUrl(
    media.backdrop_path || media.poster_path,
    "backdrop"
  )

  return (
    <div className="absolute inset-0 z-20 bg-black rounded-t-lg overflow-hidden">

      {/* fallback image */}
      <img
        src={backdrop}
        alt={`${media.title || media.name || 'Media'} backdrop`}
        className={cn(
          "absolute inset-0 w-full h-full object-cover transition duration-500",
          loaded ? "opacity-0 scale-105" : "opacity-60 scale-100"
        )}
      />

      {/* iframe */}
      <iframe
        ref={iframeRef}
        src={url}
        allow="autoplay; fullscreen"
        allowFullScreen
        className={cn(
          "absolute inset-0 w-full h-full transition duration-500",
          loaded ? "opacity-100" : "opacity-0"
        )}
        onLoad={() => setLoaded(true)}
      />

      {/* gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent pointer-events-none" />

      {/* controls */}
      <div className="absolute bottom-3 right-3 flex gap-2">

        <button
          onClick={(e) => {
            e.stopPropagation()
            setMuted(!muted)
          }}
          className="bg-black/60 hover:bg-black p-2 rounded-full transition backdrop-blur"
        >
          {muted ? (
            <VolumeX size={16} />
          ) : (
            <Volume2 size={16} />
          )}
        </button>

      </div>

      {/* loading shimmer */}
      {!loaded && (
        <div className="absolute inset-0 animate-pulse bg-gradient-to-r from-black via-gray-900 to-black opacity-40" />
      )}

    </div>
  )
}
