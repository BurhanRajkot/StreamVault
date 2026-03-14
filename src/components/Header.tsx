import { useState, FormEvent } from 'react'
import {
  Clapperboard,
  Tv,
  Search,
  X,
  Heart,
  Download,
  LogOut,
  Crown,
} from 'lucide-react'
import { MediaMode } from '@/lib/config'
import { cn } from '@/lib/utils'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { useAuth0 } from '@auth0/auth0-react'
import { MediaTypeSwitcher } from './MediaTypeSwitcher'
import { ThemeToggle } from './ThemeToggle'
import { DynamicSearchBar } from './search/DynamicSearchBar'
import { Media } from '@/lib/config'


interface HeaderProps {
  mode: MediaMode
  onModeChange: (mode: MediaMode) => void
  onSearch: (query: string) => void
  searchQuery: string
  onClearSearch: () => void
  onMediaSelect?: (media: Media) => void
  onLogoClick?: () => void
}

export function Header({
  mode,
  onModeChange,
  onSearch,
  searchQuery,
  onClearSearch,
  onMediaSelect,
  onLogoClick,
}: HeaderProps) {
  const { user, isAuthenticated, logout } = useAuth0()
  const initials =
    user?.name
      ?.split(' ')
      .map((n) => n[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || 'SV'

  return (
        <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur-2xl shadow-lg shadow-black/10 transition-colors">
          {/* MATCH HEADER WIDTH WITH MAIN CONTENT */}
          <div className="mx-auto w-full max-w-[1600px] px-2 sm:px-4 xl:px-8 2xl:max-w-[1800px] flex flex-col gap-2 py-2 sm:h-16 sm:flex-row sm:items-center sm:justify-between sm:gap-2 sm:py-0">
              {/* Logo + Mobile Favorites */}
              {/* Logo + Mobile Elements */}
              <div className="flex items-center justify-between w-full sm:w-auto">
                <Link
                  to="/"
                  onClick={(e) => {
                    if (onLogoClick) onLogoClick()
                    else onClearSearch()
                  }}
                  className="flex items-center gap-3 group hover-group"
                >
                  <div className="relative">
                    <div className="absolute inset-0 bg-gradient-primary rounded-xl blur-lg opacity-70 group-hover:opacity-100 transition-opacity duration-300" />
                    <div className="relative flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-primary shadow-xl group-hover:scale-110 transition-transform duration-300 hover-glow">
                      <Clapperboard className="h-6 w-6 text-white drop-shadow-md" />
                    </div>
                  </div>
                  <h1 className="hidden text-xl font-bold tracking-tight lg:block">
                    <span className="text-foreground">Stream</span>
                    <span className="text-primary">Vault</span>
                  </h1>
                </Link>

                {/* Mobile: Profile/Login (Left) */}
                <div className="sm:hidden flex items-center gap-3">
                    {isAuthenticated ? (
                         <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          aria-label="Open account menu"
                          className="inline-flex h-11 w-11 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        >
                          <Avatar className="h-10 w-10 border border-border/50 shadow-md">
                            <AvatarImage src={user?.picture} alt={user?.name || 'User avatar'} />
                            <AvatarFallback>{initials}</AvatarFallback>
                          </Avatar>
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="w-56">
                         <DropdownMenuLabel className="flex flex-col gap-1">
                          <span className="text-sm font-medium">{user?.name}</span>
                          <span className="text-xs text-muted-foreground">{user?.email}</span>
                        </DropdownMenuLabel>
                        <DropdownMenuSeparator />
                         <button
                          className="flex w-full items-center gap-2 px-2 py-1.5 text-sm text-destructive hover:bg-accent"
                          onClick={() => logout({ logoutParams: { returnTo: window.location.origin } })}
                        >
                          <LogOut className="h-4 w-4" />
                          Logout
                        </button>
                      </DropdownMenuContent>
                      </DropdownMenu>
                    ) : (
                         <Link to="/login">
                            <Button size="icon" variant="ghost" className="rounded-lg bg-white/5 hover:bg-white/10">
                                <span className="sr-only">Login</span>
                                <LogOut className="h-5 w-5 rotate-180" /> {/* Login Icon */}
                            </Button>
                        </Link>
                    )}
                </div>


                 {/* Mobile: Text Logo (Center) - Hidden now as main logo is visible */}
                 <div className="sm:hidden flex-1 flex justify-center hidden">
                    <span className="text-lg font-bold tracking-tight text-foreground">
                      StreamVault
                    </span>
                 </div>

                 {/* Mobile: Favorites (Right) */}
                  <div className="sm:hidden flex items-center gap-2">
                    <ThemeToggle />
                    {isAuthenticated && (
                        <Link
                        to="/favorites"
                        className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg p-2 active:scale-95 hover:bg-white/5 transition-colors"
                        >
                        <Heart className="h-6 w-6 fill-red-500 text-red-500" />
                        </Link>
                    )}
                  </div>
        </div>

              {/* Desktop Navigation - Switcher */}
            <div className="hidden md:flex justify-center flex-1">
                 <MediaTypeSwitcher mode={mode} onModeChange={onModeChange} />
            </div>

            {/* Mobile Logo (Prominent) */}
              {/* Mobile Logo Removed from here as it is integrated above */}   {/* Right Side: Search + Actions */}
              <div className="flex items-center gap-2 lg:gap-6">
                {/* Search */}
                {mode !== 'downloads' && (
                  <DynamicSearchBar
                    mode={mode}
                    onSearch={onSearch}
                    searchQuery={searchQuery}
                    onClearSearch={onClearSearch}
                    onMediaSelect={onMediaSelect}
                  />
                )}

                {/* Desktop Favorites + Pricing + Auth */}
                <div className="hidden sm:flex items-center gap-2 lg:gap-4">
                  <Link to="/pricing">
                    <Button size="sm" variant="outline" className="relative overflow-hidden border border-border/60 text-foreground hover:bg-secondary hover:border-border transition-[background-color,color,border-color,box-shadow,transform] duration-300 group hover:scale-105 active:scale-95 shadow-lg rounded-lg px-4">
                      <div className="absolute inset-0 bg-gradient-to-r from-golden-amber/0 via-golden-amber/20 to-golden-amber/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
                      <Crown className="h-3.5 w-3.5 mr-2 relative" />
                      <span className="relative font-bold text-xs uppercase tracking-wide">Upgrade</span>
                    </Button>
                  </Link>

                  <ThemeToggle />

                  {isAuthenticated && (
                    <Link to="/favorites">
                      <Button size="icon" variant="secondary" className="hover:scale-105 active:scale-95 transition-[background-color,color,border-color,box-shadow,transform] duration-200 shadow-md border border-border/50 rounded-full">
                        <Heart className="h-5 w-5 fill-coral-pink text-coral-pink" />
                        <span className="sr-only">Favorites</span>
                      </Button>
                    </Link>
                  )}

                  {!isAuthenticated && (
                    <>
                      <Link to="/login">
                        <Button size="sm" variant="ghost" className="hover:bg-secondary hover:text-foreground rounded-lg px-4 text-xs font-semibold uppercase tracking-wide">
                          Login
                        </Button>
                      </Link>
                      <Link to="/signup">
                        <Button size="sm" className="bg-gradient-primary text-white hover:opacity-90 hover:scale-105 active:scale-95 transition-[opacity,transform,box-shadow] duration-200 shadow-md shadow-deep-purple/20 font-bold rounded-lg px-5 text-xs uppercase tracking-wide">
                          Sign up
                        </Button>
                      </Link>
                    </>
                  )}

                  {isAuthenticated && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          aria-label="Open account menu"
                          className="ml-2 inline-flex h-11 w-11 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        >
                          <Avatar className="h-10 w-10 border border-border">
                            <AvatarImage src={user?.picture} alt={user?.name || 'User avatar'} />
                            <AvatarFallback>{initials}</AvatarFallback>
                          </Avatar>
                        </button>
                      </DropdownMenuTrigger>

                      <DropdownMenuContent align="end" className="w-56">
                        <DropdownMenuLabel className="flex flex-col gap-1">
                          <span className="text-sm font-medium">{user?.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {user?.email}
                          </span>
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
                  )}
                </div>
              </div>
      </div>
    </header>
  )
}
