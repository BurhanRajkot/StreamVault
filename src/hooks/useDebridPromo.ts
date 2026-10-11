import { useQuery } from '@tanstack/react-query'
import { fetchDebridPromo } from '@/lib/debridApi'

/**
 * End of the free Real-Debrid promotion, or null when there is none (or the
 * backend couldn't be asked — the UI then just doesn't advertise it; access
 * is decided server-side either way).
 */
export function useDebridFreeUntil(): Date | null {
  const { data } = useQuery({
    queryKey: ['debrid-promo'],
    queryFn: fetchDebridPromo,
    staleTime: 60 * 60 * 1000,
    retry: false,
  })
  if (!data?.freeUntil) return null
  const until = new Date(data.freeUntil)
  return until.getTime() > Date.now() ? until : null
}

/** "Apr 11, 2027" */
export function formatPromoDate(date: Date): string {
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}
