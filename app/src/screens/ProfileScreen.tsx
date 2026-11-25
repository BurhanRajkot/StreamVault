import { useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Bookmark, ChevronRight, FileSearch, Gauge, Info, Loader2, LogOut, Maximize, RefreshCw, Search, Server, ShieldCheck, UserRound, Wifi, Zap } from 'lucide-react'
import { CONFIG, DEBRID_SERVER_ID } from '@/lib/config'
import { startServer } from '@app/lib/startServer'
import { usePremiumAccess } from '@/hooks/usePremiumAccess'
import { useAccessRequests } from '@/hooks/useAccessRequests'
import { clearAdminToken } from '@/lib/api'
import { cn, initialsOf } from '@/lib/utils'
import { useFavorites } from '@/context/FavoritesContext'
import { useAppAuth } from '@app/auth/AppAuthProvider'
import { updateSettings, useSettings } from '@app/lib/settings'
import { APP_VERSION, deviceLabel, isAndroid, isDesktop, isNativeApp } from '@app/native/platform'
import { useAvailableUpdate } from '@app/native/updates'
import { useInstallUpdate } from '@app/native/installUpdate'
import { ServerSheet } from '@app/components/ServerSheet'
import { Sheet } from '@app/components/Sheet'
import { LogoMark } from '@app/components/Logo'
import type { QualityPreference } from '@app/downloads/premiumFile'
import { PageHeader } from '@app/components/PageHeader'
import { PosterCard } from '@app/components/media'
import { useMyList } from '@app/components/MyListRow'
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
  const premiumStatus = access.loading ? 'Checking…' : access.admin ? 'Active' : PREMIUM_LABEL[access.reason] ?? 'Not active'

  return (
    <div className="px-4 pb-tabbar pt-page lg:px-12">
      <div className="mx-auto max-w-[1240px]">
        <PageHeader title="My Space" />

        {/* Who's signed in, and what they have */}
        <section className="relative mb-8 overflow-hidden rounded-[22px] bg-[#111114] p-5 shadow-[inset_0_0_0_var(--hairline)_rgb(255_255_255/0.08)] lg:mb-10 lg:p-7">
          <div aria-hidden="true" className="pointer-events-none absolute -left-24 -top-32 h-72 w-72 rounded-full bg-tint/25 blur-[90px]" />
          <div aria-hidden="true" className="pointer-events-none absolute -bottom-40 right-10 h-72 w-72 rounded-full bg-ios-indigo/15 blur-[100px]" />
          <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center">
            {isAuthenticated && user ? (
              <>
                <div className="flex min-w-0 flex-1 items-center gap-4 lg:gap-5">
                  {user.picture ? (
                    <img src={user.picture} alt="" referrerPolicy="no-referrer" className="h-16 w-16 shrink-0 rounded-full object-cover ring-2 ring-white/10 lg:h-20 lg:w-20" />
                  ) : (
                    <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-white/[0.12] text-[22px] font-semibold lg:h-20 lg:w-20">
                      {initialsOf(user.name)}
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className="line-clamp-2 break-words text-[22px] font-bold capitalize leading-7 tracking-[-0.015em] lg:text-[26px] lg:leading-8">{user.name || user.nickname}</p>
                    <p className="truncate text-[13px] text-white/50">{user.email}</p>
                    <div className="mt-2.5 flex flex-wrap gap-2">
                      <PremiumPill active={access.premium} label={premiumStatus} />
                      {access.admin && <Pill>Admin</Pill>}
                    </div>
                  </div>
                </div>
                <Button variant="gray" size="sm" onClick={() => void signOut()} className="self-start sm:self-center">
                  <LogOut /> Sign out
                </Button>
              </>
            ) : (
              <>
                <div className="flex min-w-0 flex-1 items-center gap-4">
                  <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-white/[0.08] text-white/70">
                    <UserRound className="h-8 w-8" strokeWidth={1.6} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[20px] font-bold leading-7">Sign in to StreamVault</p>
                    <p className="text-[13px] text-white/50">Your list and progress, on every device</p>
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
              </>
            )}
          </div>
        </section>

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(340px,400px)] lg:gap-10">
          {/* The titles saved, as posters */}
          <MyListPreview />

          {/* Settings */}
          <div>
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
                label="Downloads"
                trailing={
                  <SegmentedControl
                    size="sm"
                    layoutId="quality-thumb"
                    options={(['720p', '1080p', '4K'] as QualityPreference[]).map((q) => ({ id: q, label: q }))}
                    value={settings.downloadQuality}
                    onChange={(q) => updateSettings({ downloadQuality: q })}
                    className="w-[156px]"
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

            {/* Signed out of admin mode: the way in, right on this page */}
            {!access.admin && (
              <ListSection header="Admin">
                <ListRow
                  to="/admin"
                  icon={
                    <IconTile color="gray">
                      <ShieldCheck />
                    </IconTile>
                  }
                  label="Admin sign-in"
                />
              </ListSection>
            )}

            {/* Only the admin sees these */}
            {access.admin && (
              <ListSection header="Admin">
                <ListRow
                  to="/18plus"
                  icon={
                    <IconTile color="red">
                      <span className="text-[11px] font-bold leading-none">18+</span>
                    </IconTile>
                  }
                  label="18+ shelf"
                />
                <ListRow
                  icon={
                    <IconTile color="teal">
                      <FileSearch />
                    </IconTile>
                  }
                  label="File search"
                  detail="Search the files in your Real-Debrid account by keyword"
                  trailing={<Switch label="File search" checked={settings.fileSearch} onChange={(v) => updateSettings({ fileSearch: v })} />}
                />
                {settings.fileSearch && (
                  <ListRow
                    to="/files"
                    icon={
                      <IconTile color="teal">
                        <Search />
                      </IconTile>
                    }
                    label="Search my files"
                  />
                )}
                <ListRow
                  to="/admin"
                  icon={
                    <IconTile color="gray">
                      <ShieldCheck />
                    </IconTile>
                  }
                  label="Dashboard"
                  trailing={
                    pendingRequests > 0 ? (
                      <span className="rounded-full bg-ios-red px-2 text-[12px] font-semibold leading-[20px]">{pendingRequests}</span>
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

            <ListSection header="App" className="mb-0">
              {isNativeApp && <UpdateRow />}
              <ListRow
                onClick={() => setAboutOpen(true)}
                icon={
                  <IconTile color="gray">
                    <Info />
                  </IconTile>
                }
                label="About"
                value={`${deviceLabel()} ${APP_VERSION}`}
              />
            </ListSection>
          </div>
        </div>
      </div>

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
              Version {APP_VERSION} for {deviceLabel()}
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

function Pill({ children }: { children: ReactNode }) {
  return <span className="inline-flex h-6 items-center rounded-full bg-white/[0.08] px-2.5 text-[12px] font-semibold text-white/80">{children}</span>
}

/** Premium's state, as a pill that opens the Premium screen. */
function PremiumPill({ active, label }: { active: boolean; label: string }) {
  return (
    <Link
      to="/premium"
      className={cn(
        'inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-[12px] font-semibold transition-colors',
        active ? 'bg-ios-green/15 text-ios-green hover:bg-ios-green/20' : 'bg-white/[0.08] text-white/70 hover:bg-white/[0.12]'
      )}
    >
      <Zap className="h-3 w-3 fill-current" /> Premium · {label}
    </Link>
  )
}

/** My List as posters — the first handful, and the way to the rest. */
function MyListPreview() {
  const navigate = useNavigate()
  const { isAuthenticated } = useAppAuth()
  const { favorites } = useFavorites()
  const { data, isLoading } = useMyList()
  const shown = (data ?? []).filter((m) => m.poster_path).slice(0, PREVIEW_COUNT)

  return (
    <section className="min-w-0">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-[20px] font-bold tracking-[-0.01em]">
          My List
          {favorites.length > 0 && <span className="ml-2 text-[15px] font-medium text-white/40">{favorites.length}</span>}
        </h2>
        {favorites.length > 0 && (
          <Link to="/my-list" className="flex items-center gap-0.5 text-[14px] font-medium text-white/60 transition-colors hover:text-white">
            See all <ChevronRight className="h-4 w-4" />
          </Link>
        )}
      </div>
      {favorites.length === 0 ? (
        <div className="flex flex-col items-start gap-3 rounded-[18px] bg-[#111114] p-6 shadow-[inset_0_0_0_var(--hairline)_rgb(255_255_255/0.06)]">
          <Bookmark className="h-7 w-7 text-white/40" strokeWidth={1.6} />
          <div>
            <p className="text-[16px] font-semibold">{isAuthenticated ? 'Nothing saved yet' : 'Keep a list'}</p>
            <p className="text-[13px] text-white/50">{isAuthenticated ? 'Press + on any title to save it here.' : 'Sign in to save titles to watch later.'}</p>
          </div>
          <Button variant="gray" size="sm" onClick={() => navigate('/')}>
            Browse
          </Button>
        </div>
      ) : isLoading && shown.length === 0 ? (
        <div className={PREVIEW_GRID}>
          {Array.from({ length: Math.min(favorites.length, PREVIEW_COUNT) }, (_, i) => (
            <div key={i} className={cn('skeleton aspect-[2/3] rounded-[10px]', previewHidden(i))} />
          ))}
        </div>
      ) : (
        <div className={PREVIEW_GRID}>
          {shown.map((m, i) => (
            <PosterCard key={`${m.media_type ?? 'm'}-${m.id}`} media={m} className={previewHidden(i)} />
          ))}
        </div>
      )}
    </section>
  )
}

/** Two rows of posters: three across on a phone, four in a window, five on a wide one. */
const PREVIEW_COUNT = 10
const PREVIEW_GRID = 'grid grid-cols-3 gap-2.5 sm:grid-cols-4 lg:gap-3 xl:grid-cols-5'

/** Past two full rows at this width, a poster waits for a wider one. */
function previewHidden(i: number): string | undefined {
  if (i >= 8) return 'hidden xl:block'
  if (i >= 6) return 'hidden sm:block'
  return undefined
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
        label={busy ? (state.phase === 'installing' ? 'Installing…' : `Downloading${state.phase === 'downloading' && state.percent !== null ? ` ${state.percent}%` : '…'}`) : `Version ${update.version} is out`}
        detail={state.phase === 'error' ? state.message : undefined}
        trailing={
          busy ? (
            <Loader2 className="h-4 w-4 animate-spin text-label-2" />
          ) : (
            <span className="rounded-full bg-tint px-3 text-[12px] font-semibold leading-[24px] text-white">Update</span>
          )
        }
        accessory="none"
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
