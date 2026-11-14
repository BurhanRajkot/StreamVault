import { useSyncExternalStore } from 'react'
import { ADMIN_SESSION_EVENT, isAdminAuthenticated } from '@/lib/api'

function subscribe(onChange: () => void): () => void {
  // Our own event covers this tab; `storage` covers a sign-in/out in another one.
  window.addEventListener(ADMIN_SESSION_EVENT, onChange)
  window.addEventListener('storage', onChange)
  return () => {
    window.removeEventListener(ADMIN_SESSION_EVENT, onChange)
    window.removeEventListener('storage', onChange)
  }
}

/**
 * Whether this browser holds a live admin token — re-renders the moment an
 * admin signs in or out. Only a UI hint (what to show, whether to try): the
 * backend verifies the token on every admin-only call.
 */
export function useIsAdmin(): boolean {
  return useSyncExternalStore(subscribe, isAdminAuthenticated, () => false)
}
