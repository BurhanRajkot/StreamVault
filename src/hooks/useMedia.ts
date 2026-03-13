// ============================================================
// useMedia — Powered by React Query (useInfiniteQuery)
// Replaces raw useState/useEffect pattern.
// Benefits:
//   • Auto-caches by (mode, providerId) key for 5 min — back-nav is instant
//   • De-duplication: repeated mounts for the same mode won't re-fetch
//   • Infinite scroll pages accumulate correctly via getNextPageParam
// ============================================================

import { useState, useCallback } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { fetchPopular, fetchTrending, searchMedia } from '@/lib/api'
import { Media, MediaMode } from '@/lib/config'

// How many items to show on the very first page render
const INITIAL_SLICE = 16

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

  // Flatten trending to a plain array
  const trending: Media[] = (trendingQuery.data?.pages.flat() as unknown as Media[]) ?? []

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
    getNextPageParam: (lastPage, allPages) => {
      const nextPage = allPages.length + 1
      return nextPage <= (lastPage.total_pages || 1) ? nextPage : undefined
    },
    initialPageParam: 1,
    staleTime: 2 * 60 * 1000,
    gcTime: 5 * 60 * 1000,
    enabled: isSearchMode && searchQuery.length > 0 && mode !== 'downloads',
  })

  // ─── Derive media list ───────────────────────────────────────────────────
  const activeQuery = isSearchMode ? searchQuery_ : popularQuery

  const allPages = activeQuery.data?.pages ?? []
  let media: Media[] = []

  if (isSearchMode) {
    // Search: show all results as-is (user expects them immediately)
    media = allPages.flatMap((p) => p.results)
  } else {
    // Popular: slice first page to INITIAL_SLICE, rest is unsliced
    media = allPages.flatMap((p, i) =>
      i === 0 ? p.results.slice(0, INITIAL_SLICE) : p.results
    )
  }

  const isLoading = activeQuery.isLoading || activeQuery.isFetchingNextPage
  const hasMore = activeQuery.hasNextPage ?? false

  // ─── Actions ────────────────────────────────────────────────────────────
  const loadMore = useCallback(() => {
    if (!isLoading && hasMore) {
      activeQuery.fetchNextPage()
    }
  }, [isLoading, hasMore, activeQuery])

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
    activeQuery.refetch()
  }, [activeQuery])

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
