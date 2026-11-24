import { useEffect, useMemo, useRef, useState } from 'react'
import { useQueries, useQuery } from '@tanstack/react-query'
import { useAuth0 } from '@auth0/auth0-react'
import type { Media } from '@/lib/config'
import { fetchContinueWatching, getGuestProgress } from '@/lib/api'
import { useFavorites } from '@/context/FavoritesContext'
import { detailsQuery } from '@app/lib/useTitle'
import { discoveryFeed, loadFeedRow, type FeedRowSpec, type TasteTitle } from '@app/lib/discoveryFeed'
import { PosterRow, WideRow } from './media'

/** Rows asked for at a time, as the viewer nears the end. */
const BATCH = 4
/** A row with fewer new titles than this (after the rows above took theirs) isn't shown. */
const MIN_NEW_TITLES = 6
/** Titles a row shows — and keeps from the rows below it. */
const ROW_TITLES = 18
/** Titles watched or saved that the personal rows are made from. */
const TASTE_TITLES = 8
const FEED_STALE_MS = 60 * 60 * 1000

const titleKey = (m: Media, kind?: string) => `${m.media_type ?? kind ?? 'movie'}:${m.id}`

/** What the viewer watched (finished too) and saved, most recent first. */
function useTasteSeeds(enabled: boolean): { seeds: { kind: 'movie' | 'tv'; id: number }[]; ready: boolean } {
  const { isAuthenticated, isLoading, user, getAccessTokenSilently } = useAuth0()
  const { favorites } = useFavorites()
  const { data: watched, isFetched } = useQuery({
    queryKey: ['app-taste-seeds', isAuthenticated ? (user?.sub ?? 'user') : 'guest'],
    queryFn: async () => {
      if (!isAuthenticated) return getGuestProgress()
      try {
        return await fetchContinueWatching(await getAccessTokenSilently())
      } catch {
        return getGuestProgress()
      }
    },
    enabled: enabled && !isLoading,
    staleTime: 10 * 60 * 1000,
  })
  const seeds = useMemo(() => {
    const seen = new Set<string>()
    const out: { kind: 'movie' | 'tv'; id: number }[] = []
    const add = (kind: 'movie' | 'tv', id: number) => {
      const key = `${kind}:${id}`
      if (!id || seen.has(key)) return
      seen.add(key)
      out.push({ kind, id })
    }
    for (const item of watched ?? []) add(item.mediaType, item.tmdbId)
    for (const f of [...favorites].reverse()) add(f.mediaType, f.tmdbId)
    return out.slice(0, TASTE_TITLES)
  }, [watched, favorites])
  return { seeds, ready: isFetched }
}

/**
 * Home's endless part (lib/discoveryFeed): starts once the viewer nears the
 * end of the fixed rows, then a few rows more each time they get close to
 * the bottom. No title shows twice: a row only shows what the rows above —
 * and `exclude`, the personal rows higher up — didn't.
 */
export function DiscoveryFeed({ exclude, excludeTitles }: { exclude: ReadonlySet<string>; excludeTitles: ReadonlySet<string> }) {
  const sentinel = useRef<HTMLDivElement>(null)
  const [near, setNear] = useState(false)
  const [started, setStarted] = useState(false)
  const [count, setCount] = useState(0)

  useEffect(() => {
    const el = sentinel.current
    if (!el) return
    const observer = new IntersectionObserver(([entry]) => setNear(entry.isIntersecting), { rootMargin: '1400px 0px' })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    if (near) setStarted(true)
  }, [near])

  const { seeds, ready: seedsReady } = useTasteSeeds(started)
  const details = useQueries({
    queries: seeds.map((s) => ({ ...detailsQuery(s.kind, s.id), enabled: started && seedsReady })),
  })
  const detailsSettled = details.every((d) => !d.isLoading)
  // Made once, when what it's made from is in: rows mustn't reshuffle under the viewer
  const [feed, setFeed] = useState<FeedRowSpec[] | null>(null)
  useEffect(() => {
    if (feed || !started || !seedsReady || !detailsSettled) return
    const titles: TasteTitle[] = details.flatMap((d, i) => (d.data ? [{ kind: seeds[i].kind, media: d.data }] : []))
    setFeed(discoveryFeed(titles))
  }, [feed, started, seedsReady, detailsSettled, details, seeds])

  const specs = useMemo(() => (feed ?? []).slice(0, count), [feed, count])
  const rows = useQueries({
    queries: specs.map((spec) => ({
      queryKey: ['app-feed', spec.key],
      queryFn: () => loadFeedRow(spec),
      staleTime: FEED_STALE_MS,
    })),
  })
  const settled = rows.every((r) => !r.isLoading)

  // Near the bottom with everything asked for in: the next few rows. Rows
  // that come back with nothing new leave the bottom in view, so this runs
  // again until something fills the screen or the feed is done.
  const total = feed?.length ?? 0
  useEffect(() => {
    if (near && settled && count < total) setCount((n) => Math.min(total, n + BATCH))
  }, [near, settled, total, count])

  const rowsState = rows.map((r) => `${r.status}:${r.dataUpdatedAt}`).join(',')
  const shown = useMemo(() => {
    const seen = new Set(exclude)
    for (const s of seeds) seen.add(`${s.kind}:${s.id}`)
    return specs.map((spec, i) => {
      const result = rows[i]
      // A row the personal rows above already have ("Starring Cillian Murphy")
      if (excludeTitles.has(spec.title)) return null
      if (!result || result.isLoading) return { spec, items: undefined, loading: true }
      const art = (result.data ?? []).filter((m) => (spec.style === 'wide' ? m.backdrop_path : m.poster_path))
      if (spec.whole) return art.length >= 2 ? { spec, items: art, loading: false } : null
      const fresh = art.filter((m) => !seen.has(titleKey(m, spec.kind)))
      if (fresh.length < MIN_NEW_TITLES) return null
      const items = fresh.slice(0, ROW_TITLES)
      for (const m of items) seen.add(titleKey(m, spec.kind))
      return { spec, items, loading: false }
    })
    // `rows` is a new array every render: `rowsState` says when what's in it changed
  }, [specs, exclude, excludeTitles, seeds, rowsState])

  return (
    <>
      {shown.map((row) =>
        row === null ? null : row.spec.style === 'wide' ? (
          <WideRow key={row.spec.key} title={row.spec.title} items={row.items} loading={row.loading} kind={row.spec.kind} />
        ) : (
          <PosterRow key={row.spec.key} title={row.spec.title} items={row.items} loading={row.loading} kind={row.spec.kind} />
        )
      )}
      <div ref={sentinel} aria-hidden="true" className="h-px" />
    </>
  )
}
