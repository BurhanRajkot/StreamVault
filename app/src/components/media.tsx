import { memo, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { Media } from '@/lib/config'
import { cn } from '@/lib/utils'
import { item, stagger } from '@app/lib/motion'

export type MediaKind = 'movie' | 'tv'

type TmdbSize = 'w185' | 'w300' | 'w342' | 'w500' | 'w780' | 'w1280' | 'original'

/** A TMDB image at an exact size (posters top out at w780, backdrops at w1280). */
export function tmdbImg(path: string | null | undefined, size: TmdbSize): string {
  return path ? `https://image.tmdb.org/t/p/${size}${path}` : '/placeholder.svg'
}

/** Movie or show — list endpoints only say so in blended feeds. */
export function kindOf(media: Media, fallback: MediaKind = 'movie'): MediaKind {
  if (media.media_type === 'tv' || media.media_type === 'movie') return media.media_type
  if (media.first_air_date && !media.release_date) return 'tv'
  return fallback
}

export function titleOf(media: Media): string {
  return media.title || media.name || 'Untitled'
}

export function titlePath(media: Media, fallback: MediaKind = 'movie'): string {
  return `/title/${kindOf(media, fallback)}/${media.id}`
}

export function yearOf(media: Media): string {
  return (media.release_date || media.first_air_date || '').slice(0, 4)
}

/** An image that fades in once it has arrived, over a shimmer. */
export function FadeImg({ className, ...props }: React.ImgHTMLAttributes<HTMLImageElement>) {
  const [loaded, setLoaded] = useState(false)
  return (
    <img
      alt=""
      decoding="async"
      {...props}
      data-loaded={loaded}
      onLoad={(e) => {
        setLoaded(true)
        props.onLoad?.(e)
      }}
      className={cn('img-fade', className)}
    />
  )
}

/** Artwork's frame: rounded, with a hairline so dark posters don't melt into the black. */
const ART = 'skeleton relative overflow-hidden rounded-[10px] after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:shadow-[inset_0_0_0_var(--hairline)_rgb(255_255_255/0.1)]'
/** With a mouse, artwork grows a little under it. */
const HOVER = 'transition-transform duration-300 ease-[cubic-bezier(0.25,1,0.5,1)] [@media(hover:hover)]:hover:scale-[1.04]'

/** A poster tile, 2:3. */
export const PosterCard = memo(function PosterCard({
  media,
  kind,
  className,
  badge,
}: {
  media: Media
  kind?: MediaKind
  className?: string
  badge?: ReactNode
}) {
  return (
    <Link to={titlePath(media, kind)} aria-label={titleOf(media)} className={cn('group/card press relative block shrink-0 rounded-[10px] outline-none', className)}>
      <div className={cn(ART, HOVER, 'aspect-[2/3] w-full group-focus-visible/card:ring-2 group-focus-visible/card:ring-tint')}>
        {media.poster_path ? (
          <FadeImg src={tmdbImg(media.poster_path, 'w342')} loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-end bg-grouped p-2.5">
            <span className="line-clamp-3 text-[13px] font-semibold leading-tight text-white/75">{titleOf(media)}</span>
          </div>
        )}
      </div>
      {badge}
    </Link>
  )
})

/** A landscape card — the artwork, with the title and a line under it. */
export const WideCard = memo(function WideCard({ media, kind, className }: { media: Media; kind?: MediaKind; className?: string }) {
  const year = yearOf(media)
  return (
    <Link to={titlePath(media, kind)} aria-label={titleOf(media)} className={cn('group/card press block shrink-0 outline-none', className)}>
      <div className={cn(ART, HOVER, 'aspect-video w-full')}>
        <FadeImg src={tmdbImg(media.backdrop_path || media.poster_path, 'w780')} loading="lazy" className="h-full w-full object-cover" />
      </div>
      <p className="t-subhead mt-2 truncate font-semibold text-white">{titleOf(media)}</p>
      <p className="t-footnote truncate text-label-2">{[kindOf(media, kind) === 'tv' ? 'Series' : 'Film', year].filter(Boolean).join(' · ')}</p>
    </Link>
  )
})

/** A section heading over a row. */
export function RowHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="mb-2.5 flex items-end justify-between gap-3 px-4 lg:mb-1 lg:px-12">
      <h2 className="text-[20px] font-bold leading-[25px] tracking-[-0.012em] text-white lg:text-[22px] lg:leading-7">{title}</h2>
      {action}
    </div>
  )
}

/** A horizontal row. With a mouse, arrows at its ends page through it. */
export function Row({ title, action, children, className, gap = 'gap-2.5 lg:gap-4' }: { title: string; action?: ReactNode; children: ReactNode; className?: string; gap?: string }) {
  const scroller = useRef<HTMLDivElement>(null)
  const [edges, setEdges] = useState({ start: true, end: false })

  const measure = useCallback(() => {
    const el = scroller.current
    if (!el) return
    setEdges({ start: el.scrollLeft < 8, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 8 })
  }, [])

  useEffect(() => {
    measure()
    const el = scroller.current
    if (!el) return
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [measure, children])

  const page = (direction: 1 | -1) => {
    const el = scroller.current
    if (el) el.scrollBy({ left: direction * el.clientWidth * 0.85, behavior: 'smooth' })
  }

  return (
    <section className={cn('group/row relative mb-8 lg:mb-10', className)}>
      <RowHeader title={title} action={action} />
      <div className="relative">
        <div ref={scroller} onScroll={measure} className={cn('row-scroll px-4 lg:px-12', gap)}>
          {children}
        </div>
        <ArrowButton side="left" hidden={edges.start} onClick={() => page(-1)} />
        <ArrowButton side="right" hidden={edges.end} onClick={() => page(1)} />
      </div>
    </section>
  )
}

function ArrowButton({ side, hidden, onClick }: { side: 'left' | 'right'; hidden: boolean; onClick: () => void }) {
  const Icon = side === 'left' ? ChevronLeft : ChevronRight
  return (
    <button
      onClick={onClick}
      aria-label={side === 'left' ? 'Scroll left' : 'Scroll right'}
      tabIndex={-1}
      className={cn(
        'absolute top-[calc(50%-24px)] z-20 hidden h-12 w-12 items-center justify-center rounded-full opacity-0 transition-opacity duration-300 lg:flex',
        'glass-button text-white hover:bg-white/25',
        side === 'left' ? 'left-3' : 'right-3',
        hidden ? 'pointer-events-none !opacity-0' : 'group-hover/row:opacity-100'
      )}
    >
      <Icon className="h-6 w-6" strokeWidth={2.2} />
    </button>
  )
}

const POSTER_W = 'w-[124px] sm:w-[136px] lg:w-[168px] 2xl:w-[188px]'
const WIDE_W = 'w-[268px] sm:w-[290px] lg:w-[330px] 2xl:w-[370px]'

/** A horizontal row of posters — a fixed handful, never an endless feed. */
export function PosterRow({
  title,
  items,
  loading,
  kind,
  limit = 18,
}: {
  title: string
  items: Media[] | undefined
  loading?: boolean
  kind?: MediaKind
  limit?: number
}) {
  const shown = (items ?? []).filter((m) => m.poster_path).slice(0, limit)
  if (!loading && shown.length === 0) return null
  return (
    <Row title={title}>
      {loading && shown.length === 0
        ? Array.from({ length: 8 }, (_, i) => <div key={i} className={cn('skeleton aspect-[2/3] shrink-0 rounded-[10px]', POSTER_W)} />)
        : shown.map((m) => <PosterCard key={`${kindOf(m, kind)}-${m.id}`} media={m} kind={kind} className={POSTER_W} />)}
    </Row>
  )
}

/** A row of landscape cards. */
export function WideRow({ title, items, loading, kind, limit = 14 }: { title: string; items: Media[] | undefined; loading?: boolean; kind?: MediaKind; limit?: number }) {
  const shown = (items ?? []).filter((m) => m.backdrop_path).slice(0, limit)
  if (!loading && shown.length === 0) return null
  return (
    <Row title={title}>
      {loading && shown.length === 0
        ? Array.from({ length: 5 }, (_, i) => <div key={i} className={cn('skeleton aspect-video shrink-0 rounded-[10px]', WIDE_W)} />)
        : shown.map((m) => <WideCard key={`${kindOf(m, kind)}-${m.id}`} media={m} kind={kind} className={WIDE_W} />)}
    </Row>
  )
}

/** Top 10: each poster with its place and title under it. */
export function TopTenRow({ title, items, kind }: { title: string; items: Media[] | undefined; kind?: MediaKind }) {
  const shown = (items ?? []).filter((m) => m.poster_path).slice(0, 10)
  if (shown.length < 3) return null
  return (
    <Row title={title}>
      {shown.map((m, i) => (
        <Link key={`${kindOf(m, kind)}-${m.id}`} to={titlePath(m, kind)} className={cn('group/card press block shrink-0', POSTER_W)} aria-label={`${i + 1}. ${titleOf(m)}`}>
          <span className={cn(ART, HOVER, 'block aspect-[2/3] w-full')}>
            <FadeImg src={tmdbImg(m.poster_path, 'w342')} loading="lazy" className="h-full w-full object-cover" />
          </span>
          <span className="mt-2 flex items-start gap-2">
            <span className="text-[26px] font-bold leading-[26px] tracking-[-0.03em] text-white" aria-hidden="true">
              {i + 1}
            </span>
            <span className="min-w-0 pt-px">
              <span className="t-footnote line-clamp-1 font-semibold text-white">{titleOf(m)}</span>
              <span className="t-caption block text-label-2">{[kindOf(m, kind) === 'tv' ? 'Series' : 'Film', yearOf(m)].filter(Boolean).join(' · ')}</span>
            </span>
          </span>
        </Link>
      ))}
    </Row>
  )
}

const GRID = 'grid grid-cols-3 gap-x-2.5 gap-y-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 lg:gap-x-4 lg:gap-y-6 xl:grid-cols-7 2xl:grid-cols-8'

/** Posters in a grid — My List, search, "more like this". */
export function PosterGrid({ items, kind, className }: { items: Media[]; kind?: MediaKind; className?: string }) {
  return (
    <motion.div variants={stagger(0.015)} initial="hidden" animate="show" className={cn(GRID, className)}>
      {items.map((m) => (
        <motion.div key={`${kindOf(m, kind)}-${m.id}`} variants={item}>
          <PosterCard media={m} kind={kind} />
        </motion.div>
      ))}
    </motion.div>
  )
}

export function PosterGridSkeleton({ count = 12 }: { count?: number }) {
  return (
    <div className={GRID}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="skeleton aspect-[2/3] rounded-[10px]" />
      ))}
    </div>
  )
}
