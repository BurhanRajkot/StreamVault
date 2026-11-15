import { lazy, Suspense, useEffect, useRef } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { useAuth0 } from '@auth0/auth0-react'
import { useQueryClient } from '@tanstack/react-query'
import { FavoritesProvider } from '@/context/FavoritesContext'
import { DislikesProvider } from '@/context/DislikesContext'
import { AccountSync } from '@/components/layout/AccountSync'
import { isAndroid } from '@app/native/platform'
import { useSettings } from '@app/lib/settings'
import { AppNav } from '@app/components/AppNav'
import { UpdateBanner } from '@app/components/UpdateBanner'
import { Welcome } from '@app/screens/Welcome'
import { HomeScreen } from '@app/screens/HomeScreen'

const TitleScreen = lazy(() => import('@app/screens/TitleScreen').then((m) => ({ default: m.TitleScreen })))
const PlayerScreen = lazy(() => import('@app/screens/PlayerScreen').then((m) => ({ default: m.PlayerScreen })))
const OfflinePlayerScreen = lazy(() => import('@app/screens/OfflinePlayerScreen').then((m) => ({ default: m.OfflinePlayerScreen })))
const SearchScreen = lazy(() => import('@app/screens/SearchScreen').then((m) => ({ default: m.SearchScreen })))
const DownloadsScreen = lazy(() => import('@app/screens/DownloadsScreen').then((m) => ({ default: m.DownloadsScreen })))
const ProfileScreen = lazy(() => import('@app/screens/ProfileScreen').then((m) => ({ default: m.ProfileScreen })))
const MyListScreen = lazy(() => import('@app/screens/MyListScreen').then((m) => ({ default: m.MyListScreen })))
const PremiumScreen = lazy(() => import('@app/screens/PremiumScreen').then((m) => ({ default: m.PremiumScreen })))
const AdminScreen = lazy(() => import('@app/screens/AdminScreen').then((m) => ({ default: m.AdminScreen })))

/** Screens that own the whole display — no tab bar. */
const FULLSCREEN = /^\/(watch|offline)\//

export function App() {
  const settings = useSettings()
  const location = useLocation()
  useAndroidBackButton()

  if (!settings.acceptedTerms) return <Welcome />

  const fullscreen = FULLSCREEN.test(location.pathname)
  return (
    <FavoritesProvider>
      <DislikesProvider>
        <AccountSync />
        <UserSwitchGuard />
        <div className="min-h-[100dvh] bg-background text-foreground lg:flex">
          {!fullscreen && <AppNav />}
          <main className="min-w-0 flex-1">
            {!fullscreen && <UpdateBanner />}
            <Suspense fallback={<div className="min-h-[100dvh]" />}>
              <Routes>
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
                <Route path="/title/:type/:id" element={<TitleScreen />} />
                <Route path="/watch/:type/:id" element={<PlayerScreen />} />
                <Route path="/offline/:id" element={<OfflinePlayerScreen />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </main>
        </div>
      </DislikesProvider>
    </FavoritesProvider>
  )
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
