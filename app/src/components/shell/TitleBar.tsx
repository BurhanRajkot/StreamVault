import { useEffect } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAuth0 } from '@auth0/auth0-react'
import { motion } from 'framer-motion'
import { ArrowLeft, Copy, Download, Minus, Search, Square, X, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import { desktop } from '@app/native/platform'
import { useDownloads } from '@app/downloads/store'
import { useScrolled, useWindowState } from '@app/lib/hooks'
import { spring } from '@app/lib/motion'
import { Logo } from '@app/components/Logo'

const LINKS = [
  { to: '/', label: 'Home' },
  { to: '/movies', label: 'Movies' },
  { to: '/tv', label: 'TV Shows' },
  { to: '/anime', label: 'Anime' },
  { to: '/documentaries', label: 'Documentaries' },
  { to: '/my-list', label: 'My List' },
]

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
      className={cn(
        'drag fixed inset-x-0 top-0 z-50 hidden h-[var(--topbar-h)] items-center gap-2 pl-5 pr-2 transition-[background-color,box-shadow,backdrop-filter] duration-500 lg:flex',
        solid ? 'glass-strong !shadow-[inset_0_-1px_0_hsl(0_0%_100%/0.06)]' : 'bg-gradient-to-b from-black/70 via-black/25 to-transparent'
      )}
      onDoubleClick={(e) => {
        if (e.target === e.currentTarget) void desktop?.windowControl?.('maximize')
      }}
    >
      <motion.button
        initial={false}
        animate={{ width: canGoBack ? 36 : 0, opacity: canGoBack ? 1 : 0, marginRight: canGoBack ? 4 : 0 }}
        transition={spring}
        onClick={() => navigate(-1)}
        aria-label="Back"
        tabIndex={canGoBack ? 0 : -1}
        className="flex h-9 shrink-0 items-center justify-center overflow-hidden rounded-full text-white/80 hover:bg-white/10 hover:text-white"
      >
        <ArrowLeft className="h-5 w-5 shrink-0" />
      </motion.button>

      <Link to="/" className="mr-6 shrink-0" aria-label="StreamVault home">
        <Logo />
      </Link>

      <nav aria-label="Main" className="flex items-center gap-1">
        {LINKS.map((link) => {
          const isActive = pathname === link.to
          return (
            <NavLink
              key={link.to}
              to={link.to}
              className={cn(
                'relative rounded-full px-3.5 py-1.5 text-[13.5px] font-semibold transition-colors',
                isActive ? 'text-white' : 'text-white/60 hover:text-white'
              )}
            >
              {isActive && (
                <motion.span layoutId="topbar-pill" transition={spring} className="absolute inset-0 -z-10 rounded-full bg-white/[0.12] shadow-[inset_0_0_0_1px_hsl(0_0%_100%/0.1)]" />
              )}
              {link.label}
            </NavLink>
          )
        })}
      </nav>

      <div className="drag h-full min-w-6 flex-1" />

      <button
        onClick={() => navigate('/search')}
        className={cn(
          'group flex h-9 w-[240px] shrink-0 items-center gap-2 rounded-full bg-white/[0.07] px-3.5 text-[13px] text-white/50 ring-1 ring-white/[0.08] transition-all hover:bg-white/[0.11] hover:text-white/80 xl:w-[300px]',
          pathname === '/search' && 'bg-white/[0.12] text-white/80 ring-primary/40'
        )}
      >
        <Search className="h-4 w-4" />
        <span className="flex-1 text-left">Search titles, people…</span>
        <kbd className="rounded-md bg-white/10 px-1.5 py-0.5 font-sans text-[10.5px] font-semibold text-white/50">Ctrl K</kbd>
      </button>

      <IconLink to="/downloads" label="Downloads" active={pathname === '/downloads'}>
        <Download className="h-[18px] w-[18px]" />
        {active > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-white">
            {active}
          </span>
        )}
      </IconLink>
      <IconLink to="/premium" label="Premium" active={pathname === '/premium'}>
        <Zap className="h-[18px] w-[18px] text-amber-300" />
      </IconLink>
      <Link
        to="/me"
        aria-label="My Space"
        className={cn(
          'ml-1 flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full ring-2 transition-all hover:scale-105',
          pathname === '/me' ? 'ring-primary' : 'ring-white/15 hover:ring-white/40'
        )}
      >
        {isAuthenticated && user?.picture ? (
          <img src={user.picture} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center bg-primary text-[13px] font-bold">
            {(user?.name ?? 'You').slice(0, 1).toUpperCase()}
          </span>
        )}
      </Link>

      {desktop?.frameless && <WindowButtons />}
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
        active ? 'bg-white/[0.14] text-white' : 'text-white/70 hover:bg-white/10 hover:text-white'
      )}
    >
      {children}
    </Link>
  )
}

/** Minimize, maximize/restore, close — the frameless window's own. */
function WindowButtons() {
  const { maximized } = useWindowState()
  const control = (action: 'minimize' | 'maximize' | 'close') => void desktop?.windowControl?.(action)
  const base = 'flex h-8 w-10 items-center justify-center rounded-lg text-white/60 transition-colors hover:text-white'
  return (
    <div className="ml-3 flex items-center gap-0.5 border-l border-white/10 pl-2">
      <button onClick={() => control('minimize')} aria-label="Minimize" className={cn(base, 'hover:bg-white/10')}>
        <Minus className="h-4 w-4" />
      </button>
      <button onClick={() => control('maximize')} aria-label={maximized ? 'Restore' : 'Maximize'} className={cn(base, 'hover:bg-white/10')}>
        {maximized ? <Copy className="h-3.5 w-3.5 -scale-x-100" /> : <Square className="h-3.5 w-3.5" />}
      </button>
      <button onClick={() => control('close')} aria-label="Close" className={cn(base, 'hover:bg-red-500/90')}>
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
