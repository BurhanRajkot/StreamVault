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
    <header className="sticky top-0 z-50 w-full bg-background/50 border-b border-border/10 py-3">
      <div className="mx-auto w-full max-w-[1600px] px-4 xl:px-8 2xl:max-w-[1800px] flex items-center justify-between gap-4">
        
        {/* Box 1: Logo */}
        <div className="flex bg-card border border-border px-4 py-2 rounded shadow-sm hover:border-primary/50 transition-colors group">
          <Link
            to="/"
            onClick={(e) => {
              if (onLogoClick) onLogoClick()
              else onClearSearch()
            }}
            className="flex items-center gap-3"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded bg-primary text-white">
              <Clapperboard className="h-5 w-5" />
            </div>
            <h1 className="hidden text-lg font-bold tracking-tight lg:block">
              <span className="text-foreground">Stream</span>
              <span className="text-primary">Vault</span>
            </h1>
          </Link>
        </div>

        {/* Box 2: Navigation Switcher */}
        <div className="hidden md:flex flex-1 justify-center">
          <div className="bg-card border border-border p-1 rounded shadow-sm">
            <MediaTypeSwitcher mode={mode} onModeChange={onModeChange} />
          </div>
        </div>

        {/* Box 3: Search + Actions */}
        <div className="flex items-center gap-3">
          {/* Search Box */}
          {mode !== 'downloads' && (
            <div className="bg-card border border-border p-1 rounded shadow-sm flex items-center">
              <DynamicSearchBar
                mode={mode}
                onSearch={onSearch}
                searchQuery={searchQuery}
                onClearSearch={onClearSearch}
                onMediaSelect={onMediaSelect}
              />
            </div>
          )}

          {/* Actions Box */}
          <div className="flex items-center gap-2 bg-card border border-border p-1.5 rounded shadow-sm">
            <div className="hidden sm:flex items-center gap-2">
              <Link to="/pricing">
                <Button size="sm" variant="outline" className="h-8 border-border hover:bg-secondary rounded px-3 text-xs font-bold uppercase tracking-wide">
                  <Crown className="h-3.5 w-3.5 mr-2" />
                  Upgrade
                </Button>
              </Link>

              <ThemeToggle />

              {isAuthenticated && (
                <Link to="/favorites">
                  <Button size="icon" variant="ghost" className="h-8 w-8 hover:bg-secondary rounded">
                    <Heart className="h-4.5 w-4.5 fill-coral-pink text-coral-pink" />
                    <span className="sr-only">Favorites</span>
                  </Button>
                </Link>
              )}

              {!isAuthenticated && (
                <>
                  <Link to="/login">
                    <Button size="sm" variant="ghost" className="h-8 hover:bg-secondary rounded px-3 text-xs font-medium">
                      Login
                    </Button>
                  </Link>
                  <Link to="/signup">
                    <Button size="sm" className="h-8 bg-primary text-white hover:opacity-90 rounded px-4 text-xs font-bold">
                      Sign up
                    </Button>
                  </Link>
                </>
              )}
            </div>

            {/* Auth Menu (Mobile & Desktop) */}
            {isAuthenticated && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    aria-label="Open account menu"
                    className="flex h-8 w-8 items-center justify-center rounded overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <Avatar className="h-8 w-8 rounded">
                      <AvatarImage src={user?.picture} alt={user?.name || 'User avatar'} />
                      <AvatarFallback className="rounded">{initials}</AvatarFallback>
                    </Avatar>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 mt-2">
                  <DropdownMenuLabel className="flex flex-col gap-1">
                    <span className="text-sm font-medium">{user?.name}</span>
                    <span className="text-xs text-muted-foreground">{user?.email}</span>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <button
                    className="flex w-full items-center gap-2 px-2 py-1.5 text-sm text-destructive hover:bg-accent rounded-sm"
                    onClick={() => logout({ logoutParams: { returnTo: window.location.origin } })}
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
