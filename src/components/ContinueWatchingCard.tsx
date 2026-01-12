import { useState } from 'react'
import { Media } from '@/lib/config'
import { MediaCard } from './MediaCard'

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
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)

  return (
    <>
      <div
        className="relative w-[160px] flex-shrink-0"
        onContextMenu={(e) => {
          e.preventDefault()
          setMenu({ x: e.clientX, y: e.clientY })
        }}
      >
        <MediaCard media={media} onClick={onResume} />

        {/* Progress bar */}
        <div className="mt-1 h-1 w-full overflow-hidden rounded bg-muted">
          <div
            className="h-full bg-primary"
            style={{ width: `${item.progress * 100}%` }}
          />
        </div>
      </div>

      {/* Right-click menu */}
      {menu && (
        <div
          className="fixed z-50 w-56 rounded-md border border-border bg-card shadow-lg"
          style={{ top: menu.y, left: menu.x }}
          onMouseLeave={() => setMenu(null)}
        >
          <button
            onClick={() => {
              onRemove(item)
              setMenu(null)
            }}
            className="w-full px-4 py-2 text-left text-sm text-destructive hover:bg-destructive/10"
          >
            ❌ Remove from Continue Watching
          </button>
        </div>
      )}
    </>
  )
}
