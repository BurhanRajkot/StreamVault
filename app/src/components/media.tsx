import { memo, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, type LinkProps } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { Media } from '@/lib/config'
import { cn } from '@/lib/utils'
import { item, stagger } from '@app/lib/motion'
import { prefetchTitleDetails } from '@app/lib/useTitle'
import { previewTrigger } from './HoverPreview'

export type MediaKind = 'movie' | 'tv'

type TmdbSize = 'w185' | 'w300' | 'w342' | 'w500' | 'w780' | 'w1280' | 'original'

/** A TMDB image at an exact size (posters top out at w780, backdrops at w1280). */
export function tmdbImg(path: string | null | undefined, size: TmdbSize): string {
  return path ? `https://image.tmdb.org/t/p/${size}${path}` : '/placeholder.svg'
}

/**
 * A full-width backdrop's sources, for `srcSet` with `sizes="100vw"`: the
 * window picks the size it needs. TMDB's "original" is usually 1920 wide
 * (sometimes 3840) — loading it everywhere took long to arrive and longer to decode.
 */
export function backdropSrcSet(path: string | null | undefined): string | undefined {
  return path ? `${tmdbImg(path, 'w780')} 780w, ${tmdbImg(path, 'w1280')} 1280w, ${tmdbImg(path, 'original')} 1920w` : undefined
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

/** How long a pointer rests on a card before its details start loading — skims across a row load nothing. */
const HOVER_INTENT_MS = 250
/** The same for the focus: a remote held down passes a card every ~100 ms. */
const FOCUS_INTENT_MS = 400

/**
 * A link to a title's page. The page opens at once on what this card already
 * knows (see useTitleDetails), and the details start loading as soon as a
 * pointer rests on the card or presses it — before the click lands.
 */
export function TitleLink({ item: media, kind, ...props }: Omit<LinkProps, 'to' | 'state'> & { item: Media; kind?: MediaKind }) {
  const queryClient = useQueryClient()
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const resolved = kindOf(media, kind)
  const prefetch = () => {
    clearTimeout(timer.current)
    prefetchTitleDetails(queryClient, resolved, media.id)
  }
  useEffect(() => () => clearTimeout(timer.current), [])
  return (
    <Link
      {...props}
      to={titlePath(media, kind)}
      state={{ preview: { ...media, media_type: resolved } }}
      onPointerEnter={(e) => {
        props.onPointerEnter?.(e)
        if (e.pointerType === 'mouse') timer.current = setTimeout(prefetch, HOVER_INTENT_MS)
      }}
      onPointerLeave={(e) => {
        props.onPointerLeave?.(e)
        clearTimeout(timer.current)
      }}
      onPointerDown={(e) => {
        props.onPointerDown?.(e)
        prefetch()
      }}
      // Focus from a keyboard or a TV remote skims across rows: load only once it rests on a card
      onFocus={(e) => {
        props.onFocus?.(e)
        clearTimeout(timer.current)
        timer.current = setTimeout(prefetch, FOCUS_INTENT_MS)
      }}
      onBlur={(e) => {
        props.onBlur?.(e)
        clearTimeout(timer.current)
      }}
    />
  )
}

/** Arriving this soon after the image was put on the page, it came from the cache. */
const CACHED_MS = 80

/**
 * An image that fades in once it has arrived, over its frame's placeholder
 * colour — or simply shows, when it was already in the cache (coming back to
 * a screen shouldn't blink every poster on it). The state lives on the
 * element, not in React: a row of posters arriving re-renders nothing.
 */
export function FadeImg({ className, onLoad, ...props }: React.ImgHTMLAttributes<HTMLImageElement>) {
  const placedAt = useRef(0)
  const place = useCallback((el: HTMLImageElement | null) => {
    if (!el) return
    placedAt.current = performance.now()
    if (el.complete && el.naturalWidth > 0) el.dataset.loaded = 'cached'
  }, [])
  return (
    <img
      // A new picture is a new element: it fades in afresh rather than swapping under the old one
      key={props.src}
      ref={place}
      alt=""
      decoding="async"
      {...props}
      onLoad={(e) => {
        const el = e.currentTarget
        if (!el.dataset.loaded) el.dataset.loaded = performance.now() - placedAt.current < CACHED_MS ? 'cached' : 'true'
        onLoad?.(e)
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
    <TitleLink item={media} kind={kind} aria-label={titleOf(media)} {...previewTrigger(media, kind)} className={cn('group/card press relative block shrink-0 rounded-[10px] outline-none', className)}>
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
    </TitleLink>
  )
})

/** A landscape card — the artwork, with the title and a line under it. */
export const WideCard = memo(function WideCard({ media, kind, className }: { media: Media; kind?: MediaKind; className?: string }) {
  const year = yearOf(media)
  return (
    <TitleLink item={media} kind={kind} aria-label={titleOf(media)} {...previewTrigger(media, kind)} className={cn('group/card press block shrink-0 outline-none', className)}>
      <div className={cn(ART, HOVER, 'aspect-video w-full')}>
        <FadeImg src={tmdbImg(media.backdrop_path || media.poster_path, 'w780')} loading="lazy" className="h-full w-full object-cover" />
      </div>
      <p className="t-subhead mt-2 truncate font-semibold text-white">{titleOf(media)}</p>
      <p className="t-footnote truncate text-label-2">{[kindOf(media, kind) === 'tv' ? 'Series' : 'Film', year].filter(Boolean).join(' · ')}</p>
    </TitleLink>
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
    const start = el.scrollLeft < 8
    const end = el.scrollLeft + el.clientWidth >= el.scrollWidth - 8
    // Called every frame while the row scrolls: re-render only when an end is reached or left
    setEdges((prev) => (prev.start === start && prev.end === end ? prev : { start, end }))
  }, [])

  // The row's own size: watched once (it reports straight away, too)
  useEffect(() => {
    const el = scroller.current
    if (!el) return
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [measure])
  // Cards arrived or changed: does the row still reach past its end? Asked on
  // the next frame, after the page's own layout, rather than forcing one now
  // (once per row on every render of the page added up)
  useEffect(() => {
    const frame = requestAnimationFrame(measure)
    return () => cancelAnimationFrame(frame)
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

/** Each title once — a list may name a show twice (Netflix's Top 10 counts its seasons apart). */
function uniqueTitles(items: Media[], kind?: MediaKind): Media[] {
  const seen = new Set<string>()
  return items.filter((m) => {
    const key = `${kindOf(m, kind)}-${m.id}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

const POSTER_W = 'w-[124px] sm:w-[136px] lg:w-[168px] 2xl:w-[188px]'
const WIDE_W = 'w-[268px] sm:w-[290px] lg:w-[330px] 2xl:w-[370px]'

/*
 * A row's placeholders stand exactly as tall as the cards that replace them —
 * captions included — so nothing under a row moves when its titles arrive.
 */

/** Posters: just the artwork. */
function PosterSkeletons({ count = 8 }: { count?: number }) {
  return Array.from({ length: count }, (_, i) => <div key={i} className={cn('skeleton aspect-[2/3] shrink-0 rounded-[10px]', POSTER_W)} />)
}

/** Landscape cards: the artwork, then the title (20px) and a line (18px) under it. */
function WideSkeletons({ count = 5 }: { count?: number }) {
  return Array.from({ length: count }, (_, i) => (
    <div key={i} className={cn('shrink-0', WIDE_W)} aria-hidden="true">
      <div className="skeleton aspect-video rounded-[10px]" />
      <div className="mt-2 flex h-[38px] flex-col justify-center gap-2">
        <div className="skeleton h-3 w-3/4 rounded-full" />
        <div className="skeleton h-2.5 w-2/5 rounded-full" />
      </div>
    </div>
  ))
}

/** Top 10: the poster, then the place and two lines (35px). */
function TopTenSkeletons({ count = 8 }: { count?: number }) {
  return Array.from({ length: count }, (_, i) => (
    <div key={i} className={cn('shrink-0', POSTER_W)} aria-hidden="true">
      <div className="skeleton aspect-[2/3] rounded-[10px]" />
      <div className="mt-2 flex h-[35px] flex-col justify-center gap-2 pl-6">
        <div className="skeleton h-2.5 w-4/5 rounded-full" />
        <div className="skeleton h-2 w-1/2 rounded-full" />
      </div>
    </div>
  ))
}

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
  const shown = uniqueTitles((items ?? []).filter((m) => m.poster_path), kind).slice(0, limit)
  if (!loading && shown.length === 0) return null
  return (
    <Row title={title}>
      {loading && shown.length === 0
        ? <PosterSkeletons />
        : shown.map((m) => <PosterCard key={`${kindOf(m, kind)}-${m.id}`} media={m} kind={kind} className={POSTER_W} />)}
    </Row>
  )
}

/** A row of landscape cards. */
export function WideRow({ title, items, loading, kind, limit = 14 }: { title: string; items: Media[] | undefined; loading?: boolean; kind?: MediaKind; limit?: number }) {
  const shown = uniqueTitles((items ?? []).filter((m) => m.backdrop_path), kind).slice(0, limit)
  if (!loading && shown.length === 0) return null
  return (
    <Row title={title}>
      {loading && shown.length === 0
        ? <WideSkeletons />
        : shown.map((m) => <WideCard key={`${kindOf(m, kind)}-${m.id}`} media={m} kind={kind} className={WIDE_W} />)}
    </Row>
  )
}

/** "12 / DEC" — a release date as a calendar leaf. */
function dateLeaf(date: string): { day: string; month: string } | null {
  const d = new Date(`${date}T00:00:00`)
  if (Number.isNaN(d.getTime())) return null
  return { day: String(d.getDate()), month: d.toLocaleDateString(undefined, { month: 'short' }).toUpperCase() }
}

/** Coming soon: landscape cards, each with the day it comes out on a calendar leaf. */
export function ComingSoonRow({ title, items, loading }: { title: string; items: Media[] | undefined; loading?: boolean }) {
  const shown = uniqueTitles((items ?? []).filter((m) => m.backdrop_path && m.release_date), 'movie')
  if (!loading && shown.length === 0) return null
  return (
    <Row title={title}>
      {loading && shown.length === 0
        ? <WideSkeletons />
        : shown.map((m) => {
            const leaf = dateLeaf(m.release_date ?? '')
            return (
              <TitleLink key={m.id} item={m} kind="movie" aria-label={`${titleOf(m)}, out ${m.release_date}`} className={cn('group/card press block shrink-0 outline-none', WIDE_W)}>
                <div className={cn(ART, HOVER, 'aspect-video w-full')}>
                  <FadeImg src={tmdbImg(m.backdrop_path, 'w780')} loading="lazy" className="h-full w-full object-cover" />
                  <span className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
                  {leaf && (
                    <span className="absolute left-2.5 top-2.5 flex w-11 flex-col items-center overflow-hidden rounded-[8px] bg-white text-black shadow-lg">
                      <span className="w-full bg-[#e50914] py-[1px] text-center text-[9px] font-bold tracking-[0.08em] text-white">{leaf.month}</span>
                      <span className="pb-0.5 text-[19px] font-bold leading-[22px] tabular-nums">{leaf.day}</span>
                    </span>
                  )}
                </div>
                <p className="t-subhead mt-2 truncate font-semibold text-white">{titleOf(m)}</p>
                <p className="t-footnote truncate text-label-2">Coming {new Date(`${m.release_date}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'long' })}</p>
              </TitleLink>
            )
          })}
    </Row>
  )
}

/** Top 10: each poster with its place and title under it. */
export function TopTenRow({ title, items, loading, kind }: { title: string; items: Media[] | undefined; loading?: boolean; kind?: MediaKind }) {
  const shown = uniqueTitles((items ?? []).filter((m) => m.poster_path), kind).slice(0, 10)
  // Held open while it loads: a row appearing above the rest pushed them all down
  if (loading && shown.length === 0)
    return (
      <Row title={title}>
        <TopTenSkeletons />
      </Row>
    )
  if (shown.length < 3) return null
  return (
    <Row title={title}>
      {shown.map((m, i) => (
        <TitleLink key={`${kindOf(m, kind)}-${m.id}`} item={m} kind={kind} className={cn('group/card press block shrink-0', POSTER_W)} aria-label={`${i + 1}. ${titleOf(m)}`}>
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
        </TitleLink>
      ))}
    </Row>
  )
}

const GRID = 'grid grid-cols-3 gap-x-2.5 gap-y-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 lg:gap-x-4 lg:gap-y-6 xl:grid-cols-7 2xl:grid-cols-8'

/** Posters in a grid — My List, search, "more like this". */
export function PosterGrid({ items, kind, className }: { items: Media[]; kind?: MediaKind; className?: string }) {
  return (
    <motion.div variants={stagger(0.015)} initial="hidden" animate="show" className={cn(GRID, className)}>
      {uniqueTitles(items, kind).map((m) => (
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
