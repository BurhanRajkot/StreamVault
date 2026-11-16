import { memo, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ChevronLeft, ChevronRight, Play, Star } from 'lucide-react'
import type { Media } from '@/lib/config'
import { cn } from '@/lib/utils'
import { EASE_OUT, item, stagger } from '@app/lib/motion'

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

function Rating({ value }: { value: number | undefined }) {
  if (!value) return null
  return (
    <span className="flex items-center gap-0.5 text-amber-300">
      <Star className="h-3 w-3 fill-current" /> {value.toFixed(1)}
    </span>
  )
}

/** A poster tile, 2:3 — lifts and shows its details under a mouse, springs under a finger. */
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
  const year = yearOf(media)
  return (
    <Link
      to={titlePath(media, kind)}
      aria-label={titleOf(media)}
      className={cn(
        'group/card press relative block shrink-0 rounded-[10px] outline-none',
        'transition-transform duration-300 ease-[cubic-bezier(0.2,0.9,0.3,1.15)] hover:z-10 hover:-translate-y-1.5 hover:scale-[1.06] focus-visible:scale-[1.06]',
        className
      )}
    >
      <div className="skeleton relative aspect-[2/3] w-full overflow-hidden rounded-[10px] shadow-[0_8px_24px_-12px_rgb(0_0_0/0.8)] ring-1 ring-white/[0.07] transition-shadow duration-300 group-hover/card:shadow-[0_24px_50px_-14px_rgb(0_0_0/0.9),0_0_0_1px_rgb(255_255_255/0.18)] group-focus-visible/card:ring-2 group-focus-visible/card:ring-primary">
        {media.poster_path ? (
          <FadeImg src={tmdbImg(media.poster_path, 'w342')} loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-end bg-gradient-to-b from-white/[0.06] to-white/[0.02] p-2.5">
            <span className="font-display line-clamp-3 text-[12px] font-bold leading-tight text-white/75">{titleOf(media)}</span>
          </div>
        )}
        {/* Details slide up on hover (mouse only) */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 translate-y-3 bg-gradient-to-t from-black via-black/75 to-transparent p-2.5 pt-10 opacity-0 transition-all duration-300 group-hover/card:translate-y-0 group-hover/card:opacity-100">
          <p className="font-display line-clamp-2 text-[13px] font-bold leading-tight text-white">{titleOf(media)}</p>
          <p className="mt-1 flex items-center gap-1.5 text-[11px] font-medium text-white/65">
            {year && <span>{year}</span>}
            <Rating value={media.vote_average} />
          </p>
        </div>
      </div>
      {badge}
    </Link>
  )
})

/** A landscape card — the backdrop with the title over it. */
export const WideCard = memo(function WideCard({ media, kind, className }: { media: Media; kind?: MediaKind; className?: string }) {
  const year = yearOf(media)
  return (
    <Link
      to={titlePath(media, kind)}
      aria-label={titleOf(media)}
      className={cn(
        'group/card press relative block shrink-0 outline-none',
        'transition-transform duration-300 ease-[cubic-bezier(0.2,0.9,0.3,1.15)] hover:z-10 hover:-translate-y-1 hover:scale-[1.04]',
        className
      )}
    >
      <div className="skeleton relative aspect-video w-full overflow-hidden rounded-xl ring-1 ring-white/[0.07] transition-shadow duration-300 group-hover/card:shadow-[0_24px_50px_-14px_rgb(0_0_0/0.9),0_0_0_1px_rgb(255_255_255/0.18)]">
        <FadeImg
          src={tmdbImg(media.backdrop_path || media.poster_path, 'w780')}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-[1.2s] ease-out group-hover/card:scale-110"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />
        <span className="absolute right-3 top-3 flex h-9 w-9 scale-75 items-center justify-center rounded-full bg-white text-black opacity-0 shadow-lg transition-all duration-300 group-hover/card:scale-100 group-hover/card:opacity-100">
          <Play className="ml-0.5 h-4 w-4 fill-current" />
        </span>
        <div className="absolute inset-x-0 bottom-0 p-3">
          <p className="font-display line-clamp-1 text-[15px] font-extrabold leading-tight text-white drop-shadow lg:text-[16px]">{titleOf(media)}</p>
          <p className="mt-0.5 flex items-center gap-2 text-[11.5px] font-medium text-white/65">
            {year && <span>{year}</span>}
            <span>{kindOf(media, kind) === 'tv' ? 'Series' : 'Film'}</span>
            <Rating value={media.vote_average} />
          </p>
        </div>
      </div>
    </Link>
  )
})

/** A section heading over a row. */
export function RowHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3 px-4 lg:mb-1 lg:px-12">
      <div>
        <h2 className="font-display text-[17px] font-extrabold tracking-tight text-white lg:text-[21px]">{title}</h2>
      </div>
      {action}
    </div>
  )
}

/**
 * A horizontal row that reveals itself as it scrolls into view. With a
 * mouse, arrows at its ends page through it.
 */
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
    <motion.section
      initial={{ opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '0px 0px -60px 0px' }}
      transition={{ duration: 0.6, ease: EASE_OUT }}
      className={cn('group/row relative mb-7 lg:mb-9', className)}
    >
      <RowHeader title={title} action={action} />
      <div className="relative">
        <div ref={scroller} onScroll={measure} className={cn('row-scroll px-4 lg:px-12', gap)}>
          {children}
        </div>
        <ArrowButton side="left" hidden={edges.start} onClick={() => page(-1)} />
        <ArrowButton side="right" hidden={edges.end} onClick={() => page(1)} />
      </div>
    </motion.section>
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
        'absolute inset-y-0 z-20 hidden w-12 items-center justify-center text-white opacity-0 transition-opacity duration-300 lg:flex',
        side === 'left' ? 'left-0 bg-gradient-to-r from-background via-background/70 to-transparent' : 'right-0 bg-gradient-to-l from-background via-background/70 to-transparent',
        hidden ? 'pointer-events-none !opacity-0' : 'group-hover/row:opacity-100'
      )}
    >
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 ring-1 ring-white/15 backdrop-blur transition-transform hover:scale-110 hover:bg-white/20">
        <Icon className="h-6 w-6" />
      </span>
    </button>
  )
}

const POSTER_W = 'w-[118px] sm:w-[132px] lg:w-[168px] 2xl:w-[188px]'
const WIDE_W = 'w-[260px] sm:w-[290px] lg:w-[330px] 2xl:w-[370px]'

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
        ? Array.from({ length: 5 }, (_, i) => <div key={i} className={cn('skeleton aspect-video shrink-0 rounded-xl', WIDE_W)} />)
        : shown.map((m) => <WideCard key={`${kindOf(m, kind)}-${m.id}`} media={m} kind={kind} className={WIDE_W} />)}
    </Row>
  )
}

/** Top 10 with big outlined numerals. */
export function TopTenRow({ title, items, kind }: { title: string; items: Media[] | undefined; kind?: MediaKind }) {
  const shown = (items ?? []).filter((m) => m.poster_path).slice(0, 10)
  if (shown.length < 3) return null
  return (
    <Row title={title} gap="gap-1 lg:gap-3">
      {shown.map((m, i) => (
        <Link
          key={m.id}
          to={titlePath(m, kind)}
          className="group/card press flex shrink-0 items-end transition-transform duration-300 ease-[cubic-bezier(0.2,0.9,0.3,1.15)] hover:z-10 hover:-translate-y-1.5"
          aria-label={`${i + 1}. ${titleOf(m)}`}
        >
          <span className="rank-numeral -mr-4 select-none text-[96px] leading-[0.78] tracking-[-0.08em] lg:-mr-6 lg:text-[150px]" aria-hidden="true">
            {i + 1}
          </span>
          <span className="skeleton relative block aspect-[2/3] w-[100px] overflow-hidden rounded-[10px] shadow-[-12px_0_24px_-6px_rgb(0_0_0/0.85)] ring-1 ring-white/10 transition-shadow duration-300 group-hover/card:shadow-[0_24px_50px_-14px_rgb(0_0_0/0.9)] lg:w-[150px] 2xl:w-[164px]">
            <FadeImg src={tmdbImg(m.poster_path, 'w342')} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover/card:scale-105" />
          </span>
        </Link>
      ))}
    </Row>
  )
}

const GRID = 'grid grid-cols-3 gap-2.5 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 lg:gap-x-4 lg:gap-y-6 xl:grid-cols-7 2xl:grid-cols-8'

/** Posters in a grid — My List, search, "more like this" — rising in one after another. */
export function PosterGrid({ items, kind, className }: { items: Media[]; kind?: MediaKind; className?: string }) {
  return (
    <motion.div variants={stagger(0.03)} initial="hidden" animate="show" className={cn(GRID, className)}>
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
