import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth0 } from '@auth0/auth0-react'
import { AnimatePresence, motion } from 'framer-motion'
import { toast } from 'sonner'
import { Check, Clock, Download, Film, Heart, Info, Loader2, MonitorPlay, Send, Star, Subtitles, Zap } from 'lucide-react'
import { usePremiumAccess } from '@/hooks/usePremiumAccess'
import { fetchMyAccessRequest, sendAccessRequest, type AccessRequest } from '@/lib/api'
import { useAppAuth } from '@app/auth/AppAuthProvider'
import { isAndroid, openExternal } from '@app/native/platform'
import { Button, IconTile, ListRow, ListSection, NavBar, TextField, type TileColor } from '@app/components/kit'
import { Sheet } from '@app/components/Sheet'
import { EASE_OUT } from '@app/lib/motion'

const API_BASE = import.meta.env.VITE_API_URL
const MY_REQUEST_KEY = 'my-access-request'

interface Donation {
  qrCode: string
  upiId: string
  payeeName: string
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

/**
 * Premium isn't sold. A signed-in viewer may star the GitHub repo or donate —
 * both optional — and asks for access; the admin approves it from the
 * dashboard. Premium given this way plays in the app only.
 */
export function PremiumScreen() {
  const navigate = useNavigate()
  const access = usePremiumAccess()
  const blocked = !!NOTICE[access.reason]

  return (
    <div className="mx-auto max-w-[760px] px-4 pb-tabbar pt-page lg:px-8">
      <NavBar title="Premium" back backTo="/me" />
      <Hero />

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
        blocked && (
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

      {!access.premium && !blocked && !access.loading && <RequestFlow />}
    </div>
  )
}

/** The bolt, lit from behind by a slow, soft glow. */
function Hero() {
  return (
    <header className="relative mb-8 flex flex-col items-center pt-2 text-center">
      <div className="relative mb-5">
        <motion.span
          aria-hidden="true"
          className="absolute -inset-8 rounded-full bg-[radial-gradient(closest-side,rgb(255_214_10/0.45),rgb(255_159_10/0.18)_55%,transparent)] blur-xl"
          animate={{ opacity: [0.55, 0.9, 0.55], scale: [0.94, 1.04, 0.94] }}
          transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.span
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 20 }}
          className="relative flex h-[76px] w-[76px] items-center justify-center rounded-[22px] bg-gradient-to-b from-[#ffe14d] to-[#ff9f0a] text-black shadow-[inset_0_1px_0_rgb(255_255_255/0.6),0_12px_32px_-8px_rgb(255_159_10/0.6)]"
        >
          <Zap className="h-9 w-9 fill-current" />
        </motion.span>
      </div>
      <h1 className="t-title1 lg:text-[34px] lg:leading-[41px]">StreamVault Premium</h1>
      <p className="t-subhead mt-1.5 max-w-sm text-label-2">
        Free — just ask. A GitHub star or a donation is welcome, never required.
      </p>
    </header>
  )
}

function RequestFlow() {
  const { isAuthenticated, signIn } = useAppAuth()
  const { getAccessTokenSilently, user } = useAuth0()
  const queryClient = useQueryClient()
  const [donateOpen, setDonateOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [github, setGithub] = useState('')
  const [reference, setReference] = useState('')
  const [note, setNote] = useState('')

  const mine = useQuery({
    queryKey: [MY_REQUEST_KEY, user?.sub],
    queryFn: async () => fetchMyAccessRequest(await getAccessTokenSilently()),
    enabled: isAuthenticated,
    staleTime: 30_000,
  })
  const repo = mine.data?.repo ?? 'BurhanRajkot/StreamVault'
  const request = mine.data?.request ?? null

  const send = useMutation({
    mutationFn: async () =>
      sendAccessRequest(await getAccessTokenSilently(), {
        github: github.trim() || undefined,
        reference: reference.trim() || undefined,
        note: note.trim() || undefined,
        email: user?.email ?? null,
      }),
    onSuccess: (data) => {
      queryClient.setQueryData([MY_REQUEST_KEY, user?.sub], data)
      setEditing(false)
      toast.success('Request sent')
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'The request failed'),
  })

  if (!isAuthenticated) {
    return (
      <ListSection header="Get access" footer="Premium is given to an account, so the admin knows who’s asking.">
        <ListRow onClick={() => void signIn({ returnTo: '/premium' })} label="Sign In to Request Access" tint />
      </ListSection>
    )
  }

  if (mine.isLoading) return <div className="skeleton mb-7 h-[180px] rounded-[14px]" />

  const startEditing = () => {
    setGithub(request?.github ?? '')
    setReference(request?.reference ?? '')
    setNote(request?.note ?? '')
    setEditing(true)
  }
  const showForm = !request || request.status !== 'pending' || editing

  return (
    <>
      <AnimatePresence initial={false}>
        {request?.status === 'pending' && !editing && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.3, ease: EASE_OUT }}>
            <PendingRequest request={request} onEdit={startEditing} />
          </motion.div>
        )}
      </AnimatePresence>

      <ListSection header="Support the project · optional" footer="Neither is needed — you can ask for access without doing anything.">
        <ListRow
          onClick={() => void openExternal(`https://github.com/${repo}`)}
          icon={
            <IconTile color="yellow">
              <Star className="fill-current" />
            </IconTile>
          }
          label="Star on GitHub"
          detail="Free, and it helps people find StreamVault. Then add your username below."
        />
        <ListRow
          onClick={() => setDonateOpen(true)}
          icon={
            <IconTile color="pink">
              <Heart className="fill-current" />
            </IconTile>
          }
          label="Donate"
          detail="Any amount, by UPI — it keeps the servers running."
        />
      </ListSection>

      {showForm && (
        <ListSection
          header={request?.status === 'pending' ? 'Change your request' : 'Request access'}
          footer="The admin sees your email, whether you starred (checked with GitHub) and your note, then approves it. Everything here is optional."
        >
          <TextField
            label="GitHub"
            value={github}
            onChange={setGithub}
            placeholder="Username, if you starred"
            autoCapitalize="none"
            spellCheck={false}
          />
          <TextField
            label="UPI ref."
            value={reference}
            onChange={setReference}
            placeholder="12-digit UPI UTR"
            inputMode="numeric"
            spellCheck={false}
          />
          <TextField label="Note" value={note} onChange={setNote} placeholder="Anything for the admin" maxLength={300} />
          <div className="flex gap-2 px-4 pb-4 pt-3">
            {editing && (
              <Button variant="gray" className="flex-1" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            )}
            <Button variant="tinted" className="flex-[2]" onClick={() => send.mutate()} disabled={send.isPending}>
              {send.isPending ? <Loader2 className="animate-spin" /> : <Send />}
              {request?.status === 'pending' ? 'Update Request' : 'Request Access'}
            </Button>
          </div>
        </ListSection>
      )}

      <DonateSheet open={donateOpen} onOpenChange={setDonateOpen} />
    </>
  )
}

function PendingRequest({ request, onEdit }: { request: AccessRequest; onEdit: () => void }) {
  const star =
    request.github == null
      ? null
      : request.starred
        ? { text: `Star from @${request.github} confirmed`, ok: true }
        : request.starred === false
          ? { text: `No star from @${request.github} yet — star, then update`, ok: false }
          : { text: `GitHub couldn’t be checked just now`, ok: false }
  return (
    <ListSection header="Your request">
      <ListRow
        icon={
          <IconTile color="orange">
            <Clock />
          </IconTile>
        }
        label="Waiting for the admin"
        detail={`Sent ${new Date(request.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}. Premium turns on here as soon as it’s approved.`}
      />
      {star && (
        <ListRow
          icon={
            <IconTile color={star.ok ? 'yellow' : 'graphite'}>
              <Star className={star.ok ? 'fill-current' : undefined} />
            </IconTile>
          }
          label={star.text}
        />
      )}
      <ListRow onClick={onEdit} label="Change Request" tint accessory="none" />
    </ListSection>
  )
}

function DonateSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['donation'],
    queryFn: async (): Promise<Donation | null> => {
      const res = await fetch(`${API_BASE}/subscriptions/plans`)
      if (!res.ok) throw new Error('plans')
      return ((await res.json()) as { donation?: Donation | null }).donation ?? null
    },
    staleTime: 60 * 60 * 1000,
    enabled: open,
  })
  const upiUrl = data
    ? `upi://pay?pa=${encodeURIComponent(data.upiId)}&pn=${encodeURIComponent(data.payeeName)}&cu=INR&tn=${encodeURIComponent('Support StreamVault')}`
    : ''

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Donate" description="Any amount, by UPI">
      {isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-label-2" />
        </div>
      ) : !data ? (
        <p className="t-subhead py-6 text-center text-label-2">Donations aren’t set up right now — thanks for thinking of it.</p>
      ) : (
        <div className="flex flex-col items-center gap-4 pb-2 pt-1 text-center">
          {isAndroid ? (
            <Button variant="tinted" size="lg" className="w-full" onClick={() => void openExternal(upiUrl)}>
              <Heart className="fill-current" /> Pay with a UPI App
            </Button>
          ) : (
            <img src={data.qrCode} alt="UPI QR code" className="h-48 w-48 rounded-[16px] bg-white p-2 shadow-[0_12px_40px_-12px_rgb(0_0_0/0.8)]" />
          )}
          <p className="t-subhead text-label-2">
            {isAndroid ? 'Or pay to' : 'Scan with any UPI app (GPay, PhonePe, Paytm…) or pay to'}
            <span className="mt-1 block select-text font-mono text-white/90">{data.upiId}</span>
          </p>
          <p className="t-footnote rounded-[12px] bg-fill-2 px-3 py-2.5 text-label-2">
            Then put the 12-digit UTR from your payment receipt in your request, so the admin can see it.
          </p>
        </div>
      )}
    </Sheet>
  )
}
