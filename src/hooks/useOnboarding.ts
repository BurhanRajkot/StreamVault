import { useMemo, useCallback, useState } from 'react'
import { useAuth0 } from '@auth0/auth0-react'

const STORAGE_KEY_PREFIX = 'cinematch_onboarded_'

/**
 * Controls the CineMatch first-time onboarding overlay.
 *
 * Logic:
 *  - If user is not authenticated → never show
 *  - If `localStorage.getItem('cinematch_onboarded_<userId>')` is set → never show
 *  - Otherwise → show the onboarding overlay
 *
 * After the user completes onboarding, call `markDone()` to:
 *  1. Set the localStorage flag (prevents re-showing on same browser)
 *  2. Collapse the overlay
 */
export function useOnboarding() {
  const { isAuthenticated, user } = useAuth0()
  const [dismissed, setDismissed] = useState(false)

  const userId = user?.sub
  const storageKey = userId ? `${STORAGE_KEY_PREFIX}${userId}` : null

  const shouldShowOnboarding = useMemo(() => {
    if (!isAuthenticated || !userId || dismissed) return false
    if (!storageKey) return false
    return localStorage.getItem(storageKey) !== 'true'
  }, [isAuthenticated, userId, storageKey, dismissed])

  const markDone = useCallback(() => {
    if (storageKey) {
      localStorage.setItem(storageKey, 'true')
    }
    setDismissed(true)
  }, [storageKey])

  return { shouldShowOnboarding, markDone, userId }
}
