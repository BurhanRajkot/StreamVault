/**
 * The ⚡ Premium server's slot in the player.
 *
 * Premium (Real-Debrid) is admin-only — the backend refuses everyone else —
 * so this is the gate in front of the real player: an admin gets
 * DebridPlayerPane, anyone else a short notice with the admin sign-in.
 *
 * It is also the code-splitting seam: DebridPlayerPane, its controls and
 * hls.js are fetched only once an admin actually opens Premium, so visitors
 * never download a player they can't use.
 */

import { Suspense, lazy, useState } from 'react'
import { Lock } from 'lucide-react'
import { useIsAdmin } from '@/hooks/useIsAdmin'
import AdminLoginModal from '@/components/admin/AdminLoginModal'
import type { DebridPlayerPaneProps } from './DebridPlayerPane'
import { ActionRow, PaneBackdrop, PremiumLoading, StatusMessage, primaryAction, secondaryAction } from './PremiumLoading'

const DebridPlayerPane = lazy(() =>
  import('./DebridPlayerPane').then((module) => ({ default: module.DebridPlayerPane }))
)

export function PremiumPane(props: DebridPlayerPaneProps) {
  const isAdmin = useIsAdmin()
  // The token lands a moment before the sign-in animation ends; stay on the
  // notice until the modal says it's done, so the animation isn't cut off.
  const [signingIn, setSigningIn] = useState(false)

  if (!isAdmin || signingIn) {
    return (
      <PaneBackdrop backdropUrl={props.backdropUrl}>
        <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-white/10" aria-hidden="true">
          <Lock className="h-5 w-5 text-white/80" />
        </span>
        <StatusMessage
          heading="Premium is admin-only"
          body="This server runs on a private account, so it only plays for the site's admin. Every other server is free and open to everyone."
        />
        <ActionRow>
          <button onClick={props.onSwitchServer} className={primaryAction}>
            Switch server
          </button>
          <button onClick={() => setSigningIn(true)} className={secondaryAction}>
            Admin sign-in
          </button>
        </ActionRow>
        <AdminLoginModal isOpen={signingIn} onClose={() => setSigningIn(false)} onSuccess={() => setSigningIn(false)} />
      </PaneBackdrop>
    )
  }

  return (
    <Suspense
      fallback={
        <PremiumLoading
          backdropUrl={props.backdropUrl}
          onSwitchServer={props.onSwitchServer}
          title={props.title}
          step="find"
          percent={null}
          message="Loading the Premium player…"
        />
      }
    >
      <DebridPlayerPane {...props} />
    </Suspense>
  )
}
