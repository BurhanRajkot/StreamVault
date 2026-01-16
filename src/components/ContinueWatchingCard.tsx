import { useState } from 'react'
import { Media } from '@/lib/config'
import { Play, MoreVertical, Trash2 } from 'lucide-react'

type ContinueWatchingItem = {
  tmdbId: number
  mediaType: 'movie' | 'tv'
  season?: number
  episode?: number
  progress: number
}

interface Props {
  media: Media
  item: ContinueWatchingItem
  onResume: (media: Media) => void
  onRemove: (item: ContinueWatchingItem) => void
}

export function ContinueWatchingCard({
  media,
  item,
  onResume,
  onRemove,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <div className="group relative w-[160px] flex-shrink-0">
      {/* Play Overlay (hover + touch) */}
      <div
        className="
          absolute inset-0 z-10 flex items-center justify-center
          rounded-lg bg-black/60
          opacity-0 group-hover:opacity-100
          transition
          active:opacity-100
        "
        onClick={() => onResume(media)}
      >
        <Play className="h-10 w-10 text-white" />
      </div>

      {/* Menu Button */}
      <button
        onClick={(e) => {
          e.stopPropagation()
          setMenuOpen((v) => !v)
        }}
        className="
          absolute right-2 top-2 z-20
          rounded-full bg-black/60 p-1.5
          text-white
          opacity-0 group-hover:opacity-100
          transition
          active:opacity-100
          active:scale-95
        "
      >
        <MoreVertical className="h-4 w-4" />
      </button>

      {/* Menu */}
      {menuOpen && (
        <div className="absolute right-2 top-10 z-30 w-44 rounded-md border border-border bg-card shadow-lg">
          <button
            onClick={() => {
              onRemove(item)
              setMenuOpen(false)
            }}
            className="
              flex w-full items-center gap-2
              px-3 py-2 text-sm
              text-destructive
              transition-colors
              hover:bg-destructive/10
              active:bg-destructive/20
            "
          >
            <Trash2 className="h-4 w-4" />
            Remove
          </button>
        </div>
      )}

      {/* Poster */}
      <img
        src={`https://image.tmdb.org/t/p/w342${media.poster_path}`}
        alt={media.title || media.name}
        className="rounded-lg"
        onClick={() => onResume(media)}
      />
    </div>
  )
}
