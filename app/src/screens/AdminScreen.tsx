import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowLeft, Check, Loader2, LogOut, ShieldCheck, X } from 'lucide-react'
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
  const navigate = useNavigate()
  const isAdmin = useIsAdmin()
  const [loginOpen, setLoginOpen] = useState(!isAdmin)

  return (
    <div className="mx-auto max-w-3xl px-4 pb-tabbar pt-safe lg:px-8 lg:pb-10">
      <header className="flex items-center gap-2 pb-4 pt-3 lg:pt-8">
        <button onClick={() => navigate(-1)} aria-label="Back" className="-ml-2 flex h-9 w-9 items-center justify-center rounded-full lg:hidden">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="flex-1 text-[22px] font-extrabold tracking-tight">Admin</h1>
        {isAdmin && (
          <button onClick={() => clearAdminToken()} className="flex items-center gap-1.5 rounded-full bg-white/[0.06] px-3 py-1.5 text-[12px] font-semibold text-white/70">
            <LogOut className="h-3.5 w-3.5" /> Sign out
          </button>
        )}
      </header>

      {isAdmin ? (
        <div className="flex flex-col gap-4">
          <PremiumStatusCard />
          <PremiumSwitchCard />
          <PaymentRequests />
          <UsersPanel />
        </div>
      ) : (
        <div className="flex flex-col items-center pt-16 text-center">
          <ShieldCheck className="mb-4 h-12 w-12 text-primary" />
          <p className="text-[16px] font-bold">Admin sign-in</p>
          <p className="mt-1.5 max-w-xs text-[13px] text-white/55">Enter the 6-digit code from your authenticator app.</p>
          <button onClick={() => setLoginOpen(true)} className="press mt-5 rounded-md bg-white px-5 py-2.5 text-[13.5px] font-semibold text-black">
            Enter code
          </button>
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
    <section className="rounded-2xl bg-white/[0.04] p-4 ring-1 ring-white/[0.06]">
      <h2 className="mb-3 flex items-center justify-between text-[15px] font-bold">
        Payment requests
        {pending.length > 0 && <span className="rounded-full bg-amber-400 px-2 text-[11px] font-bold text-black">{pending.length} pending</span>}
      </h2>
      {isLoading ? (
        <Loader2 className="h-5 w-5 animate-spin text-white/50" />
      ) : pending.length === 0 && recent.length === 0 ? (
        <p className="text-[12.5px] text-white/50">No payment requests yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {[...pending, ...recent].map((r) => (
            <li key={r.id} className="rounded-xl bg-black/20 p-3">
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
