import { useEffect, useMemo, useRef, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import type { Media } from '@/lib/config'
import { useIsAdmin } from '@/hooks/useIsAdmin'
import { fetchMatureMovies, fetchMatureShows } from '@app/lib/mature'
import { PosterGrid, PosterGridSkeleton } from '@app/components/media'
import { PageHeader } from '@app/components/PageHeader'
import { SegmentedControl } from '@app/components/kit'

type Kind = 'movie' | 'tv'

const KINDS: { id: Kind; label: string }[] = [
  { id: 'movie', label: 'Movies' },
  { id: 'tv', label: 'Shows' },
]

/** TMDB's erotic-film list is short; stop paging well before it runs dry. */
const MAX_PAGES = 6

/**
 * The 18+ shelf: erotic films and sensual shows. Admin only — anyone else who
 * lands here (a stale link, a signed-out admin) is sent to the admin sign-in.
 */
export function MatureScreen() {
  const isAdmin = useIsAdmin()
  const [kind, setKind] = useState<Kind>('movie')

  const movies = useInfiniteQuery({
    queryKey: ['app-mature-movies'],
    queryFn: ({ pageParam }) => fetchMatureMovies(pageParam),
    initialPageParam: 1,
    getNextPageParam: (last: Media[], pages) => (last.length >= 15 && pages.length < MAX_PAGES ? pages.length + 1 : undefined),
    enabled: isAdmin && kind === 'movie',
    staleTime: 60 * 60 * 1000,
  })
  const shows = useQuery({ queryKey: ['app-mature-shows'], queryFn: fetchMatureShows, enabled: isAdmin && kind === 'tv', staleTime: 60 * 60 * 1000 })

  const items = useMemo(() => {
    const seen = new Set<number>()
    const all = kind === 'movie' ? movies.data?.pages.flat() ?? [] : shows.data ?? []
    return all.filter((m) => m.poster_path && !seen.has(m.id) && seen.add(m.id))
  }, [kind, movies.data, shows.data])
  const loading = kind === 'movie' ? movies.isLoading : shows.isLoading

  // The next page of films as the end of the grid comes near
  const sentinel = useRef<HTMLDivElement>(null)
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = movies
  useEffect(() => {
    const el = sentinel.current
    if (!el || kind !== 'movie') return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && hasNextPage && !isFetchingNextPage) void fetchNextPage()
      },
      { rootMargin: '1200px 0px' }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [kind, hasNextPage, isFetchingNextPage, fetchNextPage, items.length])

  if (!isAdmin) return <Navigate to="/admin" replace />

  return (
    <div className="px-4 pb-tabbar pt-page lg:px-12">
      <PageHeader back backTo="/me" title="18+" subtitle="Erotic films and sensual shows — admin only" />
      <div className="mb-5 flex flex-wrap items-center gap-3 lg:mb-7">
        <SegmentedControl<Kind> size="sm" layoutId="mature-kind" value={kind} onChange={setKind} options={KINDS} className="w-full sm:w-auto" />
      </div>

      {loading ? (
        <PosterGridSkeleton count={18} />
      ) : items.length === 0 ? (
        <p className="t-body text-label-2">Nothing here right now. Check your connection.</p>
      ) : (
        <PosterGrid key={kind} items={items} kind={kind} />
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
