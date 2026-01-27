import { useState, FormEvent } from 'react'
import {
  Film,
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

interface HeaderProps {
  mode: MediaMode
  onModeChange: (mode: MediaMode) => void
  onSearch: (query: string) => void
  searchQuery: string
  onClearSearch: () => void
}

export function Header({
  mode,
  onModeChange,
  onSearch,
  searchQuery,
  onClearSearch,
}: HeaderProps) {
  const [inputValue, setInputValue] = useState('')
  const { user, isAuthenticated, logout } = useAuth0()

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (inputValue.trim()) onSearch(inputValue.trim())
  }

  const handleClear = () => {
    setInputValue('')
    onClearSearch()
  }

  const modes: { id: MediaMode; label: string; icon: any }[] = [
    { id: 'movie', label: 'Movies', icon: Film },
    { id: 'tv', label: 'TV Shows', icon: Tv },
    { id: 'downloads', label: 'Downloads', icon: Download },
  ]

  const initials =
    user?.name
      ?.split(' ')
      .map((n) => n[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || 'SV'

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur-2xl shadow-lg shadow-black/5">
      {/* 🔥 MATCH HEADER WIDTH WITH MAIN CONTENT */}
      <div className="mx-auto w-full max-w-[1600px] px-4 sm:px-6 xl:px-10 2xl:max-w-[1800px] flex flex-col gap-3 py-3 sm:h-16 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:py-0">
          {/* Logo + Mobile Favorites */}
          <div className="flex items-center justify-between">
            <Link to="/" className="flex items-center gap-3 group">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-primary rounded-lg blur opacity-50 group-hover:opacity-75 transition-opacity" />
                <div className="relative flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-primary shadow-lg group-hover:scale-105 transition-transform">
                  <Film className="h-5 w-5 text-white" />
                </div>
              </div>
              <h1 className="hidden text-xl font-bold tracking-tight sm:block">
                <span className="text-gradient">Stream</span>
                <span className="text-foreground">Vault</span>
              </h1>
            </Link>

          {isAuthenticated && (
            <Link
              to="/favorites"
              className="sm:hidden rounded-full p-2 active:scale-95"
            >
              <Heart className="h-5 w-5 fill-red-500 text-red-500" />
            </Link>
          )}
        </div>

          {/* Mode Selector */}
          <nav className="flex items-center gap-1 overflow-x-auto rounded-xl bg-secondary/80 p-1 no-scrollbar border border-border/50">
            {modes.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => onModeChange(id)}
                className={cn(
                  'flex shrink-0 items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-all duration-200',
                  mode === id
                    ? 'bg-gradient-primary text-white shadow-lg shadow-primary/25'
                    : 'text-muted-foreground hover:bg-secondary hover:text-foreground hover:scale-[1.02] active:scale-[0.98]'
                )}
              >
                <Icon className="h-4 w-4" />
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </nav>

          {/* Search */}
          {mode !== 'downloads' && (
            <form onSubmit={handleSubmit} className="relative flex w-full sm:w-auto group">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors" />
              <input
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder={`Search ${mode === 'tv' ? 'shows' : 'movies'}...`}
                className="h-11 w-full rounded-xl border border-border/50 bg-secondary/80 pl-10 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all"
              />
              {(inputValue || searchQuery) && (
                <button
                  type="button"
                  onClick={handleClear}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </form>
          )}

{/* Desktop Favorites + Pricing + Auth */}
            <div className="hidden sm:flex items-center gap-3">
              <Link to="/pricing">
                <Button size="sm" variant="outline" className="relative overflow-hidden border-violet-500/30 text-violet-400 hover:bg-violet-500/10 hover:border-violet-500/50 hover:text-violet-300 transition-all group">
                  <div className="absolute inset-0 bg-gradient-to-r from-violet-500/0 via-violet-500/10 to-violet-500/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
                  <Crown className="h-4 w-4 relative" />
                  <span className="relative">Upgrade</span>
                </Button>
              </Link>

              {isAuthenticated && (
                <Link to="/favorites">
                  <Button size="sm" variant="secondary" className="hover:scale-105 active:scale-95 transition-transform">
                    <Heart className="h-4 w-4 fill-red-500 text-red-500" />
                    Favorites
                  </Button>
                </Link>
              )}

            {!isAuthenticated && (
              <>
                <Link to="/login">
                  <Button size="sm" variant="secondary" className="hover:scale-105 active:scale-95 transition-transform">
                    Login
                  </Button>
                </Link>
                <Link to="/signup">
                  <Button size="sm" className="bg-gradient-primary text-white hover:opacity-90 hover:scale-105 active:scale-95 transition-all shadow-lg shadow-primary/25">
                    Sign up
                  </Button>
                </Link>
              </>
            )}

          {isAuthenticated && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="rounded-full focus:outline-none focus:ring-2 focus:ring-primary">
                  <Avatar className="h-9 w-9 border">
                    <AvatarImage src={user?.picture} />
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
    </header>
  )
}
