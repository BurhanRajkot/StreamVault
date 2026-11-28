import { useEffect } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAuth0 } from '@auth0/auth0-react'
import { motion } from 'framer-motion'
import { ChevronLeft, Download, Search, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import { desktop } from '@app/native/platform'
import { useDownloads } from '@app/downloads/store'
import { useScrolled } from '@app/lib/hooks'
import { spring } from '@app/lib/motion'
import { Logo } from '@app/components/Logo'
import { WindowButtons } from '@app/components/shell/WindowControls'
import { BarBackdrop } from '@app/components/shell/BarBackdrop'

const LINKS = [
  { to: '/', label: 'Home' },
  { to: '/movies', label: 'Movies' },
  { to: '/tv', label: 'TV Shows' },
  { to: '/anime', label: 'Anime' },
  { to: '/documentaries', label: 'Documentaries' },
  { to: '/f1', label: 'F1' },
  { to: '/my-list', label: 'My List' },
]

/** A link's section is on screen: the F1 link stays lit on a race and its sessions. */
function isCurrent(to: string, pathname: string): boolean {
  return to === '/f1' ? pathname === '/f1' || pathname.startsWith('/f1/') : pathname === to
}

/**
 * The wide layout's top bar — and, in the Linux app, the window's title bar:
 * it drags the window, double-click maximizes, and it carries the window
 * buttons. Clear over a hero, frosted glass once the page scrolls under it.
 */
export function TitleBar() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const scrolled = useScrolled(16)
  const { user, isAuthenticated } = useAuth0()
  const active = useDownloads().filter((d) => d.status === 'downloading').length
  const canGoBack = (window.history.state as { idx?: number } | null)?.idx ? !LINKS.some((l) => l.to === pathname) : false
  const solid = scrolled || !/^\/(movies|tv|anime|documentaries|title\/.*)?$/.test(pathname)

  // Ctrl+K or "/" jumps to search from anywhere
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement
      if ((e.key === 'k' && (e.ctrlKey || e.metaKey)) || (e.key === '/' && !typing)) {
        e.preventDefault()
        navigate('/search')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [navigate])

  return (
    <header
      className="drag fixed inset-x-0 top-0 z-50 hidden h-[var(--topbar-h)] items-center gap-1.5 pl-4 pr-2 xl:gap-2 xl:pl-5 lg:flex"
      onDoubleClick={(e) => {
        if (e.target === e.currentTarget) void desktop?.windowControl?.('maximize')
      }}
    >
      <BarBackdrop solid={solid} />
      <motion.button
        initial={false}
        animate={{ width: canGoBack ? 36 : 0, opacity: canGoBack ? 1 : 0, marginRight: canGoBack ? 4 : 0 }}
        transition={spring}
        onClick={() => navigate(-1)}
        aria-label="Back"
        tabIndex={canGoBack ? 0 : -1}
        className="glass-button flex h-8 shrink-0 items-center justify-center overflow-hidden rounded-full text-white"
      >
        <ChevronLeft className="-ml-0.5 h-5 w-5 shrink-0" strokeWidth={2.4} />
      </motion.button>

      <Link to="/" className="mr-2 shrink-0 xl:mr-6" aria-label="StreamVault home">
        <Logo />
      </Link>

      <nav aria-label="Main" className="flex min-w-0 items-center gap-0.5 xl:gap-1">
        {LINKS.map((link) => {
          const isActive = isCurrent(link.to, pathname)
          return (
            <NavLink
              key={link.to}
              to={link.to}
              className={cn(
                'relative shrink-0 whitespace-nowrap rounded-full px-2.5 py-[7px] text-[13.5px] font-medium transition-colors xl:px-3.5 xl:text-[14px]',
                isActive ? 'text-white' : 'text-white/65 hover:text-white'
              )}
            >
              {isActive && <motion.span layoutId="topbar-pill" transition={spring} className="absolute inset-0 -z-10 rounded-full bg-white/[0.13]" />}
              {link.label}
            </NavLink>
          )
        })}
      </nav>

      <div className="drag h-full min-w-6 flex-1" />

      <button
        onClick={() => navigate('/search')}
        aria-label="Search"
        title="Search (Ctrl K)"
        className={cn(
          'group flex h-9 w-9 shrink-0 items-center justify-center gap-2 rounded-full bg-fill text-[14px] text-label-2 transition-colors hover:bg-[rgb(118_118_128/0.32)] xl:w-[240px] xl:justify-start xl:px-3.5 2xl:w-[300px]',
          pathname === '/search' && 'text-white/80'
        )}
      >
        <Search className="h-4 w-4 shrink-0" strokeWidth={2.2} />
        <span className="hidden flex-1 text-left xl:inline">Search</span>
        <kbd className="hidden font-sans text-[12px] text-label-3 xl:inline">Ctrl K</kbd>
      </button>

      <IconLink to="/downloads" label="Downloads" active={pathname === '/downloads'}>
        <Download className="h-[18px] w-[18px]" />
        {active > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-ios-red px-1 text-[10px] font-semibold text-white">
            {active}
          </span>
        )}
      </IconLink>
      <IconLink to="/premium" label="Premium" active={pathname === '/premium'}>
        <Zap className="h-[18px] w-[18px] text-ios-yellow" />
      </IconLink>
      <Link
        to="/me"
        aria-label="My Space"
        className={cn(
          'ml-1.5 flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full ring-2 transition-shadow',
          pathname === '/me' ? 'ring-tint' : 'ring-transparent hover:ring-white/25'
        )}
      >
        {isAuthenticated && user?.picture ? (
          <img src={user.picture} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center bg-ios-gray text-[13px] font-semibold">
            {(user?.name ?? 'You').slice(0, 1).toUpperCase()}
          </span>
        )}
      </Link>

      {desktop?.frameless && <WindowButtons className="ml-2 pl-1 xl:ml-3" />}
    </header>
  )
}

function IconLink({ to, label, active, children }: { to: string; label: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      aria-label={label}
      title={label}
      className={cn(
        'relative ml-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors',
        active ? 'bg-white/[0.13] text-white' : 'text-white/70 hover:bg-white/10 hover:text-white'
      )}
    >
      {children}
    </Link>
  )
}
