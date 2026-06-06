import { QueryClient } from '@tanstack/react-query'

/**
 * React Query client configuration
 * Optimized for performance with caching and background refetching
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Cache data for 10 minutes — reduces re-fetching on tab switches / back nav
      staleTime: 10 * 60 * 1000,
      // Keep unused data in cache for 30 minutes — instant back navigation
      gcTime: 30 * 60 * 1000,
      // Only retry once — faster failure on bad network instead of 3 slow retries
      retry: 1,
      // Retry delay increases exponentially
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 15000),
      // Don't refetch just because the window came back into focus — kills performance
      // when users alt-tab. Content is still fresh from the staleTime above.
      refetchOnWindowFocus: false,
      // Don't refetch on mount if data is fresh
      refetchOnMount: false,
      // Refetch on reconnect
      refetchOnReconnect: true,
    },
    mutations: {
      // Retry mutations once
      retry: 1,
    },
  },
})
