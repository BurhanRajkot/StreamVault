import { useCallback } from 'react'
import { useAuth0 } from '@auth0/auth0-react'
import { getAdminToken } from '@/lib/api'

/**
 * The token for Premium's /debrid/* calls: an admin's, else the signed-in
 * viewer's, else none (a guest — fine while the free promotion runs).
 */
export function useDebridToken(): () => Promise<string | undefined> {
  const { isAuthenticated, getAccessTokenSilently } = useAuth0()
  return useCallback(async () => {
    try {
      const adminToken = getAdminToken()
      if (adminToken) return adminToken
      if (isAuthenticated) return await getAccessTokenSilently()
    } catch {
      // Guest, or a silent token error — the request goes without one
    }
    return undefined
  }, [isAuthenticated, getAccessTokenSilently])
}
