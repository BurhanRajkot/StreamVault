import { useState, useCallback, useEffect } from 'react'
import { useAuth0 } from '@auth0/auth0-react'

const STORAGE_KEY_PREFIX = 'cinematch_onboarded_'
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000'

/**
 * Controls the CineMatch first-time onboarding overlay.
 *
 * Logic:
 *  - If user is not authenticated → never show
 *  - If `localStorage.getItem('cinematch_onboarded_<userId>')` is set → never show
 *  - Otherwise → fetch /recommendations/profile to check if isNewUser
 *  - Show only if backend confirms the user is a new user
 *
 * After the user completes onboarding, call `markDone()` to:
 *  1. Set the localStorage flag (prevents re-showing on same browser)
 *  2. Collapse the overlay
 */
export function useOnboarding() {
  const { isAuthenticated, user, getAccessTokenSilently } = useAuth0()
  const [dismissed, setDismissed] = useState(false)
  const [isBackendNewUser, setIsBackendNewUser] = useState<boolean | null>(null)

  const userId = user?.sub
  const storageKey = userId ? `${STORAGE_KEY_PREFIX}${userId}` : null

  useEffect(() => {
    if (!isAuthenticated || !userId || !storageKey) return

    // Fast-path: if locally completed, skip backend check entirely
    if (localStorage.getItem(storageKey) === 'true') {
      setIsBackendNewUser(false)
      return
    }

    let isMounted = true

    const checkProfile = async () => {
      try {
        const token = await getAccessTokenSilently()
        const res = await fetch(`${API_BASE}/recommendations/profile`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok) throw new Error('Failed to fetch profile')
        const data = await res.json()
        
        if (isMounted) {
          setIsBackendNewUser(data.isNewUser === true)
          // If the backend knows the user is NOT new, mark it done locally so we don't fetch next time
          if (data.isNewUser === false) {
             localStorage.setItem(storageKey, 'true')
          }
        }
      } catch (err) {
        // Fallback: if backend check fails, assume not a new user to prevent annoyance
        if (isMounted) setIsBackendNewUser(false)
      }
    }

    checkProfile()

    return () => { isMounted = false }
  }, [isAuthenticated, userId, storageKey, getAccessTokenSilently])

  const shouldShowOnboarding = isAuthenticated && userId && !dismissed && isBackendNewUser === true

  const markDone = useCallback(() => {
    if (storageKey) {
      localStorage.setItem(storageKey, 'true')
    }
    setDismissed(true)
  }, [storageKey])

  return { shouldShowOnboarding, markDone, userId }
}
