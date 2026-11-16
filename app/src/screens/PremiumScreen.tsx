import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { useAuth0 } from '@auth0/auth0-react'
import { toast } from 'sonner'
import { ArrowLeft, Check, Download, Film, Loader2, MonitorPlay, Subtitles, Zap } from 'lucide-react'
import { usePremiumAccess } from '@/hooks/usePremiumAccess'
import { cn } from '@/lib/utils'
import { useAppAuth } from '@app/auth/AppAuthProvider'
import { isAndroid, openExternal } from '@app/native/platform'
import { EASE_OUT, item, spring, stagger } from '@app/lib/motion'

const API_BASE = import.meta.env.VITE_API_URL

interface Plan {
  id: string
  name: string
  price: number
  currency: string
  durationDays: number
  firstTimeOnly?: boolean
  features: string[]
  qrCode: string
  upiId: string
}

interface PlansPayload {
  plans: Plan[]
  upiConfig: { payeeName: string; upiId: string }
}

const PERKS = [
  { icon: MonitorPlay, title: '4K & 1080p from Real-Debrid', body: 'Straight from the source — no ads, no pop-ups.' },
  { icon: Subtitles, title: 'Our own player', body: 'Quality, audio and subtitle choices, resume where you stopped.' },
  { icon: Download, title: 'Offline downloads', body: 'Save movies and episodes to watch without internet.' },
  { icon: Film, title: 'Every other server too', body: 'Sol, Sirius and the rest stay free for everyone.' },
]

const NOTICE: Record<string, string> = {
  paused: 'The admin has paused Premium on your account for now.',
  'paused-for-all': 'Premium is paused for everyone at the moment.',
  suspended: 'This account is suspended.',
}

export function PremiumScreen() {
  const navigate = useNavigate()
  const access = usePremiumAccess()
  const { data, isLoading, isError } = useQuery({
    queryKey: ['subscription-plans'],
    queryFn: async (): Promise<PlansPayload> => {
      const res = await fetch(`${API_BASE}/subscriptions/plans`)
      if (!res.ok) throw new Error('plans')
      return res.json()
    },
    staleTime: 60 * 60 * 1000,
    enabled: !access.premium,
  })
  const [selected, setSelected] = useState<string | null>(null)
  const plan = data?.plans.find((p) => p.id === selected) ?? data?.plans[0]

  return (
    <div className="mx-auto max-w-4xl pb-tabbar">
      <div className="relative overflow-hidden px-4 pb-8 pt-[calc(var(--sat)+12px)] lg:px-12 lg:pt-[calc(var(--topbar-h)+40px)]">
        <button onClick={() => navigate(-1)} aria-label="Back" className="press relative -ml-1.5 flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.06] lg:hidden">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: EASE_OUT }} className="relative mt-4 flex flex-col items-center text-center lg:mt-0">
          <motion.span
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ ...spring, delay: 0.15 }}
            className="mb-4 flex h-16 w-16 items-center justify-center rounded-[20px] bg-amber-400 text-black"
          >
            <Zap className="h-8 w-8" />
          </motion.span>
          <h1 className="font-display text-[34px] font-extrabold tracking-tight lg:text-[48px]">
            StreamVault <span className="text-amber-300">Premium</span>
          </h1>
          <p className="mt-2 max-w-md text-[14px] text-white/60 lg:text-[16px]">The best way to watch — straight from the source, in our own player.</p>
        </motion.div>
      </div>

      <div className="px-4 lg:px-12">
        {access.premium ? (
          <div className="mb-6 rounded-2xl bg-emerald-500/10 p-4 ring-1 ring-emerald-400/25">
            <p className="flex items-center gap-2 text-[15px] font-bold text-emerald-300">
              <Check className="h-5 w-5" /> {access.admin ? 'Premium is on — you are the admin' : 'You have Premium'}
            </p>
            <p className="mt-1 text-[12.5px] text-white/60">Pick ⚡ Premium in the server list on any movie or episode, or tap Download to save it offline.</p>
            <button onClick={() => navigate('/')} className="press mt-3.5 rounded-full bg-white px-5 py-2.5 text-[13.5px] font-bold text-black">
              Start watching
            </button>
          </div>
        ) : (
          NOTICE[access.reason] && (
            <p className="mb-5 rounded-xl bg-white/[0.05] p-3.5 text-[12.5px] text-white/70 ring-1 ring-white/10">{NOTICE[access.reason]}</p>
          )
        )}

        <motion.ul variants={stagger(0.07, 0.2)} initial="hidden" animate="show" className="mb-8 grid gap-3 sm:grid-cols-2">
          {PERKS.map(({ icon: Icon, title, body }) => (
            <motion.li variants={item} key={title} className="surface flex gap-3.5 rounded-2xl p-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-400/15">
                <Icon className="h-5 w-5 text-amber-300" />
              </span>
              <span>
                <span className="block text-[13.5px] font-semibold">{title}</span>
                <span className="block text-[12px] text-white/50">{body}</span>
              </span>
            </motion.li>
          ))}
        </motion.ul>

        {!access.premium && (
          <>
            <h2 className="font-display mb-3 text-[20px] font-extrabold">Choose a plan</h2>
            {isLoading ? (
              <div className="space-y-2.5">
                <div className="skeleton h-24 rounded-xl" />
                <div className="skeleton h-24 rounded-xl" />
              </div>
            ) : isError || !data?.plans.length ? (
              <p className="rounded-xl bg-white/[0.04] p-4 text-[13px] text-white/60">Plans couldn&apos;t load. Check your connection and try again.</p>
            ) : (
              <>
                <div className="mb-5 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                  {data.plans.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setSelected(p.id)}
                      className={cn(
                        'press rounded-2xl p-4 text-left ring-1 transition-all',
                        plan?.id === p.id ? 'bg-amber-400/10 ring-amber-400/70' : 'bg-white/[0.03] ring-white/10 hover:bg-white/[0.06]'
                      )}
                    >
                      <span className="flex items-baseline justify-between gap-3">
                        <span className="text-[14.5px] font-bold">{p.name}</span>
                        <span className="text-[18px] font-extrabold">₹{p.price}</span>
                      </span>
                      <span className="mt-1 block text-[12px] text-white/50">
                        {p.durationDays} days{p.firstTimeOnly ? ' · one-time offer for new members' : ''}
                      </span>
                    </button>
                  ))}
                </div>
                {plan && <Checkout plan={plan} payee={data.upiConfig.payeeName} />}
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}

/** Pay by UPI, then send the transaction id — the admin confirms it and turns Premium on. */
function Checkout({ plan, payee }: { plan: Plan; payee: string }) {
  const { isAuthenticated, signIn } = useAppAuth()
  const { getAccessTokenSilently, user } = useAuth0()
  const [txId, setTxId] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const upiUrl = `upi://pay?pa=${encodeURIComponent(plan.upiId)}&pn=${encodeURIComponent(payee)}&am=${plan.price}&cu=INR&tn=${encodeURIComponent(plan.name)}`

  if (!isAuthenticated) {
    return (
      <div className="surface rounded-[22px] p-5">
        <p className="text-[14px] font-semibold">Sign in first</p>
        <p className="mt-1 text-[12.5px] text-white/55">Premium is attached to your account, so the admin knows whose payment it is.</p>
        <button onClick={() => void signIn({ returnTo: '/premium' })} className="press mt-3 w-full rounded-md bg-white py-2.5 text-[13.5px] font-semibold text-black">
          Sign in
        </button>
      </div>
    )
  }

  if (sent) {
    return (
      <div className="rounded-2xl bg-emerald-500/10 p-4 ring-1 ring-emerald-400/25">
        <p className="flex items-center gap-2 text-[15px] font-bold text-emerald-300">
          <Check className="h-5 w-5" /> Payment details sent
        </p>
        <p className="mt-1 text-[12.5px] text-white/60">Premium turns on as soon as the admin confirms your payment — usually within a few hours.</p>
      </div>
    )
  }

  const submit = async () => {
    const clean = txId.replace(/[^a-zA-Z0-9-_]/g, '')
    if (clean.length < 4) {
      toast.error('Enter the UPI transaction ID (UTR) from your payment app')
      return
    }
    setSending(true)
    try {
      const res = await fetch(`${API_BASE}/subscriptions/manual-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await getAccessTokenSilently()}` },
        body: JSON.stringify({ planId: plan.id, transactionId: clean, email: user?.email }),
      })
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(body.error || 'The request failed')
      setSent(true)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'The request failed')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="surface rounded-[22px] p-5">
      <p className="text-[12px] font-semibold uppercase tracking-wider text-white/40">Step 1 · Pay ₹{plan.price}</p>
      {isAndroid ? (
        <button onClick={() => void openExternal(upiUrl)} className="press mt-2.5 w-full rounded-full bg-amber-400 py-3.5 text-[14.5px] font-bold text-black">
          Pay with a UPI app
        </button>
      ) : (
        <div className="mt-3 flex items-center gap-4">
          <img src={plan.qrCode} alt="UPI QR code" className="h-36 w-36 rounded-lg bg-white p-1.5" />
          <p className="text-[12.5px] text-white/60">
            Scan with any UPI app (GPay, PhonePe, Paytm…)
            <span className="mt-1 block font-mono text-white/80">{plan.upiId}</span>
          </p>
        </div>
      )}
      {isAndroid && <p className="mt-2 text-center text-[11.5px] text-white/45">or pay to <span className="font-mono text-white/70">{plan.upiId}</span></p>}

      <p className="mt-5 text-[12px] font-semibold uppercase tracking-wider text-white/40">Step 2 · Send the transaction ID</p>
      <input
        value={txId}
        onChange={(e) => setTxId(e.target.value)}
        placeholder="UPI transaction ID / UTR"
        inputMode="text"
        autoCapitalize="characters"
        className="mt-2.5 h-12 w-full rounded-xl bg-white/[0.07] px-4 text-[14px] outline-none ring-1 ring-white/10 placeholder:text-white/35 focus:ring-amber-400/60"
      />
      <button onClick={() => void submit()} disabled={sending} className="press mt-2.5 flex w-full items-center justify-center gap-2 rounded-full bg-white py-3 text-[14px] font-bold text-black disabled:opacity-70">
        {sending && <Loader2 className="h-4 w-4 animate-spin" />} Submit for approval
      </button>
    </div>
  )
}
