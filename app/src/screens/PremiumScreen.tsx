import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth0 } from '@auth0/auth0-react'
import { toast } from 'sonner'
import { Check, Download, Film, Info, Loader2, MonitorPlay, Subtitles, Zap } from 'lucide-react'
import { usePremiumAccess } from '@/hooks/usePremiumAccess'
import { useAppAuth } from '@app/auth/AppAuthProvider'
import { isAndroid, openExternal } from '@app/native/platform'
import { Button, IconTile, ListRow, ListSection, NavBar, type TileColor } from '@app/components/kit'

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

const PERKS: { icon: typeof Film; color: TileColor; title: string; body: string }[] = [
  { icon: MonitorPlay, color: 'blue', title: '4K & 1080p from Real-Debrid', body: 'Straight from the source — no ads, no pop-ups.' },
  { icon: Subtitles, color: 'indigo', title: 'Our own player', body: 'Quality, audio and subtitle choices, resume where you stopped.' },
  { icon: Download, color: 'green', title: 'Offline downloads', body: 'Save movies and episodes to watch without internet.' },
  { icon: Film, color: 'graphite', title: 'Every other server too', body: 'Sol, Sirius and the rest stay free for everyone.' },
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
    <div className="mx-auto max-w-2xl px-4 pb-tabbar pt-page lg:px-8">
      <NavBar title="Premium" back backTo="/me" />
      <header className="mb-8 flex flex-col items-center text-center">
        <span className="mb-4 flex h-[72px] w-[72px] items-center justify-center rounded-[18px] bg-ios-yellow text-black">
          <Zap className="h-9 w-9 fill-current" />
        </span>
        <h1 className="t-title1 lg:text-[34px] lg:leading-[41px]">StreamVault Premium</h1>
        <p className="t-subhead mt-1.5 max-w-sm text-label-2">The best way to watch — straight from the source, in our own player.</p>
      </header>

      {access.premium ? (
        <ListSection>
          <ListRow
            icon={
              <IconTile color="green">
                <Check strokeWidth={3} />
              </IconTile>
            }
            label={access.admin ? 'Premium is on — you’re the admin' : 'You have Premium'}
            detail="Pick Premium in the server list on any movie or episode, or tap Download to save it offline."
          />
          <div className="px-4 pb-4 pt-1">
            <Button variant="tinted" className="w-full" onClick={() => navigate('/')}>
              Start Watching
            </Button>
          </div>
        </ListSection>
      ) : (
        NOTICE[access.reason] && (
          <ListSection>
            <ListRow
              icon={
                <IconTile color="orange">
                  <Info />
                </IconTile>
              }
              label="Premium isn’t available"
              detail={NOTICE[access.reason]}
            />
          </ListSection>
        )
      )}

      <ListSection header="What you get">
        {PERKS.map(({ icon: Icon, color, title, body }) => (
          <ListRow
            key={title}
            icon={
              <IconTile color={color}>
                <Icon />
              </IconTile>
            }
            label={title}
            detail={body}
          />
        ))}
      </ListSection>

      {!access.premium && (
        <>
          {isLoading ? (
            <div className="skeleton mb-7 h-[150px] rounded-[12px]" />
          ) : isError || !data?.plans.length ? (
            <ListSection>
              <ListRow label="Plans couldn’t load" detail="Check your connection and try again." />
            </ListSection>
          ) : (
            <>
              <ListSection header="Choose a plan">
                {data.plans.map((p) => (
                  <ListRow
                    key={p.id}
                    onClick={() => setSelected(p.id)}
                    label={p.name}
                    detail={`${p.durationDays} days${p.firstTimeOnly ? ' · one-time offer for new members' : ''}`}
                    trailing={<span className="t-headline">₹{p.price}</span>}
                    accessory={plan?.id === p.id ? 'check' : 'none'}
                  />
                ))}
              </ListSection>
              {plan && <Checkout plan={plan} payee={data.upiConfig.payeeName} />}
            </>
          )}
        </>
      )}
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
      <ListSection footer="Premium is attached to your account, so the admin knows whose payment it is.">
        <ListRow onClick={() => void signIn({ returnTo: '/premium' })} label="Sign in to continue" tint />
      </ListSection>
    )
  }

  if (sent) {
    return (
      <ListSection footer="Premium turns on as soon as the admin confirms your payment — usually within a few hours.">
        <ListRow
          icon={
            <IconTile color="green">
              <Check strokeWidth={3} />
            </IconTile>
          }
          label="Payment details sent"
        />
      </ListSection>
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
    <>
      <ListSection header={`Step 1 · Pay ₹${plan.price}`} footer={isAndroid ? <>Or pay to <span className="font-mono text-white/80">{plan.upiId}</span> from any UPI app.</> : undefined}>
        {isAndroid ? (
          <div className="p-4">
            <Button variant="tinted" className="w-full" onClick={() => void openExternal(upiUrl)}>
              Pay with a UPI App
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-4 p-4">
            <img src={plan.qrCode} alt="UPI QR code" className="h-36 w-36 rounded-[10px] bg-white p-1.5" />
            <p className="t-subhead text-label-2">
              Scan with any UPI app (GPay, PhonePe, Paytm…)
              <span className="mt-1 block font-mono text-white/85">{plan.upiId}</span>
            </p>
          </div>
        )}
      </ListSection>

      <ListSection header="Step 2 · Send the transaction ID" footer="The 12-digit UTR from your payment app's receipt.">
        <div className="p-4">
          <input
            value={txId}
            onChange={(e) => setTxId(e.target.value)}
            placeholder="UPI transaction ID / UTR"
            inputMode="text"
            autoCapitalize="characters"
            className="t-body h-11 w-full rounded-[10px] bg-fill px-3.5 caret-tint outline-none placeholder:text-label-2"
          />
          <Button variant="tinted" onClick={() => void submit()} disabled={sending} className="mt-3 w-full">
            {sending && <Loader2 className="animate-spin" />} Submit for Approval
          </Button>
        </div>
      </ListSection>
    </>
  )
}
