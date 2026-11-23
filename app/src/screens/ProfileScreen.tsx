import { useState } from 'react'
import { Download, Gauge, Heart, Info, Loader2, LogOut, Maximize, RefreshCw, Server, ShieldCheck, UserRound, Wifi, Zap } from 'lucide-react'
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
import { IconTile, ListRow, ListSection, SegmentedControl, Switch } from '@app/components/kit'

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
    <div className="mx-auto max-w-[760px] px-4 pb-tabbar pt-page lg:px-8">
      <PageHeader title="My Space" />

      {/* Account */}
      <ListSection>
        {isAuthenticated && user ? (
          <div className="flex items-center gap-3.5 px-4 py-3">
            {user.picture ? (
              <img src={user.picture} alt="" referrerPolicy="no-referrer" className="h-[60px] w-[60px] rounded-full object-cover" />
            ) : (
              <span className="flex h-[60px] w-[60px] items-center justify-center rounded-full bg-ios-gray text-[22px] font-semibold">{initialsOf(user.name)}</span>
            )}
            <div className="min-w-0 flex-1">
              <p className="t-title3 truncate">{user.name || user.nickname}</p>
              <p className="t-footnote truncate text-label-2">{user.email}</p>
            </div>
          </div>
        ) : (
          <>
            <ListRow
              onClick={() => !isLoading && void signIn()}
              icon={
                <span className="flex h-[60px] w-[60px] shrink-0 items-center justify-center rounded-full bg-ios-gray/60 text-white/90">
                  <UserRound className="h-8 w-8" strokeWidth={1.6} />
                </span>
              }
              label={<span className="t-headline text-tint">Sign in to StreamVault</span>}
              detail="Your list, continue watching and recommendations — the same as on the website."
              className="py-3"
            />
            <ListRow onClick={() => !isLoading && void signIn({ signup: true })} label="Create an account" tint />
          </>
        )}
      </ListSection>

      {/* Premium */}
      <ListSection>
        <ListRow
          to="/premium"
          icon={
            <IconTile color="yellow">
              <Zap className="fill-current" />
            </IconTile>
          }
          label="Premium"
          value={<span className={access.premium ? 'text-ios-green' : undefined}>{premiumStatus}</span>}
        />
      </ListSection>

      <ListSection header="Library">
        <ListRow
          to="/my-list"
          icon={
            <IconTile color="pink">
              <Heart className="fill-current" />
            </IconTile>
          }
          label="My List"
        />
        <ListRow
          to="/downloads"
          icon={
            <IconTile color="blue">
              <Download strokeWidth={2.4} />
            </IconTile>
          }
          label="Downloads"
        />
      </ListSection>

      <ListSection header="Playback & downloads">
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
          label="Download quality"
          detail={
            <SegmentedControl
              size="sm"
              layoutId="quality-thumb"
              options={(['720p', '1080p', '4K'] as QualityPreference[]).map((q) => ({ id: q, label: q }))}
              value={settings.downloadQuality}
              onChange={(q) => updateSettings({ downloadQuality: q })}
              className="mb-1 mt-2 max-w-[280px]"
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
            label="Open the player in full screen"
            detail="Off: films play in the window — move it, resize it, snap it beside another or minimize it"
            trailing={
              <Switch label="Open the player in full screen" checked={settings.playerFullscreen} onChange={(v) => updateSettings({ playerFullscreen: v })} />
            }
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

      <ListSection header="Admin">
        <ListRow
          to="/admin"
          icon={
            <IconTile color="gray">
              <ShieldCheck />
            </IconTile>
          }
          label={access.admin ? 'Admin dashboard' : 'Admin sign-in'}
          detail={access.admin ? undefined : 'For the site’s admin — opens the dashboard'}
          value={access.admin && !pendingRequests ? 'Signed in' : undefined}
          trailing={
            pendingRequests > 0 ? (
              <span className="rounded-full bg-ios-red px-2 text-[13px] font-semibold leading-[20px]">{pendingRequests}</span>
            ) : undefined
          }
        />
        {access.admin && (
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
        )}
      </ListSection>

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
          <p>Movies, shows, anime and documentaries — the same library, account and servers as stream-vault.site.</p>
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
