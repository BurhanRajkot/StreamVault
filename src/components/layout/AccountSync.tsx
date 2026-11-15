import { useEffect } from 'react'
import { useAuth0 } from '@auth0/auth0-react'
import { toast } from 'sonner'
import { sendMyProfile } from '@/lib/api'
import { usePremiumAccess } from '@/hooks/usePremiumAccess'

const SENT_KEY = 'sv:profile-sent'

/**
 * Background chores for a signed-in account:
 * - once a session, send its email and name so the admin's Users panel
 *   knows who's who (the backend only gets an opaque Auth0 id otherwise);
 * - if the admin suspended it, say so once, rather than leaving My List and
 *   the rest to fail without a word.
 */
export function AccountSync() {
  const { isAuthenticated, user, getAccessTokenSilently } = useAuth0()
  const { suspended } = usePremiumAccess()

  useEffect(() => {
    if (!isAuthenticated || !user?.sub) return
    let sent: string | null = null
    try {
      sent = sessionStorage.getItem(SENT_KEY)
    } catch {
      // Storage blocked: send it, it's harmless to repeat
    }
    if (sent === user.sub) return
    getAccessTokenSilently()
      .then((token) => sendMyProfile(token, { email: user.email, name: user.name }))
      .then(() => {
        try {
          sessionStorage.setItem(SENT_KEY, user.sub!)
        } catch {
          // ignore
        }
      })
      .catch(() => {})
  }, [isAuthenticated, user?.sub, user?.email, user?.name, getAccessTokenSilently])

  useEffect(() => {
    if (!suspended) return
    toast.error('This account has been suspended', {
      id: 'account-suspended',
      description: 'My List, continue watching and recommendations are off for it. You can still browse and watch.',
      duration: 12_000,
    })
  }, [suspended])

  return null
}
