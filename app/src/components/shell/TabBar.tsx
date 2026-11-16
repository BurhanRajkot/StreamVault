import { NavLink, useLocation } from 'react-router-dom'
import { useAuth0 } from '@auth0/auth0-react'
import { motion } from 'framer-motion'
import { CircleUserRound, Download, House, Search, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useDownloads } from '@app/downloads/store'
import { useHideOnScroll } from '@app/lib/hooks'
import { softSpring, spring } from '@app/lib/motion'

const HOME_PATHS = ['/', '/movies', '/tv', '/anime', '/documentaries']

interface Tab {
  to: string
  label: string
  icon: LucideIcon
  match: (path: string) => boolean
}

const TABS: Tab[] = [
  { to: '/', label: 'Home', icon: House, match: (p) => HOME_PATHS.includes(p) || p.startsWith('/title') },
  { to: '/downloads', label: 'Downloads', icon: Download, match: (p) => p === '/downloads' },
  { to: '/me', label: 'My Space', icon: CircleUserRound, match: (p) => ['/me', '/my-list', '/premium', '/admin'].includes(p) },
]

/**
 * The phone's tab bar, after iOS 26: a floating glass capsule with the tabs,
 * and Search as its own round button beside it. It slips away while you
 * scroll down a page and comes back on the way up.
 */
export function TabBar() {
  const { pathname } = useLocation()
  const { user, isAuthenticated } = useAuth0()
  const hidden = useHideOnScroll()
  const active = useDownloads().filter((d) => d.status === 'downloading').length
  const searching = pathname === '/search'

  return (
    <motion.nav
      aria-label="Main"
      initial={false}
      animate={{ y: hidden ? 'calc(100% + 24px)' : 0 }}
      transition={softSpring}
      className="fixed inset-x-0 bottom-[calc(var(--sab)+10px)] z-40 mx-auto flex max-w-[460px] items-center gap-2.5 px-4 lg:hidden"
    >
      <div className="material-float flex h-[var(--tabbar-h)] min-w-0 flex-1 items-stretch rounded-full p-[5px]">
        {TABS.map((tab) => {
          const isActive = tab.match(pathname)
          const Icon = tab.icon
          return (
            <NavLink
              key={tab.to}
              to={tab.to}
              replace={HOME_PATHS.includes(pathname) && tab.to === '/'}
              className={cn('press relative flex flex-1 flex-col items-center justify-center gap-[3px] rounded-full', isActive ? 'text-tint' : 'text-white')}
            >
              {isActive && (
                <motion.span
                  layoutId="tab-lens"
                  transition={spring}
                  className="absolute inset-0 rounded-full bg-gradient-to-b from-white/[0.17] to-white/[0.07] shadow-[inset_0_0.5px_0_rgb(255_255_255/0.4),inset_0_0_0_0.5px_rgb(255_255_255/0.08),0_4px_14px_-6px_rgb(0_0_0/0.5)]"
                />
              )}
              <span className="relative">
                {tab.to === '/me' && isAuthenticated && user?.picture ? (
                  <img
                    src={user.picture}
                    alt=""
                    referrerPolicy="no-referrer"
                    className={cn('h-6 w-6 rounded-full object-cover', isActive && 'ring-[1.5px] ring-tint ring-offset-1 ring-offset-transparent')}
                  />
                ) : (
                  <Icon className="h-6 w-6" strokeWidth={isActive ? 2.2 : 1.8} />
                )}
                {tab.to === '/downloads' && active > 0 && (
                  <span className="absolute -right-2 -top-1 flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-ios-red px-1 text-[11px] font-semibold leading-none text-white">
                    {active}
                  </span>
                )}
              </span>
              <span className="relative text-[10px] font-semibold leading-none">{tab.label}</span>
            </NavLink>
          )
        })}
      </div>
      <NavLink
        to="/search"
        aria-label="Search"
        className={cn('material-float press flex h-[var(--tabbar-h)] w-[var(--tabbar-h)] shrink-0 items-center justify-center rounded-full', searching ? 'text-tint' : 'text-white')}
      >
        <Search className="h-[25px] w-[25px]" strokeWidth={searching ? 2.4 : 2} />
      </NavLink>
    </motion.nav>
  )
}
