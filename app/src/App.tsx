import { lazy, Suspense, useEffect, useLayoutEffect, useRef } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate, useNavigationType } from 'react-router-dom'
import { useAuth0 } from '@auth0/auth0-react'
import { useQueryClient } from '@tanstack/react-query'
import { MotionConfig } from 'framer-motion'
import { FavoritesProvider } from '@/context/FavoritesContext'
import { DislikesProvider } from '@/context/DislikesContext'
import { AccountSync } from '@/components/layout/AccountSync'
import { desktop, isAndroid, isTv } from '@app/native/platform'
import { useSettings } from '@app/lib/settings'
import { TitleBar } from '@app/components/shell/TitleBar'
import { TabBar } from '@app/components/shell/TabBar'
import { WindowStrip, useFramelessClass } from '@app/components/shell/WindowControls'
import { UpdateBanner } from '@app/components/UpdateBanner'
import { Welcome } from '@app/screens/Welcome'
import { HomeScreen } from '@app/screens/HomeScreen'
import { HoverPreviewLayer } from '@app/components/HoverPreview'
import { TvOpenOnPhoneLayer } from '@app/tv/TvOpenOnPhone'
import { focusOn, focusScreen, isNavigable, markFocus, restoreFocus, type FocusMark } from '@app/tv/tvRemote'

/** The screens past Home, loaded on first use — and fetched in the background right after start, so none opens blank. */
const screens = {
  title: () => import('@app/screens/TitleScreen').then((m) => ({ default: m.TitleScreen })),
  player: () => import('@app/screens/PlayerScreen').then((m) => ({ default: m.PlayerScreen })),
  offline: () => import('@app/screens/OfflinePlayerScreen').then((m) => ({ default: m.OfflinePlayerScreen })),
  search: () => import('@app/screens/SearchScreen').then((m) => ({ default: m.SearchScreen })),
  downloads: () => import('@app/screens/DownloadsScreen').then((m) => ({ default: m.DownloadsScreen })),
  profile: () => import('@app/screens/ProfileScreen').then((m) => ({ default: m.ProfileScreen })),
  myList: () => import('@app/screens/MyListScreen').then((m) => ({ default: m.MyListScreen })),
  premium: () => import('@app/screens/PremiumScreen').then((m) => ({ default: m.PremiumScreen })),
  admin: () => import('@app/screens/AdminScreen').then((m) => ({ default: m.AdminScreen })),
  mature: () => import('@app/screens/MatureScreen').then((m) => ({ default: m.MatureScreen })),
  f1: () => import('@app/screens/F1Screen').then((m) => ({ default: m.F1Screen })),
  f1Race: () => import('@app/screens/F1RaceScreen').then((m) => ({ default: m.F1RaceScreen })),
  f1Player: () => import('@app/screens/F1PlayerScreen').then((m) => ({ default: m.F1PlayerScreen })),
  person: () => import('@app/screens/PersonScreen').then((m) => ({ default: m.PersonScreen })),
  collection: () => import('@app/screens/CollectionScreen').then((m) => ({ default: m.CollectionScreen })),
  browse: () => import('@app/screens/BrowseScreen').then((m) => ({ default: m.BrowseScreen })),
  tvSignIn: () => import('@app/tv/TvSignInScreen').then((m) => ({ default: m.TvSignInScreen })),
}
const TitleScreen = lazy(screens.title)
const PlayerScreen = lazy(screens.player)
const OfflinePlayerScreen = lazy(screens.offline)
const SearchScreen = lazy(screens.search)
const DownloadsScreen = lazy(screens.downloads)
const ProfileScreen = lazy(screens.profile)
const MyListScreen = lazy(screens.myList)
const PremiumScreen = lazy(screens.premium)
const AdminScreen = lazy(screens.admin)
const MatureScreen = lazy(screens.mature)
const F1Screen = lazy(screens.f1)
const F1RaceScreen = lazy(screens.f1Race)
const F1PlayerScreen = lazy(screens.f1Player)
const PersonScreen = lazy(screens.person)
const CollectionScreen = lazy(screens.collection)
const BrowseScreen = lazy(screens.browse)
const TvSignInScreen = lazy(screens.tvSignIn)

/** Screens that own the whole display — no bars. */
const FULLSCREEN = /^\/(watch|offline)\//

export function App() {
  const settings = useSettings()
  const location = useLocation()
  useAndroidBackButton()
  useTvFocus(settings.acceptedTerms)
  useEscapeBridge()
  useScrollMemory()
  useFramelessClass()
  usePreloadScreens()

  if (!settings.acceptedTerms) {
    return (
      <MotionConfig reducedMotion={isTv ? 'always' : 'user'}>
        <Welcome />
      </MotionConfig>
    )
  }

  const fullscreen = FULLSCREEN.test(location.pathname)
  return (
    <MotionConfig reducedMotion={isTv ? 'always' : 'user'}>
      <FavoritesProvider>
        <DislikesProvider>
          <AccountSync />
          <UserSwitchGuard />
          {!fullscreen && <TitleBar />}
          {!isTv && <HoverPreviewLayer />}
          {isTv && <TvOpenOnPhoneLayer />}
          {/* A narrow (snapped, split-screen) desktop window: a slim title bar instead — the players carry their own */}
          {!fullscreen && <WindowStrip />}
          <main className="relative z-10 min-h-[100dvh] text-foreground">
            <Suspense fallback={<div className="min-h-[100dvh]" />}>
              <Routes location={location}>
                <Route path="/" element={<HomeScreen mode="home" />} />
                <Route path="/movies" element={<HomeScreen mode="movie" />} />
                <Route path="/tv" element={<HomeScreen mode="tv" />} />
                <Route path="/anime" element={<HomeScreen mode="anime" />} />
                <Route path="/documentaries" element={<HomeScreen mode="documentary" />} />
                <Route path="/search" element={<SearchScreen />} />
                <Route path="/downloads" element={<DownloadsScreen />} />
                <Route path="/me" element={<ProfileScreen />} />
                <Route path="/my-list" element={<MyListScreen />} />
                <Route path="/premium" element={<PremiumScreen />} />
                <Route path="/admin" element={<AdminScreen />} />
                <Route path="/18plus" element={<MatureScreen />} />
                <Route path="/title/:type/:id" element={<TitleScreen />} />
                <Route path="/person/:id" element={<PersonScreen />} />
                <Route path="/collection/:id" element={<CollectionScreen />} />
                <Route path="/browse/:slug" element={<BrowseScreen />} />
                <Route path="/watch/:type/:id" element={<PlayerScreen />} />
                <Route path="/f1" element={<F1Screen />} />
                <Route path="/f1/:year/:round" element={<F1RaceScreen />} />
                <Route path="/watch/f1/:year/:round/:session" element={<F1PlayerScreen />} />
                <Route path="/offline/:id" element={<OfflinePlayerScreen />} />
                <Route path="/tv-signin" element={<TvSignInScreen />} />
                {/* The site's player links here to sign in */}
                <Route path="/login" element={<Navigate to={isTv ? '/tv-signin' : '/me'} replace />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </main>
          {!fullscreen && <TabBar />}
          {!fullscreen && <UpdateBanner />}
        </DislikesProvider>
      </FavoritesProvider>
    </MotionConfig>
  )
}

/** Fetch every screen's code once the app has settled, so moving around never waits on a chunk. */
function usePreloadScreens() {
  useEffect(() => {
    const run = () => {
      Object.values(screens).forEach((load) => void load().catch(() => {}))
      // The Premium player itself (PremiumPane loads it lazily): ready before the first Play
      void import('@/components/player/DebridPlayerPane').catch(() => {})
    }
    const idle = window.requestIdleCallback ? window.requestIdleCallback(run, { timeout: 2500 }) : window.setTimeout(run, 1200)
    return () => (window.cancelIdleCallback ? window.cancelIdleCallback(idle) : window.clearTimeout(idle))
  }, [])
}

/**
 * New screens open at the top; going back returns to where you were on the
 * previous one, once its content is tall enough to scroll there.
 */
function useScrollMemory() {
  const location = useLocation()
  const type = useNavigationType()
  const positions = useRef(new Map<string, number>())
  const currentKey = useRef(location.key)
  const lastPath = useRef(location.pathname)

  useEffect(() => {
    // Once a frame, not on every scroll event: reading scrollY while the page
    // glides forced a layout each time (a TV box fell behind on it)
    let frame = 0
    const record = () => {
      frame = 0
      positions.current.set(currentKey.current, window.scrollY)
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(record)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(frame)
    }
  }, [])

  useLayoutEffect(() => {
    currentKey.current = location.key
    const samePage = lastPath.current === location.pathname
    lastPath.current = location.pathname
    if (type !== 'POP') {
      if (!samePage) window.scrollTo(0, 0)
      return
    }
    const target = positions.current.get(location.key) ?? 0
    let tries = 0
    let frame = 0
    const restore = () => {
      const room = document.documentElement.scrollHeight - window.innerHeight
      window.scrollTo(0, Math.min(target, room))
      if (room < target && tries++ < 90) frame = requestAnimationFrame(restore)
    }
    restore()
    return () => cancelAnimationFrame(frame)
  }, [location.key, location.pathname, type])
}

/**
 * Linux: while an embedded player's frame has focus it swallows the keyboard,
 * so the shell forwards Escape and the app replays it here — sheets close and
 * the player's controls come back as if the frame weren't there.
 */
function useEscapeBridge() {
  useEffect(
    () =>
      desktop?.onKey?.((key) => {
        if (key !== 'Escape' || document.activeElement?.tagName !== 'IFRAME') return
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      }),
    []
  )
  // Escape leaves full screen (the shell does too; asking twice is harmless)
  useEffect(() => {
    if (!desktop) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') void desktop?.setFullscreen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])
}

/** Another account signed in: nothing of the previous one's may show. */
function UserSwitchGuard() {
  const { user } = useAuth0()
  const queryClient = useQueryClient()
  const previous = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (previous.current !== undefined && previous.current !== user?.sub) queryClient.clear()
    previous.current = user?.sub
  }, [user?.sub, queryClient])
  return null
}

/**
 * Android's back gesture: back through the app's own history, and from a tab
 * root to Home, then out of the app — what every Android app does.
 */
function useAndroidBackButton() {
  const navigate = useNavigate()
  const location = useLocation()
  const pathRef = useRef(location.pathname)
  pathRef.current = location.pathname

  useEffect(() => {
    if (!isAndroid) return
    let remove: (() => void) | undefined
    void import('@capacitor/app').then(async ({ App }) => {
      const handle = await App.addListener('backButton', () => {
        // An open sheet or dialog closes first (they listen for Escape)
        const open = document.querySelector('[data-sheet-open="true"], [role="dialog"]')
        if (open) {
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
          return
        }
        const path = pathRef.current
        if (isTv && tvBack(path)) return
        if (path === '/') {
          void App.minimizeApp()
          return
        }
        const historyIndex = (window.history.state as { idx?: number } | null)?.idx ?? 0
        if (historyIndex > 0) navigate(-1)
        else navigate('/', { replace: true })
      })
      remove = () => void handle.remove()
    })
    return () => remove?.()
  }, [navigate])
}

/** The tabs of the top bar: Back from one of them goes Home. */
const TV_ROOTS = ['/', '/movies', '/tv', '/anime', '/documentaries', '/f1', '/my-list']

/**
 * The remote's Back, before the usual: out of an embed's frame back to our
 * bar over it; from deep down a tab, back to its top first — then on out.
 * True when it handled the press.
 */
function tvBack(path: string): boolean {
  const player = document.querySelector<HTMLElement>('.app-player')
  if (player && document.activeElement?.tagName === 'IFRAME') {
    // The embed has the remote: bring our bar back (the player shows it on Escape) and take the focus
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    ;(document.activeElement as HTMLElement).blur()
    requestAnimationFrame(() => {
      const first = Array.from(player.querySelectorAll<HTMLElement>('button')).find(isNavigable)
      if (first) first.focus()
    })
    return true
  }
  if (!player && TV_ROOTS.includes(path) && window.scrollY > 40) {
    window.scrollTo({ top: 0, behavior: 'auto' })
    const play = document.querySelector<HTMLElement>('main [data-tv-autofocus]')
    const first = play && isNavigable(play) ? play : Array.from(document.querySelectorAll<HTMLElement>('main a[href], main button')).find(isNavigable)
    if (first) focusOn(first)
    return true
  }
  return false
}

/**
 * TV: every screen opens with something focused (the remote needs a place to
 * start), and going back lands on the card or button it left from.
 */
function useTvFocus(started: boolean) {
  const location = useLocation()
  const type = useNavigationType()
  const marks = useRef(new Map<string, FocusMark>())
  const keyRef = useRef(location.key)
  keyRef.current = location.key

  useEffect(() => {
    if (!isTv) return
    const remember = () => {
      const mark = markFocus()
      if (mark) marks.current.set(keyRef.current, mark)
    }
    document.addEventListener('focusin', remember)
    return () => document.removeEventListener('focusin', remember)
  }, [])

  useEffect(() => {
    if (!isTv) return
    // The previous screen's control is gone; start this one fresh
    if (document.activeElement && document.activeElement !== document.body && !document.activeElement.isConnected) (document.activeElement as HTMLElement).blur()
    const mark = type === 'POP' ? marks.current.get(location.key) : undefined
    return mark ? restoreFocus(mark) : focusScreen()
    // `started`: past the welcome screen, Home needs its focus too
  }, [location.key, type, started])
}
