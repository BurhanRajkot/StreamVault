/**
 * The ⚡ Premium server's slot in the player.
 *
 * Premium (Real-Debrid) plays for the site's admin and for signed-in accounts
 * the admin approved in the dashboard — the backend refuses everyone else —
 * so this is the gate in front of the real player: those viewers get
 * DebridPlayerPane, anyone else a short notice saying why, with the sign-ins.
 *
 * It is also the code-splitting seam: DebridPlayerPane, its controls and
 * hls.js are fetched only once someone who may use Premium opens it.
 */

import { Suspense, lazy, useState } from 'react'
import { Link } from 'react-router-dom'
import { Lock } from 'lucide-react'
import { usePremiumAccess } from '@/hooks/usePremiumAccess'
import type { PremiumReason } from '@/lib/api'
import AdminLoginModal from '@/components/admin/AdminLoginModal'
import type { DebridPlayerPaneProps } from './DebridPlayerPane'
import { ActionRow, PaneBackdrop, PremiumLoading, StatusMessage, primaryAction, secondaryAction } from './PremiumLoading'

const DebridPlayerPane = lazy(() =>
  import('./DebridPlayerPane').then((module) => ({ default: module.DebridPlayerPane }))
)

const NOTICES: Record<Exclude<PremiumReason, 'granted'>, { heading: string; body: string }> = {
  'sign-in-required': {
    heading: 'Premium is invite-only',
    body: "It plays for the site's admin and for accounts the admin approves. Every other server is free and open to everyone.",
  },
  'not-approved': {
    heading: 'Premium is invite-only',
    body: "Your account doesn't have Premium access. Every other server is free and open to everyone.",
  },
  paused: {
    heading: 'Your Premium access is paused',
    body: 'The admin has paused Premium for your account for now. Every other server still works.',
  },
  'paused-for-all': {
    heading: 'Premium is paused right now',
    body: 'Premium is switched off for the moment. Every other server still works.',
  },
  suspended: {
    heading: 'This account is suspended',
    body: 'The admin has suspended this account. You can still watch on every other server.',
  },
}

export function PremiumPane(props: DebridPlayerPaneProps) {
  const access = usePremiumAccess()
  // The admin token lands a moment before the sign-in animation ends; stay on
  // the notice until the modal says it's done, so the animation isn't cut off.
  const [signingIn, setSigningIn] = useState(false)

  if (access.loading) {
    return (
      <PremiumLoading
        backdropUrl={props.backdropUrl}
        onSwitchServer={props.onSwitchServer}
        title={props.title}
        step="find"
        percent={null}
        message="Checking your access…"
      />
    )
  }

  if (!access.premium || signingIn) {
    const notice = NOTICES[access.reason === 'granted' ? 'sign-in-required' : access.reason]
    return (
      <PaneBackdrop backdropUrl={props.backdropUrl}>
        <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-white/10" aria-hidden="true">
          <Lock className="h-5 w-5 text-white/80" />
        </span>
        <StatusMessage heading={notice.heading} body={notice.body} />
        <ActionRow>
          <button onClick={props.onSwitchServer} className={primaryAction}>
            Switch server
          </button>
          {access.reason === 'sign-in-required' && (
            <Link to="/login" className={secondaryAction}>
              Sign in
            </Link>
          )}
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
