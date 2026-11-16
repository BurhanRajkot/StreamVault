import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ChevronRight, Download, Heart, Info, Loader2, LogOut, RefreshCw, Server, ShieldCheck, Wifi, Zap } from 'lucide-react'
import { CONFIG, DEBRID_SERVER_ID, defaultServer } from '@/lib/config'
import { usePremiumAccess } from '@/hooks/usePremiumAccess'
import { clearAdminToken } from '@/lib/api'
import { initialsOf, cn } from '@/lib/utils'
import { useAppAuth } from '@app/auth/AppAuthProvider'
import { updateSettings, useSettings } from '@app/lib/settings'
import { APP_VERSION, isAndroid, isNativeApp, platformLabel } from '@app/native/platform'
import { useAvailableUpdate } from '@app/native/updates'
import { useInstallUpdate } from '@app/native/installUpdate'
import { ServerSheet } from '@app/components/ServerSheet'
import { Sheet } from '@app/components/Sheet'
import { Logo } from '@app/components/Logo'
import type { QualityPreference } from '@app/downloads/premiumFile'
import { PageHeader } from '@app/components/PageHeader'
import { item, spring, stagger } from '@app/lib/motion'

const PREMIUM_LABEL: Record<string, string> = {
  granted: 'Active',
  'sign-in-required': 'Not active',
  'not-approved': 'Not active',
  paused: 'Paused by the admin',
  'paused-for-all': 'Paused for everyone right now',
  suspended: 'Account suspended',
}

export function ProfileScreen() {
  const { isAuthenticated, user, signIn, signOut, isLoading } = useAppAuth()
  const access = usePremiumAccess()
  const settings = useSettings()
  const [serverOpen, setServerOpen] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)
  const serverName = settings.defaultServer === DEBRID_SERVER_ID ? 'Premium' : CONFIG.PROVIDER_NAMES[settings.defaultServer || defaultServer('movie')]

  return (
    <div className="mx-auto max-w-3xl px-4 pb-tabbar pt-page lg:px-12">
      <PageHeader title="My Space" />
      <motion.div variants={stagger(0.06)} initial="hidden" animate="show">

      {/* Account */}
      <motion.section variants={item} className="surface relative mb-4 overflow-hidden rounded-[24px] p-5">
        {isAuthenticated && user ? (
          <div className="flex items-center gap-3.5">
            {user.picture ? (
              <img src={user.picture} alt="" referrerPolicy="no-referrer" className="h-16 w-16 rounded-full object-cover ring-1 ring-white/15" />
            ) : (
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-primary text-xl font-bold">{initialsOf(user.name)}</span>
            )}
            <div className="relative min-w-0 flex-1">
              <p className="font-display truncate text-[19px] font-extrabold">{user.name || user.nickname}</p>
              <p className="truncate text-[12.5px] text-white/50">{user.email}</p>
            </div>
          </div>
        ) : (
          <div className="relative">
            <p className="font-display text-[19px] font-extrabold">Sign in to StreamVault</p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-white/55">Your list, continue watching and recommendations — the same as on the website.</p>
            <div className="mt-3.5 flex gap-2">
              <button disabled={isLoading} onClick={() => void signIn()} className="press flex-1 rounded-full bg-white py-3 text-[14px] font-bold text-black">
                Sign in
              </button>
              <button disabled={isLoading} onClick={() => void signIn({ signup: true })} className="press flex-1 rounded-full bg-white/10 py-3 text-[14px] font-bold ring-1 ring-white/10">
                Create account
              </button>
            </div>
          </div>
        )}
      </motion.section>

      {/* Premium */}
      <motion.div variants={item}>
      <Link
        to="/premium"
        className="group press mb-6 flex items-center gap-3.5 rounded-[24px] bg-gradient-to-r from-amber-500/[0.16] via-amber-500/[0.05] to-transparent p-4 ring-1 ring-amber-400/25 transition-colors hover:from-amber-500/25"
      >
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-400 text-black transition-transform group-hover:rotate-12 group-hover:scale-110">
          <Zap className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[14.5px] font-bold">Premium</span>
          <span className={cn('block text-[12px]', access.premium ? 'text-emerald-400' : 'text-white/55')}>
            {access.loading ? 'Checking…' : access.admin ? 'Active · admin' : PREMIUM_LABEL[access.reason] ?? 'Not active'}
          </span>
        </span>
        <span className="text-[12px] font-semibold text-amber-300">{access.premium ? 'Details' : 'Get it'}</span>
        <ChevronRight className="h-4 w-4 text-white/40" />
      </Link>
      </motion.div>

      <Group title="Library">
        <Row to="/my-list" icon={<Heart className="h-[18px] w-[18px]" />} label="My List" />
        <Row to="/downloads" icon={<Download className="h-[18px] w-[18px]" />} label="Downloads" />
      </Group>

      <Group title="Playback & downloads">
        <Row onClick={() => setServerOpen(true)} icon={<Server className="h-[18px] w-[18px]" />} label="Default server" value={serverName} />
        <div className="flex items-center gap-3 px-4 py-3">
          <Download className="h-[18px] w-[18px] text-white/60" />
          <span className="flex-1 text-[14px]">Download quality</span>
          <div className="relative z-0 flex rounded-full bg-white/[0.06] p-0.5">
            {(['720p', '1080p', '4K'] as QualityPreference[]).map((q) => (
              <button
                key={q}
                onClick={() => updateSettings({ downloadQuality: q })}
                className={cn('relative rounded-full px-3 py-1 text-[12px] font-bold transition-colors', settings.downloadQuality === q ? 'text-black' : 'text-white/60')}
              >
                {settings.downloadQuality === q && <motion.span layoutId="quality-pill" transition={spring} className="absolute inset-0 -z-10 rounded-full bg-white" />}
                {q}
              </button>
            ))}
          </div>
        </div>
        {isAndroid && (
          <label className="flex items-center gap-3 px-4 py-3">
            <Wifi className="h-[18px] w-[18px] text-white/60" />
            <span className="flex-1 text-[14px]">Download on Wi-Fi only</span>
            <Toggle checked={settings.wifiOnly} onChange={(v) => updateSettings({ wifiOnly: v })} />
          </label>
        )}
      </Group>

      <Group title="Admin">
        <Row
          to="/admin"
          icon={<ShieldCheck className="h-[18px] w-[18px]" />}
          label={access.admin ? 'Admin dashboard' : 'Admin sign-in'}
          value={access.admin ? 'Signed in' : undefined}
        />
        {access.admin && <Row onClick={() => clearAdminToken()} icon={<LogOut className="h-[18px] w-[18px]" />} label="Leave admin mode" />}
      </Group>

      <Group title="App">
        {isNativeApp && <UpdateRow />}
        <Row onClick={() => setAboutOpen(true)} icon={<Info className="h-[18px] w-[18px]" />} label="About StreamVault" value={`${platformLabel} · ${APP_VERSION}`} />
      </Group>

      {isAuthenticated && (
        <motion.button variants={item} onClick={() => void signOut()} className="press mt-2 flex w-full items-center justify-center gap-2 rounded-2xl bg-red-500/[0.08] py-3.5 text-[14px] font-bold text-red-300 ring-1 ring-red-400/15 transition-colors hover:bg-red-500/15">
          <LogOut className="h-4 w-4" /> Sign out
        </motion.button>
      )}
      </motion.div>

      <ServerSheet
        open={serverOpen}
        onOpenChange={setServerOpen}
        kind="movie"
        server={settings.defaultServer || defaultServer('movie')}
        onPick={(id) => updateSettings({ defaultServer: id })}
      />
      <Sheet open={aboutOpen} onOpenChange={setAboutOpen} title="About">
        <div className="space-y-3 text-[13px] leading-relaxed text-white/65">
          <Logo />
          <p>
            Version {APP_VERSION} for {platformLabel}. Movies, shows, anime and documentaries — the same library, account and servers as stream-vault.site.
          </p>
          <p>
            StreamVault doesn&apos;t host any video. Titles play from third-party servers, and Premium plays from the Real-Debrid account of the site&apos;s admin. Watch what you have the right to watch where you live.
          </p>
          <p>Title data and images from TMDB. This product uses the TMDB API but is not endorsed or certified by TMDB.</p>
        </div>
      </Sheet>
    </div>
  )
}

function UpdateRow() {
  const { update, checking, refetch } = useAvailableUpdate()
  const { state, install } = useInstallUpdate()
  if (update) {
    const busy = state.phase === 'downloading' || state.phase === 'installing'
    return (
      <Row
        onClick={() => !busy && void install(update)}
        icon={busy ? <Loader2 className="h-[18px] w-[18px] animate-spin" /> : <RefreshCw className="h-[18px] w-[18px] text-primary" />}
        label={busy ? (state.phase === 'installing' ? 'Installing…' : `Downloading ${state.phase === 'downloading' && state.percent !== null ? `${state.percent}%` : ''}`) : `Update to ${update.version}`}
        value={state.phase === 'error' ? 'Failed — tap to retry' : 'New'}
      />
    )
  }
  return (
    <Row
      onClick={refetch}
      icon={checking ? <Loader2 className="h-[18px] w-[18px] animate-spin" /> : <RefreshCw className="h-[18px] w-[18px]" />}
      label="Check for updates"
      value={checking ? 'Checking…' : 'Up to date'}
    />
  )
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <motion.section variants={item} className="mb-5">
      <h2 className="mb-2 px-1 text-[11px] font-bold uppercase tracking-[0.16em] text-white/40">{title}</h2>
      <div className="surface divide-y divide-white/[0.05] overflow-hidden rounded-[20px]">{children}</div>
    </motion.section>
  )
}

function Row({ to, onClick, icon, label, value }: { to?: string; onClick?: () => void; icon: ReactNode; label: string; value?: string }) {
  const inner = (
    <>
      <span className="text-white/60">{icon}</span>
      <span className="flex-1 text-[14px]">{label}</span>
      {value && <span className="max-w-[45%] truncate text-[12.5px] text-white/45">{value}</span>}
      <ChevronRight className="h-4 w-4 text-white/30" />
    </>
  )
  const cls = 'flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-white/[0.04] active:bg-white/[0.06]'
  return to ? (
    <Link to={to} className={cls}>
      {inner}
    </Link>
  ) : (
    <button onClick={onClick} className={cls}>
      {inner}
    </button>
  )
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn('relative flex h-7 w-12 items-center rounded-full p-0.5 transition-colors', checked ? 'justify-end bg-primary' : 'justify-start bg-white/20')}
    >
      <motion.span layout transition={spring} className="h-6 w-6 rounded-full bg-white shadow" />
    </button>
  )
}
