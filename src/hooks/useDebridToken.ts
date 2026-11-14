import { useCallback } from 'react'
import { getAdminToken } from '@/lib/api'

/**
 * The token for Premium's /debrid/* calls. Premium is admin-only, so it is
 * the admin's or nothing — a viewer's Auth0 token would only be refused.
 */
export function useDebridToken(): () => Promise<string | undefined> {
  return useCallback(async () => getAdminToken() ?? undefined, [])
}
