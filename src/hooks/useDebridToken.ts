import { useCallback } from 'react'
import { useAuth0 } from '@auth0/auth0-react'
import { getAdminToken } from '@/lib/api'

/**
 * The token for Premium's /debrid/* calls: the admin's when signed in as
 * admin, else the signed-in account's (Premium works for accounts the admin
 * approved), else none.
 */
export function useDebridToken(): () => Promise<string | undefined> {
  const { isAuthenticated, getAccessTokenSilently } = useAuth0()
  return useCallback(async () => {
    const admin = getAdminToken()
    if (admin) return admin
    if (!isAuthenticated) return undefined
    try {
      return await getAccessTokenSilently()
    } catch {
      return undefined
    }
  }, [isAuthenticated, getAccessTokenSilently])
}
