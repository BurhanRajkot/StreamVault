import { useEffect, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, ChevronDown, Play, Plus, Star } from 'lucide-react'
import type { Media } from '@/lib/config'
import { genreNames } from '@/lib/genres'
import { useFavorites } from '@/context/FavoritesContext'
import { kindOf, titleOf, titlePath, tmdbImg, yearOf, type MediaKind } from './media'

/*
 * Desktop: a pointer resting on a poster opens a larger card over it — the
 * artwork, Play and My List, the rating, genres and a line of the story —
 * so a row can be browsed without opening every title. One card at a time,
 * drawn above everything (rows scroll sideways and would clip it). Only
 * with a mouse on a wide window; touch screens open the title as always.
 */

interface Preview {
  media: Media
  kind: MediaKind
  rect: DOMRect
}

/** A pointer resting this long on a card means a look, not a pass across the row. */
const SHOW_DELAY_MS = 550
/** Time to cross from the card onto the preview before it closes. */
const HIDE_DELAY_MS = 140
const WIDE_ENOUGH = '(hover: hover) and (pointer: fine) and (min-width: 1024px)'

let current: Preview | null = null
const listeners = new Set<() => void>()
let showTimer: ReturnType<typeof setTimeout> | undefined
let hideTimer: ReturnType<typeof setTimeout> | undefined

function setPreview(next: Preview | null) {
  current = next
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function keepOpen() {
  clearTimeout(hideTimer)
}

function closeSoon() {
  clearTimeout(showTimer)
  clearTimeout(hideTimer)
  hideTimer = setTimeout(() => setPreview(null), HIDE_DELAY_MS)
}

/** Pointer handlers for a card that opens the preview. */
export function previewTrigger(media: Media, kind?: MediaKind) {
  return {
    onPointerEnter: (e: React.PointerEvent<HTMLElement>) => {
      if (e.pointerType !== 'mouse' || !window.matchMedia(WIDE_ENOUGH).matches) return
      const el = e.currentTarget
      clearTimeout(showTimer)
      keepOpen()
      showTimer = setTimeout(() => {
        if (el.isConnected) setPreview({ media, kind: kindOf(media, kind), rect: el.getBoundingClientRect() })
      }, SHOW_DELAY_MS)
    },
    onPointerLeave: () => closeSoon(),
  }
}

/** Where the preview stands: centred on its card, inside the window, under the top bar. */
function placement(rect: DOMRect) {
  const width = Math.min(400, Math.max(320, rect.width * 1.75))
  const height = width * (9 / 16) + 168
  const left = Math.min(Math.max(16, rect.left + rect.width / 2 - width / 2), window.innerWidth - width - 16)
  const top = Math.min(Math.max(72, rect.top + rect.height / 2 - height / 2), window.innerHeight - height - 16)
  return { left, top, width }
}

/** Mount once: the open preview, if any. */
export function HoverPreviewLayer() {
  const preview = useSyncExternalStore(subscribe, () => current)
  const location = useLocation()

  // A scroll (the page or a row), a resize or a new page closes it
  useEffect(() => {
    if (!preview) return
    const close = () => setPreview(null)
    window.addEventListener('scroll', close, { capture: true, passive: true })
    window.addEventListener('resize', close)
    window.addEventListener('blur', close)
    return () => {
      window.removeEventListener('scroll', close, { capture: true })
      window.removeEventListener('resize', close)
      window.removeEventListener('blur', close)
    }
  }, [preview])
  useEffect(() => setPreview(null), [location.pathname])

  return createPortal(
    <AnimatePresence>{preview && <PreviewCard key={`${preview.kind}-${preview.media.id}`} {...preview} />}</AnimatePresence>,
    document.body
  )
}

function PreviewCard({ media, kind, rect }: Preview) {
  const navigate = useNavigate()
  const { isFavorited, toggleFavorite } = useFavorites()
  const { left, top, width } = placement(rect)
  const inList = isFavorited(media.id, kind)
  const genres = genreNames(media.genre_ids, 3)
  const open = () => navigate(titlePath(media, kind), { state: { preview: { ...media, media_type: kind } } })
  const circle = 'press flex h-10 w-10 items-center justify-center rounded-full'

  return (
    <motion.div
      initial={{ opacity: 0, scale: rect.width / width, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.92, transition: { duration: 0.14 } }}
      transition={{ duration: 0.24, ease: [0.25, 1, 0.5, 1] }}
      onPointerEnter={keepOpen}
      onPointerLeave={closeSoon}
      style={{ left, top, width }}
      className="fixed z-[200] overflow-hidden rounded-[14px] bg-[#16161a] shadow-[0_28px_70px_-12px_rgb(0_0_0/0.95)] ring-1 ring-white/10"
    >
      <button type="button" onClick={open} className="relative block aspect-video w-full overflow-hidden bg-black" aria-label={`Open ${titleOf(media)}`}>
        <img src={tmdbImg(media.backdrop_path || media.poster_path, 'w780')} alt="" className="h-full w-full object-cover" />
        <span className="absolute inset-0 bg-gradient-to-t from-[#16161a] via-transparent to-transparent" />
        <span className="absolute inset-x-4 bottom-2 line-clamp-2 text-left text-[19px] font-bold leading-tight tracking-[-0.01em] text-white drop-shadow">{titleOf(media)}</span>
      </button>
      <div className="px-4 pb-4 pt-2">
        <div className="mb-3 flex items-center gap-2">
          <button type="button" onClick={() => navigate(`/watch/${kind}/${media.id}`)} aria-label="Play" className={`${circle} bg-white text-black`}>
            <Play className="ml-0.5 h-[18px] w-[18px] fill-current" />
          </button>
          <button
            type="button"
            onClick={() => toggleFavorite(media.id, kind, media.genre_ids)}
            aria-label={inList ? 'Remove from My List' : 'Add to My List'}
            className={`${circle} border border-white/40 text-white hover:border-white`}
          >
            {inList ? <Check className="h-[18px] w-[18px]" strokeWidth={2.6} /> : <Plus className="h-[18px] w-[18px]" strokeWidth={2.6} />}
          </button>
          <button type="button" onClick={open} aria-label="More info" className={`${circle} ml-auto border border-white/40 text-white hover:border-white`}>
            <ChevronDown className="h-[18px] w-[18px]" strokeWidth={2.6} />
          </button>
        </div>
        <p className="mb-1.5 flex flex-wrap items-center gap-x-1.5 text-[13px] font-medium text-white/75">
          {media.vote_average > 0 && (
            <span className="inline-flex items-center gap-1 text-white">
              <Star className="h-3 w-3 fill-ios-yellow text-ios-yellow" /> {media.vote_average.toFixed(1)}
            </span>
          )}
          {[yearOf(media), kind === 'tv' ? 'Series' : 'Film'].filter(Boolean).join(' · ')}
        </p>
        {genres.length > 0 && <p className="mb-2 text-[13px] text-white/60">{genres.join(' • ')}</p>}
        {media.overview && <p className="line-clamp-3 text-[13px] leading-[1.45] text-white/70">{media.overview}</p>}
      </div>
    </motion.div>
  )
}
