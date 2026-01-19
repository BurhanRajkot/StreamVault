import { useState, FormEvent } from 'react'
import {
  Film,
  Tv,
  Search,
  X,
  Heart,
  Download,
  LogOut,
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
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur-xl">
      {/* 🔥 MATCH HEADER WIDTH WITH MAIN CONTENT */}
      <div className="mx-auto w-full max-w-[1600px] px-4 sm:px-6 xl:px-10 2xl:max-w-[1800px] flex flex-col gap-3 py-3 sm:h-16 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:py-0">
        {/* Logo + Mobile Favorites */}
        <div className="flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-primary">
              <Film className="h-5 w-5 text-primary-foreground" />
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
        <nav className="flex items-center gap-1 overflow-x-auto rounded-lg bg-secondary/50 p-1 no-scrollbar">
          {modes.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => onModeChange(id)}
              className={cn(
                'flex shrink-0 items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-all',
                mode === id
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
              )}
            >
              <Icon className="h-4 w-4" />
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </nav>

        {/* Search */}
        {mode !== 'downloads' && (
          <form onSubmit={handleSubmit} className="relative flex w-full sm:w-auto">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder={`Search ${mode === 'tv' ? 'shows' : 'movies'}...`}
              className="h-11 w-full rounded-lg border bg-secondary/50 pl-10 pr-10 text-sm"
            />
            {(inputValue || searchQuery) && (
              <button
                type="button"
                onClick={handleClear}
                className="absolute right-3 top-1/2 -translate-y-1/2"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </form>
        )}

        {/* Desktop Favorites + Auth */}
        <div className="hidden sm:flex items-center gap-3">
          {isAuthenticated && (
            <Button asChild size="sm" variant="secondary">
              <Link to="/favorites" className="flex items-center gap-2">
                <Heart className="h-4 w-4 fill-red-500 text-red-500" />
                Favorites
              </Link>
            </Button>
          )}

          {!isAuthenticated && (
            <>
              <Button asChild size="sm" variant="secondary">
                <Link to="/login">Login</Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link to="/signup">Sign up</Link>
              </Button>
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
