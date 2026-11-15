import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth0 } from '@auth0/auth0-react'
import { Info, Play, Plus, Check } from 'lucide-react'
import type { Media, MediaMode } from '@/lib/config'

import { genreNames } from '@/lib/genres'
import { cn, genreIdsOf } from '@/lib/utils'
import { useRecommendations } from '@/hooks/useRecommendations'
import { useFavorites } from '@/context/FavoritesContext'
import { rowsFor, recoToMedia, type RowSpec } from '@app/lib/catalog'
import { kindOf, PosterRow, TopTenRow, titleOf, tmdbImg } from '@app/components/media'
import { ContinueWatchingRow } from '@app/components/ContinueWatchingRow'
import { MyListRow } from '@app/components/MyListRow'
import { Logo } from '@app/components/Logo'

const CATEGORIES: { mode: MediaMode; label: string; to: string }[] = [
  { mode: 'home', label: 'All', to: '/' },
  { mode: 'movie', label: 'Movies', to: '/movies' },
  { mode: 'tv', label: 'TV Shows', to: '/tv' },
  { mode: 'anime', label: 'Anime', to: '/anime' },
  { mode: 'documentary', label: 'Documentaries', to: '/documentaries' },
]

const ROW_STALE_MS = 30 * 60 * 1000

export function HomeScreen({ mode }: { mode: MediaMode }) {
  const rows = useMemo(() => rowsFor(mode), [mode])
  const heroRow = rows[0]
  const { data: heroItems } = useQuery({
    queryKey: ['app-row', mode, heroRow.key],
    queryFn: heroRow.load,
    staleTime: ROW_STALE_MS,
  })
  const hero = useMemo(() => pickHero(heroItems), [heroItems])

  return (
    <div className="app-scroll pb-tabbar lg:pb-10">
      <header className="sticky top-0 z-20 bg-gradient-to-b from-[#0a0a0c] via-[#0a0a0c]/90 to-transparent pt-safe lg:static lg:bg-none">
        <div className="flex items-center justify-between px-4 pb-1 pt-3 lg:hidden">
          <Logo />
        </div>
        <nav className="no-scrollbar flex gap-2 overflow-x-auto px-4 pb-3 pt-2 lg:px-8 lg:pt-6" aria-label="Categories">
          {CATEGORIES.map((c) => (
            <Link
              key={c.mode}
              to={c.to}
              replace
              className={cn(
                'shrink-0 rounded-full border px-3.5 py-1.5 text-[12.5px] font-medium transition-colors',
                c.mode === mode ? 'border-white bg-white text-black' : 'border-white/20 text-white/80'
              )}
            >
              {c.label}
            </Link>
          ))}
        </nav>
      </header>

      {hero ? <Hero media={hero} fallbackKind={heroRow.kind} /> : <div className="skeleton mx-4 mb-6 aspect-[2/3] max-h-[62vh] rounded-xl lg:mx-8 lg:aspect-[21/9]" />}

      {(mode === 'home' || mode === 'movie' || mode === 'tv') && <ContinueWatchingRow />}
      {mode === 'home' && <Recommendations />}
      {rows.map((row) => (
        <CatalogRow key={`${mode}-${row.key}`} mode={mode} spec={row} />
      ))}
      {mode === 'home' && <MyListRow />}
    </div>
  )
}

/** A day's featured title from the first row — varies, but holds still all day. */
function pickHero(items: Media[] | undefined): Media | null {
  const usable = (items ?? []).filter((m) => m.backdrop_path && m.poster_path).slice(0, 6)
  if (usable.length === 0) return null
  const day = Math.floor(Date.now() / 86_400_000)
  return usable[day % usable.length]
}

function CatalogRow({ mode, spec }: { mode: MediaMode; spec: RowSpec }) {
  const { data, isLoading } = useQuery({
    queryKey: ['app-row', mode, spec.key],
    queryFn: spec.load,
    staleTime: ROW_STALE_MS,
  })
  if (spec.style === 'top10') return <TopTenRow title={spec.title} items={data} kind={spec.kind} />
  return <PosterRow title={spec.title} items={data} loading={isLoading} kind={spec.kind} />
}

function Recommendations() {
  const { isAuthenticated } = useAuth0()
  const { sections, isLoading } = useRecommendations(true)
  const shown = sections.filter((s) => s.items.length >= 4).slice(0, isAuthenticated ? 3 : 1)
  if (isLoading && shown.length === 0) return <PosterRow title="Recommended for You" items={[]} loading />
  return (
    <>
      {shown.map((s) => (
        <PosterRow key={s.title} title={s.title} items={s.items.map(recoToMedia)} />
      ))}
    </>
  )
}

function Hero({ media, fallbackKind }: { media: Media; fallbackKind?: 'movie' | 'tv' }) {
  const navigate = useNavigate()
  const kind = kindOf(media, fallbackKind)
  const { isFavorited, toggleFavorite } = useFavorites()
  const inList = isFavorited(media.id, kind)
  const genres = genreNames(media.genre_ids ?? genreIdsOf(media), 3)

  const actions = (
    <div className="flex gap-2.5">
      <button
        onClick={() => navigate(`/watch/${kind}/${media.id}`)}
        className="press flex flex-1 items-center justify-center gap-2 rounded-md bg-white px-5 py-2.5 text-[14px] font-semibold text-black lg:flex-none lg:px-7"
      >
        <Play className="h-5 w-5 fill-black" /> Play
      </button>
      <button
        onClick={() => toggleFavorite(media.id, kind, media.genre_ids)}
        className="press flex flex-1 items-center justify-center gap-2 rounded-md bg-white/[0.16] px-5 py-2.5 text-[14px] font-semibold text-white backdrop-blur lg:flex-none"
      >
        {inList ? <Check className="h-5 w-5" /> : <Plus className="h-5 w-5" />} My List
      </button>
      <Link
        to={`/title/${kind}/${media.id}`}
        aria-label="More info"
        className="press hidden items-center justify-center gap-2 rounded-md bg-white/[0.16] px-5 py-2.5 text-[14px] font-semibold text-white backdrop-blur lg:flex"
      >
        <Info className="h-5 w-5" /> More Info
      </Link>
    </div>
  )

  return (
    <section className="mb-7 px-4 lg:px-8">
      {/* Phone: the poster, Netflix-style card */}
      <div className="relative mx-auto max-w-[420px] overflow-hidden rounded-xl shadow-2xl shadow-black/60 ring-1 ring-white/10 lg:hidden">
        <Link to={`/title/${kind}/${media.id}`} className="block">
          <img src={tmdbImg(media.poster_path, 'w780')} alt="" className="aspect-[2/3] max-h-[64vh] w-full object-cover" fetchPriority="high" />
        </Link>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black via-black/60 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-4">
          <h1 className="mb-1 text-center text-[22px] font-extrabold leading-tight tracking-tight text-white drop-shadow">{titleOf(media)}</h1>
          {genres.length > 0 && <p className="mb-3.5 text-center text-[12px] text-white/75">{genres.join('  ·  ')}</p>}
          {actions}
        </div>
      </div>

      {/* Wide window: the backdrop banner */}
      <div className="relative hidden overflow-hidden rounded-2xl ring-1 ring-white/[0.08] lg:block">
        <img src={tmdbImg(media.backdrop_path, 'w1280')} alt="" className="aspect-[21/9] w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/40 to-transparent" />
        <div className="absolute inset-y-0 left-0 flex max-w-xl flex-col justify-end p-10">
          <h1 className="mb-2 text-4xl font-extrabold tracking-tight text-white">{titleOf(media)}</h1>
          {genres.length > 0 && <p className="mb-3 text-sm text-white/70">{genres.join('  ·  ')}</p>}
          <p className="mb-5 line-clamp-3 text-sm leading-relaxed text-white/75">{media.overview}</p>
          {actions}
        </div>
      </div>
    </section>
  )
}
