import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Bookmark, Download, Gauge, Info, Loader2, LogOut, Maximize, RefreshCw, Server, ShieldCheck, UserRound, Wifi, Zap } from 'lucide-react'
import { CONFIG, DEBRID_SERVER_ID } from '@/lib/config'
import { startServer } from '@app/lib/startServer'
import { usePremiumAccess } from '@/hooks/usePremiumAccess'
import { useAccessRequests } from '@/hooks/useAccessRequests'
import { clearAdminToken } from '@/lib/api'
import { initialsOf } from '@/lib/utils'
import { useAppAuth } from '@app/auth/AppAuthProvider'
import { updateSettings, useSettings } from '@app/lib/settings'
import { APP_VERSION, isAndroid, isDesktop, isNativeApp, platformLabel } from '@app/native/platform'
import { useAvailableUpdate } from '@app/native/updates'
import { useInstallUpdate } from '@app/native/installUpdate'
import { ServerSheet } from '@app/components/ServerSheet'
import { Sheet } from '@app/components/Sheet'
import { LogoMark } from '@app/components/Logo'
import type { QualityPreference } from '@app/downloads/premiumFile'
import { PageHeader } from '@app/components/PageHeader'
import { Button, IconTile, ListRow, ListSection, SegmentedControl, Switch } from '@app/components/kit'

const PREMIUM_LABEL: Record<string, string> = {
  granted: 'Active',
  'sign-in-required': 'Not active',
  'not-approved': 'Not active',
  paused: 'Paused by the admin',
  'paused-for-all': 'Paused for everyone right now',
  suspended: 'Account suspended',
  'app-only': 'Active',
  'update-required': 'Update the app to use it',
}

export function ProfileScreen() {
  const { isAuthenticated, user, signIn, signOut, isLoading } = useAppAuth()
  const access = usePremiumAccess()
  const { pending: pendingRequests } = useAccessRequests(access.admin)
  const settings = useSettings()
  const [serverOpen, setServerOpen] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)
  const startsOn = startServer('movie', access.premium, settings)
  const serverName = startsOn === DEBRID_SERVER_ID ? 'Premium' : CONFIG.PROVIDER_NAMES[startsOn]
  const premiumStatus = access.loading ? 'Checking…' : access.admin ? 'Active · admin' : PREMIUM_LABEL[access.reason] ?? 'Not active'

  return (
    <div className="mx-auto max-w-[720px] px-4 pb-tabbar pt-page lg:mx-0 lg:max-w-[920px] lg:px-12">
      <PageHeader title="My Space" />

      {/* Account */}
      <section className="mb-7 flex items-center gap-4">
        {isAuthenticated && user ? (
          <>
            {user.picture ? (
              <img src={user.picture} alt="" referrerPolicy="no-referrer" className="h-16 w-16 rounded-full object-cover" />
            ) : (
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white/[0.12] text-[22px] font-semibold">{initialsOf(user.name)}</span>
            )}
            <div className="min-w-0 flex-1">
              <p className="t-title2 truncate">{user.name || user.nickname}</p>
              <p className="t-footnote truncate text-label-2">{user.email}</p>
            </div>
          </>
        ) : (
          <div className="flex w-full flex-col gap-4 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 items-center gap-4">
              <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-white/[0.08] text-white/70">
                <UserRound className="h-8 w-8" strokeWidth={1.6} />
              </span>
              <div className="min-w-0">
                <p className="t-title3">Not signed in</p>
                <p className="t-footnote text-label-2">Sync your list and progress across devices</p>
              </div>
            </div>
            <div className="flex gap-2.5">
              <Button onClick={() => !isLoading && void signIn()} className="flex-1 sm:flex-none">
                Sign In
              </Button>
              <Button variant="gray" onClick={() => !isLoading && void signIn({ signup: true })} className="flex-1 sm:flex-none">
                Create Account
              </Button>
            </div>
          </div>
        )}
      </section>

      {/* Where you go most */}
      <div className="mb-8 grid grid-cols-3 gap-2.5 lg:gap-3">
        <Tile to="/my-list" icon={<Bookmark />} label="My List" />
        <Tile to="/downloads" icon={<Download />} label="Downloads" />
        <Tile
          to="/premium"
          icon={<Zap className="fill-current text-ios-yellow" />}
          label="Premium"
          detail={<span className={access.premium ? 'text-ios-green' : undefined}>{premiumStatus}</span>}
        />
      </div>

      <ListSection header="Playback">
        <ListRow
          onClick={() => setServerOpen(true)}
          icon={
            <IconTile color="indigo">
              <Server />
            </IconTile>
          }
          label="Default server"
          value={serverName}
        />
        <ListRow
          icon={
            <IconTile color="green">
              <Gauge />
            </IconTile>
          }
          label={
            <>
              <span className="sm:hidden">Quality</span>
              <span className="max-sm:hidden">Download quality</span>
            </>
          }
          trailing={
            <SegmentedControl
              size="sm"
              layoutId="quality-thumb"
              options={(['720p', '1080p', '4K'] as QualityPreference[]).map((q) => ({ id: q, label: q }))}
              value={settings.downloadQuality}
              onChange={(q) => updateSettings({ downloadQuality: q })}
              className="w-[168px]"
            />
          }
        />
        {isDesktop && (
          <ListRow
            icon={
              <IconTile color="indigo">
                <Maximize />
              </IconTile>
            }
            label="Play in full screen"
            trailing={<Switch label="Play in full screen" checked={settings.playerFullscreen} onChange={(v) => updateSettings({ playerFullscreen: v })} />}
          />
        )}
        {isAndroid && (
          <ListRow
            icon={
              <IconTile color="blue">
                <Wifi />
              </IconTile>
            }
            label="Download on Wi-Fi only"
            trailing={<Switch label="Download on Wi-Fi only" checked={settings.wifiOnly} onChange={(v) => updateSettings({ wifiOnly: v })} />}
          />
        )}
      </ListSection>

      {/* Only the admin sees these; signing in as admin lives under About */}
      {access.admin && (
        <ListSection header="Admin">
          <ListRow
            to="/admin"
            icon={
              <IconTile color="gray">
                <ShieldCheck />
              </IconTile>
            }
            label="Admin dashboard"
            trailing={
              pendingRequests > 0 ? (
                <span className="rounded-full bg-ios-red px-2 text-[13px] font-semibold leading-[20px]">{pendingRequests}</span>
              ) : undefined
            }
          />
          <ListRow
            onClick={() => clearAdminToken()}
            icon={
              <IconTile color="gray">
                <LogOut />
              </IconTile>
            }
            label="Leave admin mode"
            accessory="none"
          />
        </ListSection>
      )}

      <ListSection header="App">
        {isNativeApp && <UpdateRow />}
        <ListRow
          onClick={() => setAboutOpen(true)}
          icon={
            <IconTile color="gray">
              <Info />
            </IconTile>
          }
          label="About"
          value={`${platformLabel} ${APP_VERSION}`}
        />
      </ListSection>

      {isAuthenticated && (
        <ListSection>
          <ListRow onClick={() => void signOut()} label="Sign Out" destructive center accessory="none" />
        </ListSection>
      )}

      <ServerSheet
        open={serverOpen}
        onOpenChange={setServerOpen}
        kind="movie"
        server={startsOn}
        // With Premium, picking another server here is the one way to stop starting on Premium
        onPick={(id) => updateSettings(access.premium ? { defaultServer: id, premiumDefault: id === DEBRID_SERVER_ID } : { defaultServer: id })}
      />
      <Sheet open={aboutOpen} onOpenChange={setAboutOpen} title="About">
        <div className="t-subhead space-y-3 text-label-2">
          <div className="flex flex-col items-center gap-2 pb-2 pt-1 text-center">
            <LogoMark className="h-16 w-16" />
            <p className="t-headline text-white">StreamVault</p>
            <p className="t-footnote">
              Version {APP_VERSION} for {platformLabel}
            </p>
          </div>
          <p>
            StreamVault doesn&apos;t host any video — titles play from third-party servers. Title data and images from TMDB; this product uses the TMDB API but is not endorsed or certified by TMDB.
          </p>
          {!access.admin && (
            <Link to="/admin" onClick={() => setAboutOpen(false)} className="block pt-2 text-center text-[13px] text-label-3 hover:text-label-2">
              Admin sign-in
            </Link>
          )}
        </div>
      </Sheet>
    </div>
  )
}

/** A shortcut card: an icon, a name, sometimes a line of status. */
function Tile({ to, icon, label, detail }: { to: string; icon: ReactNode; label: string; detail?: ReactNode }) {
  return (
    <Link to={to} className="glass-card press flex min-h-[96px] flex-col justify-between gap-3 rounded-[14px] p-3.5 transition-colors hover:bg-white/[0.06] lg:min-h-[108px] lg:p-4">
      <span className="text-white/85 [&>svg]:h-[22px] [&>svg]:w-[22px]">{icon}</span>
      <span className="min-w-0">
        <span className="block truncate text-[15px] font-semibold">{label}</span>
        {detail && <span className="block truncate text-[12px] text-label-2">{detail}</span>}
      </span>
    </Link>
  )
}

function UpdateRow() {
  const { update, checking, refetch } = useAvailableUpdate()
  const { state, install } = useInstallUpdate()
  const tile = (
    <IconTile color="green">
      <RefreshCw strokeWidth={2.4} />
    </IconTile>
  )
  if (update) {
    const busy = state.phase === 'downloading' || state.phase === 'installing'
    return (
      <ListRow
        onClick={() => !busy && void install(update)}
        icon={tile}
        label={busy ? (state.phase === 'installing' ? 'Installing…' : `Downloading${state.phase === 'downloading' && state.percent !== null ? ` ${state.percent}%` : '…'}`) : `Update to ${update.version}`}
        detail={state.phase === 'error' ? state.message : undefined}
        trailing={busy ? <Loader2 className="h-4 w-4 animate-spin text-label-2" /> : <span className="rounded-full bg-ios-red px-2 text-[13px] font-semibold leading-[20px]">1</span>}
      />
    )
  }
  return (
    <ListRow
      onClick={refetch}
      icon={tile}
      label="Check for updates"
      value={checking ? undefined : 'Up to date'}
      trailing={checking ? <Loader2 className="h-4 w-4 animate-spin text-label-2" /> : undefined}
      accessory="none"
    />
  )
}
