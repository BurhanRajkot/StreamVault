import { useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { useInfiniteQuery } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import type { Media } from '@/lib/config'
import { BROWSE_GENRES, fetchGenrePage, type BrowseSort } from '@app/lib/extras'
import { PosterGrid, PosterGridSkeleton } from '@app/components/media'
import { PageHeader } from '@app/components/PageHeader'
import { SegmentedControl } from '@app/components/kit'

type Kind = 'movie' | 'tv'

const SORTS: { id: BrowseSort; label: string }[] = [
  { id: 'popular', label: 'Popular' },
  { id: 'top', label: 'Top Rated' },
  { id: 'new', label: 'Newest' },
]

/** TMDB stops at page 500; nobody scrolls that far, but the feed must end somewhere. */
const MAX_PAGES = 30

/** One genre, all of it: films or shows, popular, best rated or newest — more as the viewer scrolls. */
export function BrowseScreen() {
  const { slug } = useParams()
  const genre = BROWSE_GENRES.find((g) => g.slug === slug)
  const kinds: { id: Kind; label: string }[] = [
    ...(genre?.movie ? [{ id: 'movie' as const, label: 'Movies' }] : []),
    ...(genre?.tv ? [{ id: 'tv' as const, label: 'Shows' }] : []),
  ]
  const [picked, setKind] = useState<Kind | null>(null)
  const kind: Kind = picked && kinds.some((k) => k.id === picked) ? picked : kinds[0]?.id ?? 'movie'
  const [sort, setSort] = useState<BrowseSort>('popular')

  const query = useInfiniteQuery({
    queryKey: ['app-browse', slug, kind, sort],
    queryFn: ({ pageParam }) => (genre ? fetchGenrePage(genre, kind, sort, pageParam) : Promise.resolve([])),
    initialPageParam: 1,
    getNextPageParam: (last: Media[], pages) => (last.length >= 15 && pages.length < MAX_PAGES ? pages.length + 1 : undefined),
    enabled: !!genre && !genre.to,
    staleTime: 60 * 60 * 1000,
  })
  // Pages overlap now and then as TMDB's order shifts: each title once
  const items = useMemo(() => {
    const seen = new Set<number>()
    return (query.data?.pages.flat() ?? []).filter((m) => m.poster_path && !seen.has(m.id) && seen.add(m.id))
  }, [query.data])

  // The next page as the end of the grid comes near
  const sentinel = useRef<HTMLDivElement>(null)
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query
  useEffect(() => {
    const el = sentinel.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && hasNextPage && !isFetchingNextPage) void fetchNextPage()
      },
      { rootMargin: '1200px 0px' }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, items.length])

  if (!genre) return <Navigate to="/search" replace />
  if (genre.to) return <Navigate to={genre.to} replace />

  return (
    <div className="px-4 pb-tabbar pt-page lg:px-12">
      <PageHeader back backTo="/search" title={genre.name} />
      <div className="mb-5 flex flex-wrap items-center gap-3 lg:mb-7">
        {kinds.length > 1 && <SegmentedControl<Kind> size="sm" layoutId="browse-kind" value={kind} onChange={setKind} options={kinds} className="w-full sm:w-auto" />}
        <SegmentedControl<BrowseSort> size="sm" layoutId="browse-sort" value={sort} onChange={setSort} options={SORTS} className="w-full sm:w-auto" />
      </div>

      {query.isLoading ? (
        <PosterGridSkeleton count={18} />
      ) : items.length === 0 ? (
        <p className="t-body text-label-2">Nothing here right now. Try another order, or check your connection.</p>
      ) : (
        <PosterGrid key={`${kind}-${sort}`} items={items} kind={kind} />
      )}
      <div ref={sentinel} aria-hidden="true" className="h-px" />
      {isFetchingNextPage && (
        <div className="flex justify-center py-6">
          <Loader2 className="h-6 w-6 animate-spin text-label-2" />
        </div>
      )}
    </div>
  )
}
