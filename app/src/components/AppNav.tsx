import { NavLink, useLocation } from 'react-router-dom'
import { useAuth0 } from '@auth0/auth0-react'
import { Clapperboard, Download, Film, Heart, Home, Search, Sparkles, Tv, User, Zap, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useDownloads } from '@app/downloads/store'
import { Logo } from './Logo'

const HOME_PATHS = ['/', '/movies', '/tv', '/anime', '/documentaries']

interface Tab {
  to: string
  label: string
  icon: LucideIcon
  match?: (path: string) => boolean
}

const TABS: Tab[] = [
  { to: '/', label: 'Home', icon: Home, match: (p) => HOME_PATHS.includes(p) || p.startsWith('/title') },
  { to: '/search', label: 'Search', icon: Search },
  { to: '/downloads', label: 'Downloads', icon: Download },
  { to: '/me', label: 'My Space', icon: User, match: (p) => ['/me', '/my-list', '/premium', '/admin'].includes(p) },
]

const SIDEBAR: Tab[] = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/movies', label: 'Movies', icon: Film },
  { to: '/tv', label: 'TV Shows', icon: Tv },
  { to: '/anime', label: 'Anime', icon: Sparkles },
  { to: '/documentaries', label: 'Documentaries', icon: Clapperboard },
  { to: '/search', label: 'Search', icon: Search },
  { to: '/my-list', label: 'My List', icon: Heart },
  { to: '/downloads', label: 'Downloads', icon: Download },
  { to: '/premium', label: 'Premium', icon: Zap },
  { to: '/me', label: 'Account', icon: User },
]

/** Bottom tabs on a phone; a sidebar in a wide window (the Linux app). */
export function AppNav() {
  const { pathname } = useLocation()
  const { user, isAuthenticated } = useAuth0()
  const active = useDownloads().filter((d) => d.status === 'downloading').length

  return (
    <>
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-white/[0.06] bg-[#0a0a0c]/92 pb-safe backdrop-blur-xl lg:hidden"
      >
        <div className="mx-auto flex h-[var(--tabbar-h)] max-w-xl items-stretch">
          {TABS.map((tab) => {
            const isActive = tab.match ? tab.match(pathname) : pathname === tab.to
            const Icon = tab.icon
            return (
              <NavLink
                key={tab.to}
                to={tab.to}
                replace={HOME_PATHS.includes(pathname) && tab.to === '/'}
                className={cn(
                  'relative flex flex-1 flex-col items-center justify-center gap-1 text-[10.5px] font-medium tracking-wide transition-colors',
                  isActive ? 'text-white' : 'text-white/45'
                )}
              >
                {tab.to === '/me' && isAuthenticated && user?.picture ? (
                  <img
                    src={user.picture}
                    alt=""
                    className={cn('h-[22px] w-[22px] rounded-md object-cover', isActive ? 'ring-2 ring-white' : 'opacity-70')}
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <Icon className="h-[22px] w-[22px]" strokeWidth={isActive ? 2.4 : 1.8} />
                )}
                {tab.label}
                {tab.to === '/downloads' && active > 0 && (
                  <span className="absolute right-[calc(50%-18px)] top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-white">
                    {active}
                  </span>
                )}
              </NavLink>
            )
          })}
        </div>
      </nav>

      <aside className="sticky top-0 hidden h-[100dvh] w-[230px] shrink-0 flex-col border-r border-white/[0.06] bg-[#08080a] px-3 py-6 lg:flex">
        <div className="mb-8 px-3">
          <Logo />
        </div>
        <div className="flex flex-col gap-0.5">
          {SIDEBAR.map((item) => {
            const Icon = item.icon
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13.5px] font-medium transition-colors',
                    isActive ? 'bg-white/[0.08] text-white' : 'text-white/55 hover:bg-white/[0.04] hover:text-white'
                  )
                }
              >
                <Icon className="h-[18px] w-[18px]" />
                {item.label}
                {item.to === '/downloads' && active > 0 && (
                  <span className="ml-auto rounded-full bg-primary px-1.5 text-[10px] font-bold text-white">{active}</span>
                )}
              </NavLink>
            )
          })}
        </div>
      </aside>
    </>
  )
}
