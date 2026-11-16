import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Check, Loader2, LogOut, ShieldCheck, X } from 'lucide-react'
import { PageHeader } from '@app/components/PageHeader'
import { Button } from '@app/components/kit'
import { clearAdminToken, getAdminToken } from '@/lib/api'
import { useIsAdmin } from '@/hooks/useIsAdmin'
import AdminLoginModal from '@/components/admin/AdminLoginModal'
import { PremiumStatusCard } from '@/components/admin/PremiumStatusCard'
import { PremiumSwitchCard } from '@/components/admin/PremiumSwitchCard'
import { UsersPanel } from '@/components/admin/UsersPanel'

const API_BASE = import.meta.env.VITE_API_URL

interface SubscriptionRequest {
  id: string
  email: string | null
  plan_id: string
  amount: number
  currency: string
  transaction_id: string
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
}

/**
 * The website's admin dashboard, laid out for a phone: the Real-Debrid
 * account, the Premium switch, the Users panel and payment requests. Signing
 * in is the same authenticator code.
 */
export function AdminScreen() {
  const isAdmin = useIsAdmin()
  const [loginOpen, setLoginOpen] = useState(!isAdmin)

  return (
    <div className="mx-auto max-w-4xl px-4 pb-tabbar pt-page lg:px-12">
      <PageHeader
        back
        title="Admin"
        actions={
          isAdmin ? (
            <Button variant="gray" size="sm" onClick={() => clearAdminToken()} className="mb-1.5">
              <LogOut /> Sign Out
            </Button>
          ) : undefined
        }
      />

      {isAdmin ? (
        <div className="flex flex-col gap-4">
          <PremiumStatusCard />
          <PremiumSwitchCard />
          <PaymentRequests />
          <UsersPanel />
        </div>
      ) : (
        <div className="flex flex-col items-center pt-16 text-center">
          <ShieldCheck className="mb-4 h-14 w-14 text-label-2" strokeWidth={1.5} />
          <p className="t-title2">Admin sign-in</p>
          <p className="t-subhead mt-1.5 max-w-xs text-label-2">Enter the 6-digit code from your authenticator app.</p>
          <Button variant="tinted" onClick={() => setLoginOpen(true)} className="mt-6">
            Enter Code
          </Button>
        </div>
      )}

      <AdminLoginModal isOpen={loginOpen && !isAdmin} onClose={() => setLoginOpen(false)} onSuccess={() => setLoginOpen(false)} />
    </div>
  )
}

function PaymentRequests() {
  const queryClient = useQueryClient()
  const { data: requests, isLoading } = useQuery({
    queryKey: ['admin-subscription-requests'],
    queryFn: async (): Promise<SubscriptionRequest[]> => {
      const res = await fetch(`${API_BASE}/subscriptions/admin/requests`, { headers: { Authorization: `Bearer ${getAdminToken()}` } })
      if (res.status === 401) {
        clearAdminToken()
        throw new Error('Session expired')
      }
      if (!res.ok) throw new Error('Failed to load requests')
      return res.json()
    },
  })
  const act = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: 'approve' | 'reject' }) => {
      const res = await fetch(`${API_BASE}/subscriptions/admin/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getAdminToken()}` },
        body: JSON.stringify({ requestId: id }),
      })
      if (res.status === 401) clearAdminToken()
      if (!res.ok) throw new Error(`Could not ${action} the request`)
    },
    onSuccess: (_data, { action }) => {
      toast.success(action === 'approve' ? 'Approved — Premium is on for that account' : 'Rejected')
      void queryClient.invalidateQueries({ queryKey: ['admin-subscription-requests'] })
      void queryClient.invalidateQueries({ queryKey: ['admin-users'] })
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed'),
  })

  const pending = (requests ?? []).filter((r) => r.status === 'pending')
  const recent = (requests ?? []).filter((r) => r.status !== 'pending').slice(0, 5)

  return (
    <section className="rounded-[12px] bg-grouped p-4">
      <h2 className="t-headline mb-3 flex items-center justify-between">
        Payment requests
        {pending.length > 0 && <span className="rounded-full bg-ios-red px-2 text-[12px] font-semibold leading-5 text-white">{pending.length} pending</span>}
      </h2>
      {isLoading ? (
        <Loader2 className="h-5 w-5 animate-spin text-white/50" />
      ) : pending.length === 0 && recent.length === 0 ? (
        <p className="text-[12.5px] text-white/50">No payment requests yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {[...pending, ...recent].map((r) => (
            <li key={r.id} className="rounded-[10px] bg-grouped-2 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-[13.5px] font-semibold">{r.email || 'No email'}</p>
                  <p className="text-[11.5px] text-white/50">
                    {r.plan_id} · ₹{r.amount} · {new Date(r.created_at).toLocaleDateString()}
                  </p>
                  <p className="mt-0.5 font-mono text-[11.5px] text-white/70">UTR {r.transaction_id}</p>
                </div>
                {r.status === 'pending' ? (
                  <div className="flex shrink-0 gap-1.5">
                    <button
                      aria-label="Approve"
                      disabled={act.isPending}
                      onClick={() => act.mutate({ id: r.id, action: 'approve' })}
                      className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-300"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                    <button
                      aria-label="Reject"
                      disabled={act.isPending}
                      onClick={() => act.mutate({ id: r.id, action: 'reject' })}
                      className="flex h-9 w-9 items-center justify-center rounded-full bg-red-500/15 text-red-300"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <span className={`text-[11px] font-semibold capitalize ${r.status === 'approved' ? 'text-emerald-400' : 'text-red-300'}`}>{r.status}</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
