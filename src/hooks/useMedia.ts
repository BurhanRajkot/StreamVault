// ============================================================
// useMedia — Powered by React Query (useInfiniteQuery)
// Replaces raw useState/useEffect pattern.
// Benefits:
//   • Auto-caches by (mode, providerId) key for 5 min — back-nav is instant
//   • De-duplication: repeated mounts for the same mode won't re-fetch
//   • Infinite scroll pages accumulate correctly via getNextPageParam
// ============================================================

import { useState, useCallback, useMemo } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { fetchPopular, fetchTrending, searchMedia } from '@/lib/api'
import { Media, MediaMode } from '@/lib/config'

interface UseMediaReturn {
  media: Media[]
  trending: Media[]
  isLoading: boolean
  hasMore: boolean
  loadMedia: (reset?: boolean) => void
  loadMore: () => void
  search: (query: string) => void
  clearSearch: () => void
  searchQuery: string
}

export function useMedia(mode: MediaMode, providerId: string | null = null): UseMediaReturn {
  const [searchQuery, setSearchQuery] = useState('')
  const [isSearchMode, setIsSearchMode] = useState(false)

  // ─── Trending query (simple, non-paginated) ─────────────────────────────
  const trendingQuery = useInfiniteQuery({
    queryKey: ['trending', mode],
    queryFn: () => fetchTrending(mode),
    getNextPageParam: () => undefined, // single page only
    initialPageParam: 1,
    staleTime: 5 * 60 * 1000,   // 5 min
    gcTime: 10 * 60 * 1000,     // keep in cache 10 min after unmount
    enabled: mode !== 'downloads',
  })

  // Flatten trending to a plain array. Memoised on the pages array so the
  // identity is stable across renders — a fresh array every render would defeat
  // the memo on every consumer downstream.
  const trendingPages = trendingQuery.data?.pages
  const trending: Media[] = useMemo(
    () => (trendingPages?.flat() as unknown as Media[]) ?? [],
    [trendingPages]
  )

  // ─── Main (popular/discover) infinite query ───────────────────────────────
  const popularQuery = useInfiniteQuery({
    queryKey: ['popular', mode, providerId],
    queryFn: ({ pageParam }) =>
      fetchPopular(mode, pageParam as number, providerId),
    getNextPageParam: (lastPage, allPages) => {
      const nextPage = allPages.length + 1
      return nextPage <= (lastPage.total_pages || 1) ? nextPage : undefined
    },
    initialPageParam: 1,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    enabled: mode !== 'downloads' && !isSearchMode,
  })

  // ─── Search query ───────────────────────────────────────────────────────
  const searchQuery_ = useInfiniteQuery({
    queryKey: ['search', mode, searchQuery],
    queryFn: ({ pageParam }) => searchMedia(mode, searchQuery, pageParam as number),
    getNextPageParam: (lastPage, allPages) =>
      lastPage.hasMore ? allPages.length + 1 : undefined,
    initialPageParam: 1,
    staleTime: 2 * 60 * 1000,
    gcTime: 5 * 60 * 1000,
    enabled: isSearchMode && searchQuery.length > 0 && mode !== 'downloads',
  })

  // ─── Derive media list ───────────────────────────────────────────────────
  const activeQuery = isSearchMode ? searchQuery_ : popularQuery

  const pages = activeQuery.data?.pages

  // Every fetched page is shown in full. An earlier version truncated page 1 to
  // the first 16 items as a "first render" optimisation, but the slice applied
  // on every render forever — the other 24 items of a blended home page were
  // fetched over the network and then permanently discarded.
  const media: Media[] = useMemo(
    () => (pages ?? []).flatMap((p) => p.results),
    [pages]
  )

  const isLoading = activeQuery.isLoading || activeQuery.isFetchingNextPage
  const hasMore = activeQuery.hasNextPage ?? false

  // ─── Actions ────────────────────────────────────────────────────────────
  // Depend on the query's own stable methods rather than the result object,
  // which React Query hands back fresh on state changes. An unstable loadMore
  // makes MediaGrid tear down and rebuild its infinite-scroll IntersectionObserver.
  const { fetchNextPage, refetch } = activeQuery

  const loadMore = useCallback(() => {
    if (!isLoading && hasMore) {
      fetchNextPage()
    }
  }, [isLoading, hasMore, fetchNextPage])

  const search = useCallback((query: string) => {
    setSearchQuery(query)
    if (query.trim().length === 0) {
      setIsSearchMode(false)
    } else {
      setIsSearchMode(true)
    }
  }, [])

  const clearSearch = useCallback(() => {
    setSearchQuery('')
    setIsSearchMode(false)
  }, [])

  // loadMedia kept for API compatibility (no-op: React Query handles it)
  const loadMedia = useCallback(() => {
    refetch()
  }, [refetch])

  return {
    media,
    trending,
    isLoading,
    hasMore,
    loadMore,
    loadMedia,
    search,
    clearSearch,
    searchQuery,
  }
}
