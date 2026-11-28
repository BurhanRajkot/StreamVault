import { useMemo, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuth0 } from '@auth0/auth0-react'
import type { Media, MediaMode } from '@/lib/config'
import type { RecoSection } from '@/lib/api'
import { useRecommendations } from '@/hooks/useRecommendations'
import { rowsFor, recoToMedia, type RowSpec } from '@app/lib/catalog'
import { ComingSoonRow, PosterRow, TopTenRow, WideRow } from '@app/components/media'
import { HeroCarousel } from '@app/components/HeroCarousel'
import { ContinueWatchingRow } from '@app/components/ContinueWatchingRow'
import { MyListRow } from '@app/components/MyListRow'
import { TasteSetup } from '@app/components/TasteSetup'
import { CategoryHeader } from '@app/components/CategoryHeader'
import { DiscoveryFeed } from '@app/components/DiscoveryFeed'

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
      <CategoryHeader active={mode} />
      <HeroCarousel items={featured} fallbackKind={heroRow.kind} />

      {/* The rows ride up over the hero's fade */}
      <div className="relative z-10 lg:-mt-[4vw]">
        {(mode === 'home' || mode === 'movie' || mode === 'tv') && <ContinueWatchingRow />}
        {mode === 'home' ? (
          <HomeRows mode={mode} rows={rows} />
        ) : (
          rows.map((row) => <CatalogRow key={`${mode}-${row.key}`} mode={mode} spec={row} />)
        )}
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

function CatalogRow({ mode, spec }: { mode: MediaMode; spec: RowSpec }) {
  const { data, isLoading } = useQuery({
    queryKey: ['app-row', mode, spec.key],
    queryFn: spec.load,
    staleTime: ROW_STALE_MS,
  })
  if (spec.style === 'top10') return <TopTenRow title={spec.title} items={data} loading={isLoading} kind={spec.kind} />
  if (spec.style === 'wide') return <WideRow title={spec.title} items={data} loading={isLoading} kind={spec.kind} />
  if (spec.style === 'soon') return <ComingSoonRow title={spec.title} items={data} loading={isLoading} />
  return <PosterRow title={spec.title} items={data} loading={isLoading} kind={spec.kind} />
}

// ---------------------------------------------------------------------------
// Home: the personal rows among the rest, then a feed that keeps going
// ---------------------------------------------------------------------------

/** "Because you watched" rows on Home — one idea, so only a few, never two in a row. */
const MAX_BECAUSE_ROWS = 3
/** A personal row needs this many titles the rows above it didn't show. */
const MIN_NEW_TITLES = 6
/** My List comes after this many rows. */
const MY_LIST_AFTER = 6

const isBecause = (title: string) => /^Because you (watched|liked)\b/i.test(title)
/**
 * The catalog has these already: trending and popular (Top 10 Today, Trending
 * Movies…), top rated (All-Time Greats). The backend's guest rows are all of
 * this kind, so a signed-out Home used to open on "Most Popular Right Now" —
 * the same titles as the Top 10 row under it and the hero above it.
 */
const isGeneric = (title: string) =>
  /^(Trending This Week|(Most )?Popular Right Now|Top Rated All Time|Discover New Favourites)$/i.test(title)
const itemKey = (m: Media) => `${m.media_type ?? 'movie'}:${m.id}`

interface PersonalRow {
  title: string
  items: Media[]
}

/**
 * The recommendation rows as Home shows them: Top Picks first, then "Because
 * you watched" and the other kinds (a genre, an actor, fans like you) taking
 * turns — and each showing only titles the rows above it didn't. The
 * backend's "Because you watched" rows share most of their titles with Top
 * Picks and with each other, which is what made Home feel like the same row
 * six times.
 */
export function arrangePersonalRows(sections: RecoSection[], limit: number): PersonalRow[] {
  const usable = sections.filter((s) => !isGeneric(s.title))
  const because = usable.filter((s) => isBecause(s.title))
  const others = usable.filter((s) => !isBecause(s.title))
  const [lead, ...rest] = others[0]?.title === 'Top Picks for You' ? others : [undefined, ...others]

  const ordered: RecoSection[] = lead ? [lead] : []
  for (let i = 0; i < Math.max(because.length, rest.length); i++) {
    if (because[i]) ordered.push(because[i])
    if (rest[i]) ordered.push(rest[i])
  }

  const seen = new Set<string>()
  const out: PersonalRow[] = []
  let becauseRows = 0
  for (const section of ordered) {
    if (out.length >= limit) break
    if (isBecause(section.title) && becauseRows >= MAX_BECAUSE_ROWS) continue
    // Two "Because you watched" rows may still meet when the others ran out
    if (isBecause(section.title) && out.length > 0 && isBecause(out[out.length - 1].title)) continue
    const fresh = section.items.map(recoToMedia).filter((m) => m.poster_path && !seen.has(itemKey(m)))
    if (fresh.length < MIN_NEW_TITLES) continue
    const items = fresh.slice(0, 18)
    for (const m of items) seen.add(itemKey(m))
    if (isBecause(section.title)) becauseRows++
    out.push({ title: section.title, items })
  }
  return out
}

function HomeRows({ mode, rows }: { mode: MediaMode; rows: RowSpec[] }) {
  const { isAuthenticated } = useAuth0()
  const { sections, isLoading } = useRecommendations(true)
  const personal = useMemo(() => arrangePersonalRows(sections, isAuthenticated ? 8 : 1), [sections, isAuthenticated])
  const shownPersonal = useMemo(() => new Set(personal.flatMap((r) => r.items.map(itemKey))), [personal])
  const personalTitles = useMemo(() => new Set(personal.map((r) => r.title)), [personal])

  // Top Picks, then the catalog and the personal rows taking turns
  const slots: ReactNode[] = []
  // Guests get no personal row (theirs are all generic), so no placeholder that would vanish
  if (isAuthenticated && isLoading && personal.length === 0) slots.push(<PosterRow key="reco-loading" title="Recommended for You" items={[]} loading />)
  const catalog = rows.map((row) => <CatalogRow key={`${mode}-${row.key}`} mode={mode} spec={row} />)
  const mine = personal.map((r) => <PosterRow key={`reco-${r.title}`} title={r.title} items={r.items} />)
  if (mine[0]) slots.push(mine[0])
  for (let i = 0; i < Math.max(catalog.length, mine.length - 1); i++) {
    if (catalog[i]) slots.push(catalog[i])
    if (mine[i + 1]) slots.push(mine[i + 1])
  }
  slots.splice(Math.min(MY_LIST_AFTER, slots.length), 0, <MyListRow key="my-list" />)

  return (
    <>
      <TasteSetup />
      {slots}
      <DiscoveryFeed exclude={shownPersonal} excludeTitles={personalTitles} />
    </>
  )
}
