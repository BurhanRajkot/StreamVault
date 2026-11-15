import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
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
    <div className="mx-auto max-w-2xl px-4 pb-tabbar pt-safe lg:px-8 lg:pb-10">
      <h1 className="pb-4 pt-4 text-[22px] font-extrabold tracking-tight lg:pt-8">My Space</h1>

      {/* Account */}
      <section className="mb-4 rounded-2xl bg-white/[0.04] p-4 ring-1 ring-white/[0.06]">
        {isAuthenticated && user ? (
          <div className="flex items-center gap-3.5">
            {user.picture ? (
              <img src={user.picture} alt="" referrerPolicy="no-referrer" className="h-14 w-14 rounded-xl object-cover" />
            ) : (
              <span className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary text-lg font-bold">{initialsOf(user.name)}</span>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-[16px] font-bold">{user.name || user.nickname}</p>
              <p className="truncate text-[12.5px] text-white/50">{user.email}</p>
            </div>
          </div>
        ) : (
          <div>
            <p className="text-[15px] font-bold">Sign in to StreamVault</p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-white/55">Your list, continue watching and recommendations — the same as on the website.</p>
            <div className="mt-3.5 flex gap-2">
              <button disabled={isLoading} onClick={() => void signIn()} className="press flex-1 rounded-md bg-white py-2.5 text-[13.5px] font-semibold text-black">
                Sign in
              </button>
              <button disabled={isLoading} onClick={() => void signIn({ signup: true })} className="press flex-1 rounded-md bg-white/10 py-2.5 text-[13.5px] font-semibold">
                Create account
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Premium */}
      <Link
        to="/premium"
        className="press mb-6 flex items-center gap-3.5 rounded-2xl bg-gradient-to-r from-amber-500/[0.14] via-amber-500/[0.05] to-transparent p-4 ring-1 ring-amber-400/25"
      >
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-400/15">
          <Zap className="h-5 w-5 text-amber-300" />
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

      <Group title="Library">
        <Row to="/my-list" icon={<Heart className="h-[18px] w-[18px]" />} label="My List" />
        <Row to="/downloads" icon={<Download className="h-[18px] w-[18px]" />} label="Downloads" />
      </Group>

      <Group title="Playback & downloads">
        <Row onClick={() => setServerOpen(true)} icon={<Server className="h-[18px] w-[18px]" />} label="Default server" value={serverName} />
        <div className="flex items-center gap-3 px-4 py-3">
          <Download className="h-[18px] w-[18px] text-white/60" />
          <span className="flex-1 text-[14px]">Download quality</span>
          <div className="flex rounded-lg bg-white/[0.06] p-0.5">
            {(['720p', '1080p', '4K'] as QualityPreference[]).map((q) => (
              <button
                key={q}
                onClick={() => updateSettings({ downloadQuality: q })}
                className={cn('rounded-md px-2.5 py-1 text-[12px] font-semibold', settings.downloadQuality === q ? 'bg-white text-black' : 'text-white/60')}
              >
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
        <button onClick={() => void signOut()} className="press mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-white/[0.04] py-3 text-[14px] font-semibold text-red-300">
          <LogOut className="h-4 w-4" /> Sign out
        </button>
      )}

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
    <section className="mb-5">
      <h2 className="mb-1.5 px-1 text-[11.5px] font-semibold uppercase tracking-wider text-white/40">{title}</h2>
      <div className="divide-y divide-white/[0.05] overflow-hidden rounded-2xl bg-white/[0.04] ring-1 ring-white/[0.06]">{children}</div>
    </section>
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
  const cls = 'flex w-full items-center gap-3 px-4 py-3.5 text-left active:bg-white/[0.03]'
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
      className={cn('relative h-6 w-10 rounded-full transition-colors', checked ? 'bg-primary' : 'bg-white/20')}
    >
      <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform', checked ? 'translate-x-[18px]' : 'translate-x-0.5')} />
    </button>
  )
}
