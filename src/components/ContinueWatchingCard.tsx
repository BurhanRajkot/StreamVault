import { useState, useRef } from 'react'
import { Media } from '@/lib/config'
import { Play, MoreVertical, Trash2 } from 'lucide-react'
import { QuickViewModal } from './QuickViewModal'
import { cn } from '@/lib/utils'
import { ContinueWatchingItem, getImageUrl } from '@/lib/api'

interface Props {
  media: Media
  item: ContinueWatchingItem
  onResume: (media: Media, season?: number, episode?: number, server?: string) => void
  onRemove: (item: ContinueWatchingItem) => void
}

export function ContinueWatchingCard({
  media,
  item,
  onResume,
  onRemove,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [showQuickView, setShowQuickView] = useState(false)
  const hoverTimeout = useRef<NodeJS.Timeout | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)

  const handleMouseEnter = () => {
    if (window.innerWidth < 768) return
    hoverTimeout.current = setTimeout(() => {
      setShowQuickView(true)
    }, 1500)
  }

  const handleMouseLeave = () => {
    if (hoverTimeout.current) clearTimeout(hoverTimeout.current)
    setShowQuickView(false)
  }

  const title = media.title || media.name || 'Unknown'

  // Calculate label based on progress
  const getProgressLabel = () => {
    if (item.progress < 0.2) return 'Start'
    if (item.progress >= 0.2 && item.progress < 0.8) return 'Resume'
    return null // Hidden by filter in parent (>0.95)
  }

  const progressLabel = getProgressLabel()

  return (
    <div
      ref={cardRef}
      className={cn("group relative w-[160px] flex-shrink-0 cursor-pointer", showQuickView ? "z-50" : "z-0")}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Play Overlay (hover + touch) */}
      <div
        className="
          absolute inset-0 z-10 flex flex-col items-center justify-center
          rounded-lg bg-black/70
          opacity-0 group-hover:opacity-100
          transition
          active:opacity-100
          cursor-pointer
        "
        onClick={() => onResume(media, item.season, item.episode, item.server)}
      >
        <Play className="h-12 w-12 text-white fill-white mb-2" />
        {progressLabel && (
          <span className="text-xs font-semibold text-white bg-black/50 px-2 py-1 rounded">
            {progressLabel}
          </span>
        )}
      </div>

      {/* Menu Button */}
      <button
        aria-label="More options"
        onClick={(e) => {
          e.stopPropagation()
          setMenuOpen((v) => !v)
        }}
        className="
          absolute right-2 top-2 z-20
          rounded-full bg-black/70 p-1.5
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
        <>
          {/* Backdrop to close menu */}
          <div
            className="fixed inset-0 z-25"
            onClick={() => setMenuOpen(false)}
          />
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
              Remove from Continue Watching
            </button>
          </div>
        </>
      )}

      {/* Poster */}
      <div
        className="relative rounded-lg overflow-hidden cursor-pointer"
        onClick={() => onResume(media, item.season, item.episode, item.server)}
      >
        <img
          src={getImageUrl(media.poster_path, 'poster')}
          alt={title}
          className="w-full h-[240px] object-cover rounded-lg"
          onError={(e) => {
            const target = e.currentTarget
            target.onerror = null // Prevent infinite loop
            target.src = '/placeholder.svg'
          }}
        />

        {/* Progress Bar at Bottom */}
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/50">
          <div
            className="h-full bg-primary transition-all"
            style={{ width: `${item.progress * 100}%` }}
          />
        </div>

        {/* Episode Badge for TV Shows */}
        {item.mediaType === 'tv' && item.season && item.episode && (
          <div className="absolute bottom-2 left-2 bg-black/80 backdrop-blur-sm px-2 py-1 rounded text-xs font-bold text-white">
            S{item.season} · E{item.episode}
          </div>
        )}

        {/* Progress Label Badge */}
        {progressLabel && (
          <div
            className={cn(
              'absolute top-2 left-2 px-2 py-1 rounded text-xs font-semibold',
              progressLabel === 'Start'
                ? 'bg-green-500/90 text-white'
                : 'bg-primary/90 text-primary-foreground'
            )}
          >
            {progressLabel}
          </div>
        )}
      </div>

      {showQuickView && (
        <QuickViewModal
          media={media}
          onClose={() => setShowQuickView(false)}
          onPlay={() => {
            setShowQuickView(false)
            onResume(media, item.season, item.episode, item.server)
          }}
          triggerRef={cardRef}
        />
      )}
    </div>
  )
}
