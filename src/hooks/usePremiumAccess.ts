import { useQuery } from '@tanstack/react-query'
import { useAuth0 } from '@auth0/auth0-react'
import { fetchMyAccess, type PremiumReason } from '@/lib/api'
import { useIsAdmin } from './useIsAdmin'

export interface PremiumAccessState {
  /** May play ⚡ Premium. */
  premium: boolean
  reason: PremiumReason
  admin: boolean
  /** The admin suspended this account. */
  suspended: boolean
  /**
   * The Premium player may offer its file to save or open in VLC — the admin
   * can switch that off per account. Magnet-link downloads aren't affected.
   */
  downloads: boolean
  /** Still asking the backend. */
  loading: boolean
}

export const MY_ACCESS_QUERY_KEY = 'me-access'

/**
 * Whether this viewer may use ⚡ Premium: the admin always, a signed-in
 * account when the admin approved it (asked of the backend), a guest never.
 * A UI hint only — the backend checks every Premium call itself.
 */
export function usePremiumAccess(): PremiumAccessState {
  const admin = useIsAdmin()
  const { isAuthenticated, getAccessTokenSilently, user } = useAuth0()
  const { data, isLoading } = useQuery({
    queryKey: [MY_ACCESS_QUERY_KEY, user?.sub],
    queryFn: async () => fetchMyAccess(await getAccessTokenSilently()),
    enabled: isAuthenticated && !admin,
    staleTime: 60_000,
    retry: 1,
  })

  if (admin) return { premium: true, reason: 'granted', admin: true, suspended: false, downloads: true, loading: false }
  if (!isAuthenticated) {
    return { premium: false, reason: 'sign-in-required', admin: false, suspended: false, downloads: false, loading: false }
  }
  if (!data) {
    return { premium: false, reason: 'not-approved', admin: false, suspended: false, downloads: false, loading: isLoading }
  }
  return {
    premium: data.premium,
    reason: data.premiumReason,
    admin: false,
    suspended: data.suspended,
    downloads: data.debridDownloads !== false,
    loading: false,
  }
}
