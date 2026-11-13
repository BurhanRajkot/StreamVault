import { lazy, Suspense, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, Clapperboard, Crown, Film, Heart, Home, Search, Sparkles, Tv, Video, X, type LucideIcon } from 'lucide-react'
import { useAuth0 } from '@auth0/auth0-react'
import { MediaMode, MODE_PATHS } from '@/lib/config'
import { cn } from '@/lib/utils'
import { useIsMobile } from '@/hooks/useIsMobile'
import { ThemeToggle } from './ThemeToggle'
import { AccountMenuPlaceholder } from './AccountMenuPlaceholder'

const AccountMenu = lazy(() => import('./AccountMenu'))

interface HeaderProps {
  /** The browse tab on screen. Left out on pages that aren't one (Favorites), so no pill reads as current. */
  mode?: MediaMode
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

const NAV_ITEMS: Array<{ label: string; value: MediaMode; icon: LucideIcon }> = [
  { label: 'Home', value: 'home', icon: Home },
  { label: 'Movies', value: 'movie', icon: Film },
  { label: 'TV Shows', value: 'tv', icon: Tv },
  { label: 'Anime', value: 'anime', icon: Sparkles },
  { label: 'Docs', value: 'documentary', icon: Video },
]

/** Category pills shown on mobile — Downloads lives in the bottom tab bar instead. */
const MOBILE_NAV_ITEMS: Array<{ label: string; value: MediaMode }> = [
  { label: 'Home', value: 'home' },
  { label: 'Movies', value: 'movie' },
  { label: 'TV Shows', value: 'tv' },
  { label: 'Anime', value: 'anime' },
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
  const navigate = useNavigate()
  const { isAuthenticated } = useAuth0()

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
  // Past the top of the page the header gets a surface; at the top it sits
  // straight on the hero (dark theme), like movy's.
  const [isScrolled, setIsScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 24)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

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

  // The anchor keeps its href so the logo is a real, crawlable link that still
  // supports middle-click / open-in-new-tab. A plain left-click has to be
  // cancelled, though: letting it through triggers a full document load, which
  // throws away the router state these handlers just set (and the whole React
  // Query cache with it).
  const handleLogoClick = (event: ReactMouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
      return
    }
    event.preventDefault()

    if (onLogoClick) {
      onLogoClick()
      return
    }
    onClearSearch()
    onModeChange('home')
    navigate('/')
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

  // Light theme keeps a frosted bar throughout: its dark text can't sit on
  // the hero's artwork. Dark theme drops it at the top of the page.
  const atTop = !isScrolled && !isMobileSearchOpen
  const headerSurfaceClass = atTop
    ? 'bg-background/85 backdrop-blur-xl dark:bg-transparent dark:backdrop-blur-none'
    : 'bg-background/85 backdrop-blur-xl shadow-[0_1px_0_hsl(var(--border)/0.55)]'

  const navItemClass =
    'relative inline-flex h-10 items-center gap-2 whitespace-nowrap rounded-xl px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/60 xl:px-3.5'

  const iconButtonClass =
    'inline-flex h-10 w-10 items-center justify-center rounded-xl text-foreground/70 transition-colors hover:bg-foreground/[0.08] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/60'

  const accountMenu = (
    <Suspense fallback={<AccountMenuPlaceholder />}>
      <AccountMenu />
    </Suspense>
  )

  return (
    <header
      className={cn(
        'fixed top-0 left-0 right-0 z-50',
        headerSurfaceClass,
        'transition-[transform,background-color,box-shadow] duration-300 ease-out will-change-transform',
        isHeaderHidden && '-translate-y-full'
      )}
    >
      {/* At the top of the page (dark theme) the bar is a fade over the hero, not a surface */}
      <div
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute inset-x-0 top-0 -z-10 h-[140%] bg-gradient-to-b from-black/70 via-black/25 to-transparent opacity-0 transition-opacity duration-300',
          atTop && 'dark:opacity-100'
        )}
      />
      {/* ══════════════════════════════════════════════════════════════
          DESKTOP (md+) — logo left, one floating pill right (after movy.sx)

          Only one of the two bars is mounted. Rendering both and hiding one
          with CSS leaves a full duplicate of every control in the DOM — every
          `first()` lookup (and every screen reader) hits the hidden copy.
          ══════════════════════════════════════════════════════════════ */}
      {!isMobile && (
        <div className="hidden h-[var(--sv-header-h)] w-full items-center justify-between gap-4 px-[var(--sv-gutter)] md:flex">
          <a
            href="/"
            onClick={handleLogoClick}
            // Named outright: below lg the wordmark is hidden and the
            // icon alone would leave the link with no name
            aria-label="StreamVault"
            className="group flex shrink-0 items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/60"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-primary text-primary-foreground shadow-[0_6px_20px_-6px_hsl(var(--primary)/0.8)] transition-transform duration-300 group-hover:scale-105">
              <Clapperboard className="h-5 w-5" strokeWidth={2.5} />
            </span>
            <span className="hidden text-[1.35rem] font-extrabold tracking-[-0.03em] text-foreground lg:block">
              Stream<span className="text-primary">Vault</span>
            </span>
          </a>

          {/* One floating glass pill: sections, then search and account */}
          <div className="flex min-w-0 items-center gap-1 rounded-2xl bg-background/55 p-1.5 shadow-[0_10px_40px_-12px_rgba(0,0,0,0.55)] ring-1 ring-inset ring-foreground/[0.09] backdrop-blur-2xl">
            <nav aria-label="Browse" className="flex min-w-0 items-center gap-0.5">
              {NAV_ITEMS.map((item) => {
                const isActive = mode === item.value
                const Icon = item.icon
                return (
                  <Link
                    key={item.value}
                    to={MODE_PATHS[item.value]}
                    aria-current={isActive ? 'page' : undefined}
                    aria-label={item.label}
                    className={cn(
                      navItemClass,
                      isActive
                        ? 'bg-foreground/[0.12] text-foreground'
                        : 'text-foreground/65 hover:bg-foreground/[0.07] hover:text-foreground'
                    )}
                  >
                    <Icon className={cn('h-[18px] w-[18px] shrink-0', isActive && 'text-primary')} strokeWidth={2.1} aria-hidden="true" />
                    <span className="hidden lg:inline">{item.label}</span>
                  </Link>
                )
              })}
            </nav>

            <span className="mx-1 h-6 w-px shrink-0 bg-foreground/15" aria-hidden="true" />

            {mode !== 'downloads' && (
              <div ref={searchRef} className="relative flex items-center">
                <div
                  className={cn(
                    'flex h-10 items-center overflow-hidden rounded-xl transition-[width,background-color] duration-300 ease-out',
                    isSearchOpen ? 'w-[min(260px,24vw)] bg-foreground/[0.08] ring-1 ring-inset ring-foreground/15' : 'w-10'
                  )}
                >
                  {isSearchOpen && (
                    <input
                      type="text"
                      placeholder="Search titles…"
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
                      className="w-full min-w-0 bg-transparent py-2 pl-3.5 text-sm text-foreground placeholder:text-foreground/45 focus:outline-none"
                      autoFocus
                    />
                  )}

                  <button
                    type="button"
                    onClick={handleSearchToggle}
                    className={cn(iconButtonClass, 'shrink-0', isSearchOpen && 'text-foreground hover:bg-transparent')}
                    aria-label={isSearchOpen ? 'Close search' : 'Open search'}
                  >
                    {isSearchOpen ? <X className="h-[18px] w-[18px]" /> : <Search className="h-[18px] w-[18px]" />}
                  </button>
                </div>
              </div>
            )}

            <Link to="/favorites" className={cn(iconButtonClass, 'hover:text-primary')} aria-label="Favorites">
              <Heart className="h-[18px] w-[18px]" />
            </Link>

            <Link
              to="/pricing"
              aria-label="Upgrade"
              title="Upgrade"
              className={cn(iconButtonClass, 'hidden text-golden-amber/85 hover:bg-golden-amber/10 hover:text-golden-amber lg:inline-flex')}
            >
              <Crown className="h-[18px] w-[18px]" />
            </Link>

            <ThemeToggle compact />

            {isAuthenticated ? (
              <div className="pl-0.5">{accountMenu}</div>
            ) : (
              <div className="flex items-center gap-1 pl-0.5">
                <Link
                  to="/login"
                  className="inline-flex h-10 items-center rounded-xl px-3.5 text-sm font-medium text-foreground/75 transition-colors hover:bg-foreground/[0.07] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/60"
                >
                  Login
                </Link>
                {/* Below lg there is room for one: returning viewers sign in */}
                <Link
                  to="/signup"
                  className="hidden h-10 items-center rounded-xl bg-foreground px-4 text-sm font-semibold text-background transition-all hover:bg-foreground/85 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary lg:inline-flex"
                >
                  Sign Up
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

              <div className="flex h-11 flex-1 items-center gap-2 rounded-xl bg-foreground/[0.08] px-4 ring-1 ring-inset ring-foreground/10">
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
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-primary text-primary-foreground">
                    <Clapperboard className="h-[18px] w-[18px]" strokeWidth={2.5} />
                  </span>
                  <span className="truncate text-lg font-extrabold tracking-[-0.03em] text-foreground">
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

                  {/* No admin link here: on a 390px bar it pushed "Sign in"
                      onto two lines and cut the logo to "StreamVa…". The
                      desktop header keeps it; /admin/dashboard still works. */}
                  <ThemeToggle compact />

                  {isAuthenticated ? (
                    accountMenu
                  ) : (
                    <Link
                      to="/login"
                      className="ml-1 inline-flex h-9 shrink-0 items-center whitespace-nowrap rounded-lg bg-foreground px-4 text-sm font-semibold text-background tap-scale"
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
                        'h-9 shrink-0 rounded-full px-4 text-[13px] font-semibold whitespace-nowrap tap-scale transition-colors',
                        isActive
                          ? 'bg-foreground text-background'
                          : 'bg-foreground/[0.08] text-foreground/75 ring-1 ring-inset ring-foreground/10 backdrop-blur-md'
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
