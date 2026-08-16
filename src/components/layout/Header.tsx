import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Clapperboard, Crown, Heart, LogOut, Search, X } from 'lucide-react'
import { useAuth0 } from '@auth0/auth0-react'
import { MediaMode } from '@/lib/config'
import { cn } from '@/lib/utils'
import { useIsMobile } from '@/mobile-ui/use-mobile'
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
  onLogoClick?: () => void
  /**
   * Mobile search is owned by the page so the bottom tab bar can open it too.
   * Left uncontrolled (Favorites, Downloads) the header keeps its own state.
   */
  mobileSearchOpen?: boolean
  onMobileSearchOpenChange?: (open: boolean) => void
}

const NAV_ITEMS: Array<{ label: string; value: MediaMode }> = [
  { label: 'Home', value: 'home' },
  { label: 'Movies', value: 'movie' },
  { label: 'TV Shows', value: 'tv' },
  { label: 'Docs', value: 'documentary' },
  { label: 'Downloads', value: 'downloads' },
]

/** Category pills shown on mobile — Downloads lives in the bottom tab bar instead. */
const MOBILE_NAV_ITEMS: Array<{ label: string; value: MediaMode }> = [
  { label: 'Home', value: 'home' },
  { label: 'Movies', value: 'movie' },
  { label: 'TV Shows', value: 'tv' },
  { label: 'Docs', value: 'documentary' },
]

export function Header({
  mode,
  onModeChange,
  onSearch,
  searchQuery,
  onClearSearch,
  onLogoClick,
  mobileSearchOpen,
  onMobileSearchOpenChange,
}: HeaderProps) {
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)
  const isMobile = useIsMobile()
  const { user, isAuthenticated, logout } = useAuth0()

  // Mobile search state is controlled when the page passes it down.
  const [uncontrolledMobileSearch, setUncontrolledMobileSearch] = useState(false)
  const isMobileSearchOpen = mobileSearchOpen ?? uncontrolledMobileSearch
  const setMobileSearchOpen = (open: boolean) => {
    if (onMobileSearchOpenChange) onMobileSearchOpenChange(open)
    else setUncontrolledMobileSearch(open)
  }

  const mobileSearchInputRef = useRef<HTMLInputElement>(null)
  const pillsRef = useRef<HTMLDivElement>(null)

  // Auto-hide the mobile header on scroll-down, bring it back on scroll-up.
  // Phones have little vertical room; a 100px bar pinned over every scroll
  // costs a fifth of the screen for something needed only between browses.
  const [isHeaderHidden, setIsHeaderHidden] = useState(false)

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
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (isSearchOpen) {
        setIsSearchOpen(false)
        if (searchQuery.trim().length > 0) onClearSearch()
      }
      // Phones get keyboards too (external, or the on-screen "done" key).
      // Inlined rather than calling closeMobileSearch so this effect doesn't
      // have to re-subscribe on every render to keep the closure fresh.
      if (isMobileSearchOpen) {
        if (searchQuery.trim().length > 0) onClearSearch()
        if (onMobileSearchOpenChange) onMobileSearchOpenChange(false)
        else setUncontrolledMobileSearch(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isSearchOpen, isMobileSearchOpen, searchQuery, onClearSearch, onMobileSearchOpenChange])

  useEffect(() => {
    if (searchQuery.trim().length > 0) {
      setIsSearchOpen(true)
    }
  }, [searchQuery])

  // Focus the mobile field once it mounts (autoFocus alone is unreliable on iOS
  // when the element is revealed by a state change rather than a fresh mount).
  useEffect(() => {
    if (isMobileSearchOpen) {
      const id = window.setTimeout(() => mobileSearchInputRef.current?.focus(), 60)
      return () => window.clearTimeout(id)
    }
  }, [isMobileSearchOpen])

  // Search collapses the mobile header to one row. Publishing that as a data
  // attribute lets --sv-header-h shrink in CSS, so every page that offsets
  // itself from the header follows without prop-drilling the state.
  useEffect(() => {
    if (!isMobileSearchOpen) return
    document.documentElement.dataset.mobileSearch = 'open'
    return () => {
      delete document.documentElement.dataset.mobileSearch
    }
  }, [isMobileSearchOpen])

  useEffect(() => {
    if (!isMobile || isMobileSearchOpen) {
      setIsHeaderHidden(false)
      return
    }

    let lastY = window.scrollY
    let ticking = false

    const update = () => {
      const y = window.scrollY
      const delta = y - lastY

      // Ignore sub-pixel jitter and rubber-band scroll past the top
      if (Math.abs(delta) > 6 && y > 0) {
        setIsHeaderHidden(delta > 0 && y > 140)
        lastY = y
      } else if (y <= 0) {
        setIsHeaderHidden(false)
        lastY = y
      }
      ticking = false
    }

    const onScroll = () => {
      if (ticking) return
      ticking = true
      requestAnimationFrame(update)
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [isMobile, isMobileSearchOpen])

  // Keep the active category pill in view when the mode changes from elsewhere
  useEffect(() => {
    const active = pillsRef.current?.querySelector('[data-active="true"]')
    active?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' })
  }, [mode])

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

  const closeMobileSearch = () => {
    if (searchQuery.trim().length > 0) onClearSearch()
    setMobileSearchOpen(false)
  }

  const headerSurfaceClass =
    'border-border/45 bg-gradient-to-b from-background/88 via-background/82 to-background/76 shadow-[0_10px_24px_rgba(2,6,23,0.22)] backdrop-blur-md'

  const mutedInteractiveClass = 'text-muted-foreground hover:text-foreground'

  const upgradeButtonClass =
    'h-9 rounded-full border-golden-amber/35 bg-golden-amber/10 px-3 text-[11px] font-semibold tracking-[0.02em] text-golden-amber/85 shadow-none transition-none hover:border-golden-amber/50 hover:bg-golden-amber/16 hover:text-golden-amber'

  const accountMenu = (
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
  )

  return (
    <header
      className={cn(
        'fixed top-0 left-0 right-0 z-50 border-b',
        headerSurfaceClass,
        'transition-transform duration-300 ease-out will-change-transform',
        isHeaderHidden && '-translate-y-full'
      )}
    >
      {/* ══════════════════════════════════════════════════════════════
          DESKTOP (md+) — unchanged layout

          Only one of the two bars is mounted. Rendering both and hiding one
          with CSS leaves a full duplicate of every control in the DOM — every
          `first()` lookup (and every screen reader) hits the hidden copy.
          ══════════════════════════════════════════════════════════════ */}
      {!isMobile && (
        <div className="mx-auto hidden w-full max-w-[2560px] items-center justify-between gap-3 px-3 py-2 sm:px-6 md:flex xl:px-8 2xl:px-12 [@media(min-width:2000px)]:px-16">
          <div>
            <a
              href="/"
              onClick={handleLogoClick}
              className="group flex items-center gap-2.5"
            >
              <Clapperboard className="h-6 w-6 text-primary group-hover:text-accent" strokeWidth={2.5} />
              <span className="hidden text-xl font-bold tracking-tight text-foreground sm:block">
                Stream<span className="text-primary">Vault</span>
              </span>
            </a>
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
                    'flex items-center overflow-hidden rounded-full border backdrop-blur-md h-12',
                    isSearchOpen
                      ? 'border-slate-400/25 bg-slate-400/10'
                      : 'border-slate-400/12 bg-transparent',
                    isSearchOpen ? 'w-[220px]' : 'w-12'
                  )}
                >
                  {isSearchOpen && (
                    <input
                      type="text"
                      placeholder="Search titles..."
                      value={searchQuery}
                      onChange={(e) => onSearch(e.target.value)}
                      onPaste={(e) => {
                        const pasted = e.clipboardData.getData('text')
                        if (pasted.trim().length > 0) {
                          // Let the default paste happen first, then sync
                          setTimeout(() => onSearch((e.target as HTMLInputElement).value), 0)
                        }
                      }}
                      aria-label="Search movies and TV shows"
                      className="w-full bg-transparent py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
                      style={{ paddingLeft: '14px' }}
                      autoFocus
                    />
                  )}

                  <button
                    type="button"
                    onClick={handleSearchToggle}
                    className={cn(
                      'inline-flex h-12 w-12 items-center justify-center',
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
              accountMenu
            ) : (
              <div className="hidden items-center gap-2 sm:flex">
                <Link to="/login">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="rounded-full px-4 font-medium text-muted-foreground hover:bg-transparent hover:text-foreground"
                  >
                    Login
                  </Button>
                </Link>
                <Link to="/signup">
                  <Button
                    size="sm"
                    className="rounded-full bg-primary bg-none px-5 font-medium text-primary-foreground shadow-none transition-colors hover:bg-primary/90 hover:shadow-none hover:scale-100 active:scale-100"
                  >
                    Sign Up
                  </Button>
                </Link>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          MOBILE (< md) — brand bar + category pills, or search
          ══════════════════════════════════════════════════════════════ */}
      {isMobile && (
        <div className="px-safe pt-safe md:hidden">
          {isMobileSearchOpen ? (
            /* ── Search mode: the field takes the whole bar ── */
            <div className="flex h-14 items-center gap-2 px-2">
              <button
                type="button"
                onClick={closeMobileSearch}
                aria-label="Close search"
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground tap-scale"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>

              <div className="flex h-11 flex-1 items-center gap-2 rounded-full border border-border/60 bg-secondary/60 px-4">
                <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
                <input
                  ref={mobileSearchInputRef}
                  type="search"
                  inputMode="search"
                  enterKeyHint="search"
                  placeholder="Search movies, shows…"
                  value={searchQuery}
                  onChange={(e) => onSearch(e.target.value)}
                  aria-label="Search movies and TV shows"
                  className="w-full bg-transparent text-base text-foreground placeholder:text-muted-foreground focus:outline-none"
                />
                {searchQuery.length > 0 && (
                  <button
                    type="button"
                    onClick={() => onSearch('')}
                    aria-label="Clear search"
                    className="-mr-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          ) : (
            <>
              {/* ── Brand bar ── */}
              <div className="flex h-14 items-center justify-between gap-2 px-3">
                <a
                  href="/"
                  onClick={handleLogoClick}
                  className="flex min-w-0 items-center gap-2"
                  aria-label="StreamVault home"
                >
                  <Clapperboard className="h-6 w-6 shrink-0 text-primary" strokeWidth={2.5} />
                  <span className="truncate text-lg font-bold tracking-tight text-foreground">
                    Stream<span className="text-primary">Vault</span>
                  </span>
                </a>

                <div className="flex items-center gap-0.5">
                  {mode !== 'downloads' && (
                    <button
                      type="button"
                      onClick={() => setMobileSearchOpen(true)}
                      aria-label="Open search"
                      className="inline-flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground tap-scale"
                    >
                      <Search className="h-[22px] w-[22px]" />
                    </button>
                  )}

                  <ThemeToggle compact />

                  {isAuthenticated ? (
                    accountMenu
                  ) : (
                    <Link
                      to="/login"
                      className="ml-1 inline-flex h-9 items-center rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground tap-scale"
                    >
                      Sign in
                    </Link>
                  )}
                </div>
              </div>

              {/* ── Category pills ── */}
              <div
                ref={pillsRef}
                className="edge-row items-center gap-2 px-3 pb-2.5"
                role="tablist"
                aria-label="Browse categories"
              >
                {MOBILE_NAV_ITEMS.map((item) => {
                  const isActive = mode === item.value
                  return (
                    <button
                      key={item.value}
                      role="tab"
                      aria-selected={isActive}
                      data-active={isActive}
                      onClick={() => onModeChange(item.value)}
                      className={cn(
                        'h-9 shrink-0 rounded-full border px-4 text-[13px] font-semibold whitespace-nowrap tap-scale',
                        isActive
                          ? 'border-transparent bg-foreground text-background'
                          : 'border-border/60 bg-secondary/40 text-muted-foreground'
                      )}
                    >
                      {item.label}
                    </button>
                  )
                })}
              </div>
            </>
          )}
        </div>
      )}
    </header>
  )
}
