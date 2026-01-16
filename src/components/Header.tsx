import { useState, FormEvent } from 'react'
import { Film, Tv, Sparkles, Search, X, Heart } from 'lucide-react'
import { MediaMode } from '@/lib/config'
import { cn } from '@/lib/utils'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
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
    if (inputValue.trim()) {
      onSearch(inputValue.trim())
    }
  }

  const handleClear = () => {
    setInputValue('')
    onClearSearch()
  }

  const modes: { id: MediaMode; label: string; icon: typeof Film }[] = [
    { id: 'movie', label: 'Movies', icon: Film },
    { id: 'tv', label: 'TV Shows', icon: Tv },
    { id: 'anime', label: 'Anime', icon: Sparkles },
  ]

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur-xl">
      <div className="container flex flex-col gap-3 py-3 sm:h-16 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:py-0">
        {/* Logo */}
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

          {/* Mobile Favorites Shortcut */}
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
                'flex shrink-0 items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-all duration-200',
                'active:scale-95',
                mode === id
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
              )}
            >
              <Icon className="h-4 w-4" />
              <span className="hidden sm:inline">{label}</span>
              <span className="sm:hidden">{label.split(' ')[0]}</span>
            </button>
          ))}
        </nav>

        {/* Search */}
        <form
          onSubmit={handleSubmit}
          className="relative flex w-full items-center sm:w-auto"
        >
          <div className="relative w-full sm:w-auto">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder={`Search ${mode === 'tv' ? 'shows' : mode}...`}
              className="h-11 w-full rounded-lg border border-border bg-secondary/50 pl-10 pr-10 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary sm:h-10 sm:w-64 transition-all"
            />
            {(inputValue || searchQuery) && (
              <button
                type="button"
                onClick={handleClear}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors active:scale-90"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </form>

        {/* AUTH + FAVORITES (Desktop) */}
        <div className="hidden items-center gap-3 sm:flex">
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

          {isAuthenticated && user && (
            <>
              <Button asChild size="sm" variant="secondary">
                <Link to="/favorites" className="flex items-center gap-2">
                  <Heart className="h-4 w-4 fill-red-500 text-red-500" />
                  <span className="hidden sm:inline">Favorites</span>
                </Link>
              </Button>

              <span className="hidden sm:block text-sm text-muted-foreground">
                {user.email}
              </span>

              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  logout({
                    logoutParams: {
                      returnTo: window.location.origin,
                    },
                  })
                }
              >
                Logout
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
