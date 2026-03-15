import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Clapperboard, Crown, Heart, LogOut, Search, X } from 'lucide-react'
import { useAuth0 } from '@auth0/auth0-react'
import { Media, MediaMode } from '@/lib/config'
import { cn } from '@/lib/utils'
import { useIsMobile } from '@/hooks/use-mobile'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { ThemeToggle } from './ThemeToggle'

interface HeaderProps {
  mode: MediaMode
  onModeChange: (mode: MediaMode) => void
  onSearch: (query: string) => void
  searchQuery: string
  onClearSearch: () => void
  onMediaSelect?: (media: Media) => void
  onLogoClick?: () => void
}

const NAV_ITEMS: Array<{ label: string; value: MediaMode }> = [
  { label: 'Home', value: 'home' },
  { label: 'Movies', value: 'movie' },
  { label: 'TV Shows', value: 'tv' },
  { label: 'Docs', value: 'documentary' },
  { label: 'Downloads', value: 'downloads' },
]

export function Header({
  mode,
  onModeChange,
  onSearch,
  searchQuery,
  onClearSearch,
  onLogoClick,
}: HeaderProps) {
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)
  const isMobile = useIsMobile()
  const { user, isAuthenticated, logout } = useAuth0()

  const initials =
    user?.name
      ?.split(' ')
      .map((n) => n[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || 'SV'

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsSearchOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (searchQuery.trim().length > 0) {
      setIsSearchOpen(true)
    }
  }, [searchQuery])

  const handleLogoClick = () => {
    if (onLogoClick) {
      onLogoClick()
      return
    }
    onClearSearch()
    onModeChange('home')
  }

  const handleSearchToggle = () => {
    if (isSearchOpen && searchQuery.trim().length > 0) {
      onClearSearch()
    }
    setIsSearchOpen((prev) => !prev)
  }

  const headerSurfaceClass =
    'border-border/45 bg-gradient-to-b from-background/88 via-background/82 to-background/76 py-2 shadow-[0_10px_24px_rgba(2,6,23,0.22)] backdrop-blur-md'

  const mutedInteractiveClass = 'text-muted-foreground hover:text-foreground'

  const upgradeButtonClass =
    'h-9 rounded-full border-golden-amber/35 bg-golden-amber/10 px-3 text-[11px] font-semibold tracking-[0.02em] text-golden-amber/85 shadow-none transition-none hover:border-golden-amber/50 hover:bg-golden-amber/16 hover:text-golden-amber'

  return (
    <header
      className={cn(
        'fixed top-0 left-0 right-0 z-50 border-b',
        headerSurfaceClass
      )}
    >
      <div className="mx-auto flex w-full max-w-[1600px] items-center justify-between gap-3 px-3 sm:px-6 xl:px-8">
        <div>
          <Link
            to="/"
            onClick={handleLogoClick}
            className="group flex items-center gap-2.5"
          >
            <Clapperboard className="h-6 w-6 text-primary group-hover:text-accent" strokeWidth={2.5} />
            <span className="hidden text-xl font-bold tracking-tight text-foreground sm:block">
              Stream<span className="text-primary">Vault</span>
            </span>
          </Link>
        </div>

        <nav className="hidden items-center gap-1 md:flex">
          {NAV_ITEMS.map((item) => {
            const isActive = mode === item.value
            return (
              <button
                key={item.value}
                onClick={() => onModeChange(item.value)}
                className={cn(
                  'relative rounded-full px-4 py-2 text-sm font-medium',
                  isActive ? 'text-foreground' : mutedInteractiveClass
                )}
              >
                {isActive && (
                  <div
                    className="absolute inset-0 rounded-full bg-primary/15"
                  />
                )}
                <span className="relative z-10">{item.label}</span>
              </button>
            )
          })}
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          {mode !== 'downloads' && (
            <div ref={searchRef} className="relative flex items-center">
              <div
                className={cn(
                  'flex items-center overflow-hidden rounded-full border backdrop-blur-md',
                  isSearchOpen
                    ? 'border-slate-400/25 bg-slate-400/10'
                    : 'border-slate-400/12 bg-transparent',
                  isSearchOpen ? (isMobile ? 'w-40' : 'w-[220px]') : 'w-11'
                )}
              >
                {isSearchOpen && (
                  <input
                    type="text"
                    placeholder="Search titles..."
                    value={searchQuery}
                    onChange={(e) => onSearch(e.target.value)}
                    className="w-full bg-transparent py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
                    style={{ paddingLeft: '14px' }}
                    autoFocus
                  />
                )}

                <button
                  type="button"
                  onClick={handleSearchToggle}
                  className={cn(
                    'inline-flex h-11 w-11 items-center justify-center',
                    isSearchOpen ? 'text-foreground' : mutedInteractiveClass
                  )}
                  aria-label={isSearchOpen ? 'Close search' : 'Open search'}
                >
                  {isSearchOpen ? <X className="h-5 w-5" /> : <Search className="h-5 w-5" />}
                </button>
              </div>
            </div>
          )}

          <Link
            to="/favorites"
            className={cn(
              'hidden h-11 w-11 items-center justify-center rounded-full sm:inline-flex',
              'text-muted-foreground hover:text-coral-pink'
            )}
            aria-label="Favorites"
          >
            <Heart className="h-5 w-5" />
          </Link>

          <Link to="/pricing" className="hidden lg:block">
            <Button
              size="sm"
              variant="outline"
              className={cn(
                'flex items-center gap-1.5 focus-visible:ring-golden-amber/45 focus-visible:ring-offset-0',
                upgradeButtonClass
              )}
            >
              <Crown className="h-3.5 w-3.5" />
              Upgrade
            </Button>
          </Link>

          <ThemeToggle />

          {isAuthenticated ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  aria-label="Open account menu"
                  className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-border/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <Avatar className="h-9 w-9">
                    <AvatarImage src={user?.picture} alt={user?.name || 'User avatar'} />
                    <AvatarFallback>{initials}</AvatarFallback>
                  </Avatar>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="flex flex-col gap-1">
                  <span className="text-sm font-medium">{user?.name}</span>
                  <span className="text-xs text-muted-foreground">{user?.email}</span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <button
                  className="flex w-full items-center gap-2 px-2 py-1.5 text-sm text-destructive hover:bg-accent"
                  onClick={() =>
                    logout({
                      logoutParams: { returnTo: window.location.origin },
                    })
                  }
                >
                  <LogOut className="h-4 w-4" />
                  Logout
                </button>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <>
              <Link to="/login" className="hidden sm:block">
                <Button size="sm" variant="ghost" className="rounded-full px-4 transition-none">
                  Login
                </Button>
              </Link>
              <Link
                to="/login"
                className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-border/50 text-muted-foreground hover:text-foreground sm:hidden"
                aria-label="Login"
              >
                <LogOut className="h-4 w-4 rotate-180" />
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
