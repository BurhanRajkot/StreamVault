import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth0 } from '@auth0/auth0-react'
import { motion } from 'framer-motion'
import type { MediaMode } from '@/lib/config'
import { cn } from '@/lib/utils'
import { useRecommendations } from '@/hooks/useRecommendations'
import { rowsFor, recoToMedia, type RowSpec } from '@app/lib/catalog'
import { useScrolled } from '@app/lib/hooks'
import { spring } from '@app/lib/motion'
import { PosterRow, TopTenRow, WideRow } from '@app/components/media'
import { HeroCarousel } from '@app/components/HeroCarousel'
import { ContinueWatchingRow } from '@app/components/ContinueWatchingRow'
import { MyListRow } from '@app/components/MyListRow'
import { Logo } from '@app/components/Logo'

const CATEGORIES: { mode: MediaMode; label: string; to: string }[] = [
  { mode: 'home', label: 'For You', to: '/' },
  { mode: 'movie', label: 'Movies', to: '/movies' },
  { mode: 'tv', label: 'Shows', to: '/tv' },
  { mode: 'anime', label: 'Anime', to: '/anime' },
  { mode: 'documentary', label: 'Docs', to: '/documentaries' },
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
  const featured = useMemo(() => rotateDaily(heroItems ?? []), [heroItems])

  return (
    <div className="pb-tabbar">
      <PhoneHeader mode={mode} />
      <HeroCarousel items={featured} fallbackKind={heroRow.kind} />

      {/* The rows ride up over the hero's fade */}
      <div className="relative z-10 mt-2 lg:-mt-[6vw]">
        {(mode === 'home' || mode === 'movie' || mode === 'tv') && <ContinueWatchingRow />}
        {mode === 'home' && <Recommendations />}
        {rows.map((row) => (
          <CatalogRow key={`${mode}-${row.key}`} mode={mode} spec={row} />
        ))}
        {mode === 'home' && <MyListRow />}
      </div>
    </div>
  )
}

/** Today's order of the featured titles — it changes daily, but holds still all day. */
function rotateDaily<T>(items: T[]): T[] {
  if (items.length === 0) return items
  const day = Math.floor(Date.now() / 86_400_000)
  const head = day % Math.min(items.length, 6)
  return [...items.slice(head), ...items.slice(0, head)]
}

/** The phone's header: logo and categories, clear over the hero, frosted glass once scrolled. */
function PhoneHeader({ mode }: { mode: MediaMode }) {
  const scrolled = useScrolled(40)
  return (
    <header
      className={cn(
        'fixed inset-x-0 top-0 z-30 pt-safe transition-[background-color,backdrop-filter,box-shadow] duration-300 lg:hidden',
        scrolled ? 'material-bar' : 'bg-gradient-to-b from-black/60 via-black/25 to-transparent'
      )}
    >
      <div className="flex h-11 items-center px-4">
        <Logo />
      </div>
      <nav className="no-scrollbar flex gap-2 overflow-x-auto px-4 pb-2.5 pt-1" aria-label="Categories">
        {CATEGORIES.map((c) => {
          const active = c.mode === mode
          return (
            <Link
              key={c.mode}
              to={c.to}
              replace
              aria-current={active ? 'page' : undefined}
              className={cn(
                'relative flex h-8 shrink-0 items-center rounded-full px-3.5 text-[14px] font-semibold transition-colors',
                active ? 'text-black' : 'glass-button text-white'
              )}
            >
              {active && <motion.span layoutId="category-pill" transition={spring} className="absolute inset-0 -z-10 rounded-full bg-white" />}
              {c.label}
            </Link>
          )
        })}
      </nav>
    </header>
  )
}

function CatalogRow({ mode, spec }: { mode: MediaMode; spec: RowSpec }) {
  const { data, isLoading } = useQuery({
    queryKey: ['app-row', mode, spec.key],
    queryFn: spec.load,
    staleTime: ROW_STALE_MS,
  })
  if (spec.style === 'top10') return <TopTenRow title={spec.title} items={data} kind={spec.kind} />
  if (spec.style === 'wide') return <WideRow title={spec.title} items={data} loading={isLoading} kind={spec.kind} />
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
