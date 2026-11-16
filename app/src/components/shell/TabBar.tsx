import { NavLink, useLocation } from 'react-router-dom'
import { useAuth0 } from '@auth0/auth0-react'
import { motion } from 'framer-motion'
import { Download, Home, Search, User, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useDownloads } from '@app/downloads/store'
import { useHideOnScroll } from '@app/lib/hooks'
import { spring } from '@app/lib/motion'

const HOME_PATHS = ['/', '/movies', '/tv', '/anime', '/documentaries']

interface Tab {
  to: string
  label: string
  icon: LucideIcon
  match: (path: string) => boolean
}

const TABS: Tab[] = [
  { to: '/', label: 'Home', icon: Home, match: (p) => HOME_PATHS.includes(p) || p.startsWith('/title') },
  { to: '/search', label: 'Search', icon: Search, match: (p) => p === '/search' },
  { to: '/downloads', label: 'Downloads', icon: Download, match: (p) => p === '/downloads' },
  { to: '/me', label: 'My Space', icon: User, match: (p) => ['/me', '/my-list', '/premium', '/admin'].includes(p) },
]

/** The phone's tab bar: a floating glass pill that slips away while you scroll down a page. */
export function TabBar() {
  const { pathname } = useLocation()
  const { user, isAuthenticated } = useAuth0()
  const hidden = useHideOnScroll()
  const active = useDownloads().filter((d) => d.status === 'downloading').length

  return (
    <motion.nav
      aria-label="Main"
      initial={false}
      animate={{ y: hidden ? 'calc(100% + 40px)' : 0, opacity: hidden ? 0.4 : 1 }}
      transition={spring}
      className="fixed inset-x-3 bottom-[calc(var(--sab)+10px)] z-40 mx-auto max-w-md lg:hidden"
    >
      <div className="glass-strong flex h-[var(--tabbar-h)] items-stretch rounded-[24px] px-1.5">
        {TABS.map((tab) => {
          const isActive = tab.match(pathname)
          const Icon = tab.icon
          return (
            <NavLink
              key={tab.to}
              to={tab.to}
              replace={HOME_PATHS.includes(pathname) && tab.to === '/'}
              className="relative flex flex-1 flex-col items-center justify-center gap-1"
            >
              {isActive && (
                <motion.span layoutId="tab-pill" transition={spring} className="absolute inset-x-1 inset-y-1.5 rounded-[18px] bg-white/[0.09] shadow-[inset_0_0_0_1px_hsl(0_0%_100%/0.08)]" />
              )}
              <motion.span
                animate={{ scale: isActive ? 1.08 : 1, y: isActive ? -1 : 0 }}
                transition={spring}
                className={cn('relative transition-colors', isActive ? 'text-white' : 'text-white/45')}
              >
                {tab.to === '/me' && isAuthenticated && user?.picture ? (
                  <img
                    src={user.picture}
                    alt=""
                    className={cn('h-[23px] w-[23px] rounded-full object-cover', isActive ? 'ring-2 ring-primary' : 'opacity-70')}
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <Icon className="h-[23px] w-[23px]" strokeWidth={isActive ? 2.3 : 1.8} />
                )}
                {tab.to === '/downloads' && active > 0 && (
                  <span className="absolute -right-2.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-white">
                    {active}
                  </span>
                )}
              </motion.span>
              <span className={cn('relative text-[10.5px] font-semibold tracking-wide transition-colors', isActive ? 'text-white' : 'text-white/45')}>
                {tab.label}
              </span>
            </NavLink>
          )
        })}
      </div>
    </motion.nav>
  )
}
