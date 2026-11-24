import { Link } from 'react-router-dom'
import { ChevronRight, User } from 'lucide-react'
import type { Media } from '@/lib/config'
import { cn } from '@/lib/utils'
import { FadeImg, Row, tmdbImg } from './media'

/** Cast members a title page shows before "see the rest" would be needed. */
const CAST_SHOWN = 16

interface CastEntry {
  id: number
  name: string
  role: string
  photo: string | null
}

/** Who made it and who's in it: the director (or creator) first, then the cast in billing order. */
function castOf(media: Media, kind: 'movie' | 'tv'): CastEntry[] {
  const crew = media.credits?.crew ?? []
  const makers =
    kind === 'movie'
      ? crew.filter((c) => c.job === 'Director')
      : ((media as Media & { created_by?: { id: number; name: string; profile_path: string | null }[] }).created_by ?? []).map((c) => ({ ...c, job: 'Creator' }))
  const seen = new Set<number>()
  const out: CastEntry[] = []
  for (const m of makers.slice(0, 2)) {
    if (seen.has(m.id)) continue
    seen.add(m.id)
    out.push({ id: m.id, name: m.name, role: m.job, photo: m.profile_path })
  }
  for (const c of media.credits?.cast ?? []) {
    if (out.length >= CAST_SHOWN) break
    if (seen.has(c.id)) continue
    seen.add(c.id)
    out.push({ id: c.id, name: c.name, role: c.character || 'Cast', photo: c.profile_path })
  }
  return out
}

/** Cast & Crew: round photos, each opening the person's page. */
export function CastRow({ media, kind }: { media: Media; kind: 'movie' | 'tv' }) {
  const people = castOf(media, kind)
  if (people.length === 0) return null
  return (
    <Row title="Cast & Crew" className="-mx-4 lg:-mx-12" gap="gap-3 lg:gap-5">
      {people.map((p) => (
        <Link key={p.id} to={`/person/${p.id}`} className="group/person press block w-[84px] shrink-0 text-center outline-none lg:w-[112px]">
          <span className="skeleton relative mx-auto block aspect-square w-[76px] overflow-hidden rounded-full ring-1 ring-white/10 transition-transform duration-300 group-focus-visible/person:ring-2 group-focus-visible/person:ring-tint lg:w-[104px] [@media(hover:hover)]:group-hover/person:scale-[1.05]">
            {p.photo ? (
              <FadeImg src={tmdbImg(p.photo, 'w185')} loading="lazy" className="h-full w-full object-cover" />
            ) : (
              <span className="flex h-full w-full items-center justify-center bg-fill text-white/40">
                <User className="h-8 w-8" />
              </span>
            )}
          </span>
          <span className="t-footnote mt-2 line-clamp-1 font-semibold text-white">{p.name}</span>
          <span className={cn('t-caption line-clamp-1', p.role === 'Director' || p.role === 'Creator' ? 'text-tint' : 'text-label-2')}>{p.role}</span>
        </Link>
      ))}
    </Row>
  )
}

/** "Part of The Dark Knight Collection": the film series, over its artwork, opening the whole series. */
export function CollectionCard({ media }: { media: Media }) {
  const collection = media.belongs_to_collection
  if (!collection) return null
  return (
    <Link
      to={`/collection/${collection.id}`}
      className="group/collection press relative mb-8 flex h-28 items-center overflow-hidden rounded-[16px] ring-1 ring-white/10 lg:mb-10 lg:h-36 lg:max-w-3xl"
    >
      {collection.backdrop_path && (
        <FadeImg
          src={tmdbImg(collection.backdrop_path, 'w780')}
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 [@media(hover:hover)]:group-hover/collection:scale-[1.03]"
        />
      )}
      <span className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/60 to-black/10" />
      <span className="relative flex min-w-0 flex-1 items-center gap-3 px-5 lg:px-7">
        <span className="min-w-0 flex-1">
          <span className="t-caption block font-semibold uppercase tracking-[0.08em] text-white/60">Part of</span>
          <span className="block truncate text-[19px] font-bold leading-tight text-white lg:text-[24px]">{collection.name}</span>
          <span className="t-footnote mt-0.5 block text-white/70">Every film in the series, in order</span>
        </span>
        <ChevronRight className="h-6 w-6 shrink-0 text-white/70" strokeWidth={2.4} />
      </span>
    </Link>
  )
}
