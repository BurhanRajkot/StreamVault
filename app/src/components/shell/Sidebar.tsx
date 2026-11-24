import { useEffect } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAuth0 } from '@auth0/auth0-react'
import { Bookmark, ChevronLeft, Download, Film, Flag, House, Search, Sparkles, Telescope, Tv, Zap, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { desktop } from '@app/native/platform'
import { useDownloads } from '@app/downloads/store'
import { useScrolled } from '@app/lib/hooks'
import { Logo, LogoMark } from '@app/components/Logo'
import { WindowButtons } from '@app/components/shell/WindowControls'

interface Item {
  to: string
  label: string
  icon: LucideIcon
  match?: (path: string) => boolean
}

const BROWSE: Item[] = [
  { to: '/', label: 'Home', icon: House, match: (p) => p === '/' },
  { to: '/search', label: 'Search', icon: Search },
  { to: '/movies', label: 'Movies', icon: Film },
  { to: '/tv', label: 'TV Shows', icon: Tv },
  { to: '/anime', label: 'Anime', icon: Sparkles },
  { to: '/documentaries', label: 'Documentaries', icon: Telescope },
  { to: '/f1', label: 'Formula 1', icon: Flag, match: (p) => p === '/f1' || p.startsWith('/f1/') },
]

const LIBRARY: Item[] = [
  { to: '/my-list', label: 'My List', icon: Bookmark },
  { to: '/downloads', label: 'Downloads', icon: Download },
]

/** Pages the sidebar leads to: no back button on them, you got there from the sidebar. */
const ROOTS = new Set(['/', '/search', '/movies', '/tv', '/anime', '/documentaries', '/f1', '/my-list', '/downloads', '/premium', '/me'])

/**
 * The wide layout's navigation, as a desktop app has it: a sidebar on the
 * left (icons only in a smaller window), the page beside it. In the
 * frameless Linux/Windows window its top edge drags the window.
 */
export function Sidebar() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { user, isAuthenticated } = useAuth0()
  const active = useDownloads().filter((d) => d.status === 'downloading').length

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

  const name = isAuthenticated ? user?.given_name || user?.name || user?.nickname || 'You' : 'Sign in'

  return (
    <aside className="fixed inset-y-0 left-0 z-50 hidden w-[var(--sidebar-w)] flex-col bg-[#09090b] shadow-[inset_calc(-1*var(--hairline))_0_0_rgb(255_255_255/0.07)] lg:flex">
      <div
        className="drag flex h-[68px] shrink-0 items-center px-[22px] xl:px-6"
        onDoubleClick={(e) => {
          if (e.target === e.currentTarget) void desktop?.windowControl?.('maximize')
        }}
      >
        <Link to="/" aria-label="StreamVault home" className="flex items-center">
          <Logo className="hidden xl:flex" />
          <LogoMark className="h-8 w-8 xl:hidden" />
        </Link>
      </div>

      <nav aria-label="Main" className="no-scrollbar flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-3 pb-4 xl:px-4">
        {BROWSE.map((item) => (
          <SideLink key={item.to} item={item} pathname={pathname} trailing={item.to === '/search' ? <kbd className="font-sans text-[11px] text-white/30">Ctrl K</kbd> : undefined} />
        ))}
        <p className="mb-1.5 mt-6 hidden px-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-white/35 xl:block">Library</p>
        <div className="my-4 h-px bg-white/[0.07] xl:hidden" />
        {LIBRARY.map((item) => (
          <SideLink
            key={item.to}
            item={item}
            pathname={pathname}
            badge={item.to === '/downloads' && active > 0 ? active : undefined}
          />
        ))}
      </nav>

      <div className="shrink-0 space-y-0.5 px-3 pb-4 pt-2 xl:px-4">
        <SideLink item={{ to: '/premium', label: 'Premium', icon: Zap }} pathname={pathname} iconClass="text-[#ffd60a]" />
        <NavLink
          to="/me"
          title="My Space"
          className={({ isActive }) =>
            cn(
              'flex h-12 items-center gap-3 rounded-[12px] px-2 transition-colors max-xl:justify-center',
              isActive || ['/admin'].includes(pathname) ? 'bg-white/[0.09]' : 'hover:bg-white/[0.05]'
            )
          }
        >
          {isAuthenticated && user?.picture ? (
            <img src={user.picture} alt="" referrerPolicy="no-referrer" className="h-8 w-8 shrink-0 rounded-full object-cover" />
          ) : (
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/[0.12] text-[13px] font-semibold text-white/90">
              {(isAuthenticated ? name : 'S').slice(0, 1).toUpperCase()}
            </span>
          )}
          <span className="hidden min-w-0 flex-1 xl:block">
            <span className="block truncate text-[14px] font-semibold text-white">{name}</span>
            <span className="block truncate text-[12px] text-white/45">My Space</span>
          </span>
        </NavLink>
      </div>
    </aside>
  )
}

function SideLink({ item, pathname, trailing, badge, iconClass }: { item: Item; pathname: string; trailing?: React.ReactNode; badge?: number; iconClass?: string }) {
  const isActive = item.match ? item.match(pathname) : pathname === item.to
  const Icon = item.icon
  return (
    <Link
      to={item.to}
      title={item.label}
      aria-current={isActive ? 'page' : undefined}
      className={cn(
        'group relative flex h-10 shrink-0 items-center gap-3 rounded-[10px] px-3 text-[14px] font-medium transition-colors max-xl:justify-center',
        isActive ? 'bg-white/[0.09] text-white' : 'text-white/55 hover:bg-white/[0.05] hover:text-white'
      )}
    >
      <span className="relative">
        <Icon className={cn('h-[19px] w-[19px] shrink-0', iconClass)} strokeWidth={isActive ? 2.3 : 1.9} />
        {badge !== undefined && (
          <span className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#ff453a] px-1 text-[10px] font-semibold text-white">{badge}</span>
        )}
      </span>
      <span className="hidden flex-1 truncate xl:block">{item.label}</span>
      {trailing && <span className="hidden xl:block">{trailing}</span>}
    </Link>
  )
}

/**
 * The wide layout's top edge, beside the sidebar: back on pages below the
 * sidebar's, and in the frameless window the drag area and window buttons.
 * Clear over artwork, a frosted bar once the page scrolls under it.
 */
export function TopStrip() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const scrolled = useScrolled(24)
  const canGoBack = !ROOTS.has(pathname) && !!(window.history.state as { idx?: number } | null)?.idx
  const frameless = !!desktop?.frameless
  if (!canGoBack && !frameless) return null

  return (
    <div
      className={cn(
        'drag fixed right-0 top-0 z-40 hidden h-[var(--topbar-h)] items-center gap-2 px-4 transition-[background-color,box-shadow,backdrop-filter] duration-300 lg:flex',
        scrolled ? 'material-bar' : 'bg-gradient-to-b from-black/50 to-transparent'
      )}
      style={{ left: 'var(--sidebar-w)' }}
      onDoubleClick={(e) => {
        if (e.target === e.currentTarget) void desktop?.windowControl?.('maximize')
      }}
    >
      {canGoBack && (
        <button
          onClick={() => navigate(-1)}
          aria-label="Back"
          title="Back"
          className="glass-button flex h-8 w-8 items-center justify-center rounded-full text-white transition-transform active:scale-95"
        >
          <ChevronLeft className="-ml-0.5 h-5 w-5" strokeWidth={2.4} />
        </button>
      )}
      <div className="drag h-full flex-1" />
      {frameless && <WindowButtons />}
    </div>
  )
}
