import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, ExternalLink, Inbox, Loader2, LogOut, RefreshCw, ShieldCheck, Star, Trash2 } from 'lucide-react'
import { Button, IconTile, ListRow, ListSection } from '@app/components/kit'
import { PageHeader } from '@app/components/PageHeader'
import { openExternal } from '@app/native/platform'
import { EASE_OUT } from '@app/lib/motion'
import { clearAdminToken, type AdminAccessRequest } from '@/lib/api'
import { useIsAdmin } from '@/hooks/useIsAdmin'
import { useAccessRequests } from '@/hooks/useAccessRequests'
import AdminLoginModal from '@/components/admin/AdminLoginModal'
import { AccountsSection, PremiumServerSection } from '@app/screens/admin/AdminSections'

/**
 * The admin dashboard, in the app: Premium access requests first (approve or
 * delete), then the Real-Debrid account, the site-wide Premium switch and
 * every account. Signing in is the same authenticator code as the website.
 */
export function AdminScreen() {
  const isAdmin = useIsAdmin()
  const [loginOpen, setLoginOpen] = useState(!isAdmin)

  return (
    <div className="mx-auto max-w-[860px] px-4 pb-tabbar pt-page lg:px-12">
      <PageHeader
        title="Admin"
        back
        subtitle={isAdmin ? 'Requests, Premium and accounts' : undefined}
        barActions={
          isAdmin ? (
            <Button variant="glass" size="sm" onClick={() => clearAdminToken()}>
              <LogOut /> Sign Out
            </Button>
          ) : undefined
        }
        actions={
          isAdmin ? (
            <Button variant="gray" size="sm" onClick={() => clearAdminToken()} className="mb-1.5 hidden lg:inline-flex">
              <LogOut /> Sign Out
            </Button>
          ) : undefined
        }
      />

      {isAdmin ? (
        <div className="flex flex-col">
          <AccessRequests />
          <PremiumServerSection />
          <AccountsSection />
        </div>
      ) : (
        <div className="flex flex-col items-center pt-10 text-center">
          <span className="material-float mb-5 flex h-[76px] w-[76px] items-center justify-center rounded-[22px]">
            <ShieldCheck className="h-10 w-10 text-tint" strokeWidth={1.6} />
          </span>
          <p className="t-title2">Admin sign-in</p>
          <p className="t-subhead mt-1.5 max-w-xs text-label-2">Enter the 6-digit code from your authenticator app to open the dashboard.</p>
          <Button variant="tinted" size="lg" onClick={() => setLoginOpen(true)} className="mt-6 min-w-[200px]">
            Enter Code
          </Button>
        </div>
      )}

      <AdminLoginModal isOpen={loginOpen && !isAdmin} onClose={() => setLoginOpen(false)} onSuccess={() => setLoginOpen(false)} />
    </div>
  )
}

function AccessRequests() {
  const { requests, pending, isLoading, error, refetch, isFetching, approve, remove, busyFor } = useAccessRequests()

  return (
    <ListSection
      header={
        <span className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            Premium requests
            {pending > 0 && <span className="rounded-full bg-ios-red px-1.5 text-[11px] font-semibold leading-[17px] text-white normal-case">{pending}</span>}
          </span>
          <button type="button" onClick={() => void refetch()} className="press flex items-center gap-1 normal-case text-tint" aria-label="Refresh requests">
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </span>
      }
      footer="Approving turns Premium on for that account — in the app only, never on the website. Deleting a request doesn’t take access away; do that under Users."
    >
      {isLoading ? (
        <div className="flex h-[72px] items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-label-2" />
        </div>
      ) : error ? (
        <ListRow label="Couldn’t load requests" detail={error instanceof Error ? error.message : undefined} />
      ) : requests.length === 0 ? (
        <ListRow
          icon={
            <IconTile color="graphite">
              <Inbox />
            </IconTile>
          }
          label="No requests yet"
          detail="People ask from the Premium screen of the app."
        />
      ) : (
        <AnimatePresence initial={false}>
          {requests.map((r) => (
            <motion.div
              key={r.userId}
              layout
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25, ease: EASE_OUT }}
              className="cell-sep-inset relative"
              style={{ '--sep-inset': '16px' } as React.CSSProperties}
            >
              <RequestCell
                request={r}
                busy={busyFor === r.userId}
                approving={approve.isPending}
                onApprove={() => approve.mutate(r.userId)}
                onDelete={() => remove.mutate(r.userId)}
              />
            </motion.div>
          ))}
        </AnimatePresence>
      )}
    </ListSection>
  )
}

function RequestCell({
  request: r,
  busy,
  approving,
  onApprove,
  onDelete,
}: {
  request: AdminAccessRequest
  busy: boolean
  approving: boolean
  onApprove: () => void
  onDelete: () => void
}) {
  const [confirming, setConfirming] = useState(false)
  const sent = new Date(r.createdAt).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })

  return (
    <div className="px-4 py-3.5">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-[#5e5ce6] to-[#0a84ff] text-[15px] font-semibold uppercase">
          {(r.name || r.email || '?').slice(0, 1)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="t-headline truncate">{r.email || r.name || 'Unknown account'}</p>
          <p className="t-footnote text-label-2">
            {r.name && r.email ? `${r.name} · ` : ''}
            {sent}
          </p>
        </div>
        {r.status === 'approved' && <span className="t-footnote shrink-0 font-semibold text-ios-green">Approved</span>}
      </div>

      <div className="mt-2.5 flex flex-wrap gap-1.5 pl-[52px]">
        <StarChip request={r} />
        {r.reference && <Chip className="font-mono">UPI {r.reference}</Chip>}
      </div>
      {r.note && <p className="t-subhead mt-2 pl-[52px] text-white/85">“{r.note}”</p>}

      <div className="mt-3 flex gap-2 pl-[52px]">
        {r.status === 'pending' && (
          <Button variant="tinted" size="sm" disabled={busy} onClick={onApprove} className="bg-ios-green text-black">
            {busy && approving ? <Loader2 className="animate-spin" /> : <Check strokeWidth={3} />} Approve
          </Button>
        )}
        <Button
          variant="gray"
          size="sm"
          disabled={busy}
          onClick={() => (confirming ? onDelete() : setConfirming(true))}
          onBlur={() => setConfirming(false)}
          className={confirming ? 'bg-ios-red text-white' : 'text-ios-red'}
        >
          {busy && !approving ? <Loader2 className="animate-spin" /> : <Trash2 />} {confirming ? 'Tap to Delete' : 'Delete'}
        </Button>
      </div>
    </div>
  )
}

function Chip({ children, className, onClick }: { children: React.ReactNode; className?: string; onClick?: () => void }) {
  const cls = `inline-flex items-center gap-1 rounded-full bg-fill px-2.5 py-[3px] text-[12px] font-medium ${className ?? ''}`
  return onClick ? (
    <button type="button" onClick={onClick} className={`press ${cls}`}>
      {children}
    </button>
  ) : (
    <span className={cls}>{children}</span>
  )
}

function StarChip({ request: r }: { request: AdminAccessRequest }) {
  if (!r.github) return <Chip className="text-label-2">No GitHub given</Chip>
  const open = () => void openExternal(`https://github.com/${r.github}`)
  if (r.starred === true)
    return (
      <Chip onClick={open} className="bg-ios-yellow/15 text-ios-yellow">
        <Star className="h-3 w-3 fill-current" /> Starred · @{r.github}
      </Chip>
    )
  return (
    <Chip onClick={open} className="text-label-2">
      {r.starred === false ? 'Not starred' : 'Star not checked'} · @{r.github} <ExternalLink className="h-3 w-3" />
    </Chip>
  )
}
