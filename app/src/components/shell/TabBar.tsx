import { NavLink, useLocation } from 'react-router-dom'
import { useAuth0 } from '@auth0/auth0-react'
import { CircleUserRound, Download, Flag, House, Search, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useDownloads } from '@app/downloads/store'

const HOME_PATHS = ['/', '/movies', '/tv', '/anime', '/documentaries']

interface Tab {
  to: string
  label: string
  icon: LucideIcon
  match: (path: string) => boolean
}

const TABS: Tab[] = [
  { to: '/', label: 'Home', icon: House, match: (p) => HOME_PATHS.includes(p) || p.startsWith('/title') },
  { to: '/search', label: 'Search', icon: Search, match: (p) => p === '/search' },
  { to: '/f1', label: 'F1', icon: Flag, match: (p) => p === '/f1' || p.startsWith('/f1/') },
  { to: '/downloads', label: 'Downloads', icon: Download, match: (p) => p === '/downloads' },
  { to: '/me', label: 'My Space', icon: CircleUserRound, match: (p) => ['/me', '/my-list', '/premium', '/admin', '/18plus'].includes(p) },
]

/**
 * The phone's tab bar: docked to the bottom edge, always there, the way
 * streaming apps keep it — five tabs, the current one bright.
 */
export function TabBar() {
  const { pathname } = useLocation()
  const { user, isAuthenticated } = useAuth0()
  const active = useDownloads().filter((d) => d.status === 'downloading').length

  return (
    <nav aria-label="Main" className="material-dock fixed inset-x-0 bottom-0 z-40 pb-[var(--sab)] lg:hidden">
      <div className="mx-auto flex h-[var(--tabbar-h)] max-w-[560px] items-stretch px-1">
        {TABS.map((tab) => {
          const isActive = tab.match(pathname)
          const Icon = tab.icon
          return (
            <NavLink
              key={tab.to}
              to={tab.to}
              replace={HOME_PATHS.includes(pathname) && tab.to === '/'}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'relative flex flex-1 flex-col items-center justify-center gap-[3px] transition-colors active:opacity-60',
                isActive ? 'text-white' : 'text-white/45'
              )}
            >
              <span className="relative">
                {tab.to === '/me' && isAuthenticated && user?.picture ? (
                  <img
                    src={user.picture}
                    alt=""
                    referrerPolicy="no-referrer"
                    className={cn('h-[23px] w-[23px] rounded-full object-cover', isActive ? 'ring-[1.5px] ring-white' : 'opacity-70')}
                  />
                ) : (
                  <Icon className="h-[23px] w-[23px]" strokeWidth={isActive ? 2.3 : 1.8} />
                )}
                {tab.to === '/downloads' && active > 0 && (
                  <span className="absolute -right-2 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-ios-red px-1 text-[10px] font-semibold leading-none text-white">
                    {active}
                  </span>
                )}
              </span>
              <span className="text-[10px] font-medium leading-none tracking-[0.01em]">{tab.label}</span>
            </NavLink>
          )
        })}
      </div>
    </nav>
  )
}
