import { memo, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import type { Media } from '@/lib/config'
import { getImageUrl } from '@/lib/api'
import { cn } from '@/lib/utils'

export type MediaKind = 'movie' | 'tv'

/** A TMDB image at an exact size (posters top out at w780, backdrops at w1280). */
export function tmdbImg(path: string | null | undefined, size: 'w185' | 'w342' | 'w500' | 'w780' | 'w1280' | 'w300'): string {
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
    <Link
      to={titlePath(media, kind)}
      className={cn('press group relative block shrink-0 overflow-hidden rounded-md bg-white/[0.04]', className)}
      aria-label={titleOf(media)}
    >
      <div className="aspect-[2/3] w-full">
        {media.poster_path ? (
          <img
            src={getImageUrl(media.poster_path, 'poster')}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-end bg-gradient-to-b from-white/[0.06] to-white/[0.02] p-2">
            <span className="line-clamp-3 text-[11px] font-semibold leading-tight text-white/70">{titleOf(media)}</span>
          </div>
        )}
      </div>
      {badge}
    </Link>
  )
})

/** A section heading over a row. */
export function RowHeader({ title, to, action }: { title: string; to?: string; action?: ReactNode }) {
  return (
    <div className="mb-2.5 flex items-end justify-between px-4 lg:px-8">
      <h2 className="text-[15.5px] font-bold tracking-tight text-white lg:text-[17px]">{title}</h2>
      {to ? (
        <Link to={to} className="flex items-center text-[12px] font-medium text-white/50">
          More <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      ) : (
        action
      )}
    </div>
  )
}

/** A horizontal row of posters — a fixed handful, never an endless feed. */
export function PosterRow({
  title,
  items,
  loading,
  kind,
  limit = 16,
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
    <section className="mb-6 fade-up">
      <RowHeader title={title} />
      <div className="row-scroll gap-2 px-4 lg:gap-3 lg:px-8">
        {loading && shown.length === 0
          ? Array.from({ length: 6 }, (_, i) => <div key={i} className="skeleton aspect-[2/3] w-[108px] shrink-0 rounded-md lg:w-[150px]" />)
          : shown.map((m) => <PosterCard key={`${kindOf(m, kind)}-${m.id}`} media={m} kind={kind} className="w-[108px] lg:w-[150px]" />)}
      </div>
    </section>
  )
}

/** Top 10 with the big ranked numerals. */
export function TopTenRow({ title, items, kind }: { title: string; items: Media[] | undefined; kind?: MediaKind }) {
  const shown = (items ?? []).filter((m) => m.poster_path).slice(0, 10)
  if (shown.length < 3) return null
  return (
    <section className="mb-6 fade-up">
      <RowHeader title={title} />
      <div className="row-scroll gap-1 px-4 lg:px-8">
        {shown.map((m, i) => (
          <Link key={m.id} to={titlePath(m, kind)} className="press flex shrink-0 items-end" aria-label={`${i + 1}. ${titleOf(m)}`}>
            <span
              className="-mr-3 select-none text-[86px] font-black leading-[0.8] tracking-tighter text-[#0a0a0c] lg:text-[110px]"
              style={{ WebkitTextStroke: '2px rgba(255,255,255,0.55)' }}
              aria-hidden="true"
            >
              {i + 1}
            </span>
            <img
              src={getImageUrl(m.poster_path, 'poster')}
              alt=""
              loading="lazy"
              className="relative aspect-[2/3] w-[96px] rounded-md object-cover lg:w-[128px]"
            />
          </Link>
        ))}
      </div>
    </section>
  )
}

/** Posters in a grid — My List, search, "more like this". */
export function PosterGrid({ items, kind, className }: { items: Media[]; kind?: MediaKind; className?: string }) {
  return (
    <div className={cn('grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7', className)}>
      {items.map((m) => (
        <PosterCard key={`${kindOf(m, kind)}-${m.id}`} media={m} kind={kind} />
      ))}
    </div>
  )
}

export function PosterGridSkeleton({ count = 9 }: { count?: number }) {
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="skeleton aspect-[2/3] rounded-md" />
      ))}
    </div>
  )
}
