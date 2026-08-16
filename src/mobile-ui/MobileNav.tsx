import { Download, Heart, Home, Search } from 'lucide-react'
import { MediaMode } from '@/lib/config'
import { cn } from '@/lib/utils'
import { Link, useLocation, useNavigate } from 'react-router-dom'

interface MobileNavProps {
  mode: MediaMode
  onModeChange: (mode: MediaMode) => void
  /** Opens the header search field. Omitted on pages that have no search. */
  onSearchOpen?: () => void
  searchOpen?: boolean
}

/**
 * Bottom tab bar (< md).
 *
 * Only destinations live here — Home, Search, Downloads, My List. Browsing
 * *categories* (Movies / TV / Docs) moved to the pill row in the header,
 * because six equal-weight targets across a 390px screen left every one of
 * them under the 44px minimum and read as a toolbar rather than navigation.
 */
export function MobileNav({ mode, onModeChange, onSearchOpen, searchOpen = false }: MobileNavProps) {
  const location = useLocation()
  const navigate = useNavigate()

  const isFavorites = location.pathname === '/favorites'
  const isDownloads = mode === 'downloads' && !isFavorites
  const isHome = !isFavorites && !isDownloads && !searchOpen

  /** `to` renders a real anchor — the rest stay buttons (they change state). */
  const tabs: Array<{
    id: string
    label: string
    icon: typeof Home
    isActive: boolean
    to?: string
    action?: () => void
  }> = [
    {
      id: 'home',
      label: 'Home',
      icon: Home,
      isActive: isHome,
      action: () => {
        onModeChange('home')
        window.scrollTo({ top: 0, behavior: 'smooth' })
      },
    },
    {
      id: 'search',
      label: 'Search',
      icon: Search,
      isActive: searchOpen,
      action: () => {
        if (onSearchOpen) onSearchOpen()
        // No search on this page — send the user to the one that has it
        else navigate('/', { state: { openSearch: true } })
      },
    },
    {
      id: 'downloads',
      label: 'Downloads',
      icon: Download,
      isActive: isDownloads,
      action: () => onModeChange('downloads'),
    },
    {
      id: 'favorites',
      label: 'My List',
      icon: Heart,
      isActive: isFavorites,
      to: '/favorites',
    },
  ]

  return (
    <nav
      aria-label="Mobile navigation"
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-border/40 bg-background/92 backdrop-blur-xl pb-safe md:hidden"
    >
      <div className="flex items-stretch justify-around px-1">
        {tabs.map((tab) => {
          const className = cn(
            'group relative flex min-h-[60px] flex-1 flex-col items-center justify-center gap-1 pt-1.5 pb-1',
            'tap-scale',
            tab.isActive ? 'text-primary' : 'text-muted-foreground'
          )

          const content = (
            <>
              {/* Active marker sits on the top edge so it reads as a tab, not a button */}
              <span
                className={cn(
                  'absolute top-0 h-[2.5px] w-10 rounded-full transition-opacity duration-200',
                  tab.isActive ? 'bg-primary opacity-100' : 'opacity-0'
                )}
              />
              <tab.icon
                className={cn('h-[22px] w-[22px] transition-transform duration-200', tab.isActive && 'scale-105')}
                strokeWidth={tab.isActive ? 2.4 : 2}
                fill={tab.isActive && (tab.id === 'favorites' || tab.id === 'home') ? 'currentColor' : 'none'}
              />
              <span className={cn('text-[10.5px] leading-none tracking-wide', tab.isActive ? 'font-semibold' : 'font-medium')}>
                {tab.label}
              </span>
            </>
          )

          return tab.to ? (
            <Link
              key={tab.id}
              to={tab.to}
              aria-current={tab.isActive ? 'page' : undefined}
              className={className}
            >
              {content}
            </Link>
          ) : (
            <button
              key={tab.id}
              type="button"
              onClick={tab.action}
              aria-current={tab.isActive ? 'page' : undefined}
              className={className}
            >
              {content}
            </button>
          )
        })}
      </div>
    </nav>
  )
}
