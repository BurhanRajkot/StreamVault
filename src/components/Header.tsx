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
import Dock from './Dock'


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
  const modes = [
    {
      id: 'movie',
      label: 'Movies',
      icon: (
        <span className="text-sm font-semibold tracking-wide w-full h-full flex items-center justify-center">
            Movies
        </span>
      ),
      color: '217, 70, 239'
    },
    {
      id: 'tv',
      label: 'Series',
      icon: (
        <span className="text-sm font-semibold tracking-wide w-full h-full flex items-center justify-center">
            Series
        </span>
      ),
      color: '34, 197, 94'
    },
    {
      id: 'downloads',
      label: 'Downloads',
      icon: (
        <span className="text-sm font-semibold tracking-wide w-full h-full flex items-center justify-center">
            Downloads
        </span>
      ),
      color: '59, 130, 246'
    },
  ]


  const initials =
    user?.name
      ?.split(' ')
      .map((n) => n[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || 'SV'

  return (
        <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/85 backdrop-blur-2xl shadow-lg shadow-black/10 transition-all">
          {/* 🔥 MATCH HEADER WIDTH WITH MAIN CONTENT */}
          <div className="mx-auto w-full max-w-[1600px] px-4 sm:px-6 xl:px-10 2xl:max-w-[1800px] flex flex-col gap-3 py-3 sm:h-16 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:py-0">
              {/* Logo + Mobile Favorites */}
              <div className="flex items-center justify-between">
                <Link to="/" className="flex items-center gap-3 group sm:flex hidden">
                  <div className="relative">
                    <div className="absolute inset-0 bg-gradient-primary rounded-xl blur-lg opacity-70 group-hover:opacity-100 transition-all duration-300" />
                    <div className="relative flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-primary shadow-xl group-hover:scale-110 transition-all duration-300 hover-glow">
                      <Film className="h-6 w-6 text-white drop-shadow-md" />
                    </div>
                  </div>
                  <h1 className="hidden text-xl font-bold tracking-tight sm:block">
                    <span className="text-white">Stream</span>
                    <span className="text-primary">Vault</span>
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

              {/* Desktop Navigation - Dock */}
            <div className="hidden md:flex justify-center flex-1">
                 <Dock
                   items={modes.map(m => ({
                     icon: m.icon,
                     label: m.label,
                     color: m.color,
                     onClick: () => onModeChange(m.id as MediaMode)
                   }))}
                   activeItem={modes.findIndex(m => m.id === mode)}
                   panelHeight={60}
                   baseItemSize={100} // Width
                   magnification={130} // Expanded Width
                 />
            </div>

            {/* Mobile Logo (Prominent) */}
            <div className="md:hidden flex-1 flex justify-center">
                <span className="text-xl font-bold tracking-tight bg-gradient-to-r from-white to-white/70 bg-clip-text text-transparent">
                  StreamVault
                </span>
            </div>   {/* Right Side: Search + Actions */}
              <div className="flex items-center gap-6">
                {/* Search */}
                {mode !== 'downloads' && (
                  <form onSubmit={handleSubmit} className="relative flex w-full sm:w-auto group">
                    <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-all duration-300 group-focus-within:scale-110" />
                    <input
                      value={inputValue}
                      onChange={(e) => setInputValue(e.target.value)}
                      placeholder={`Search ${mode === 'tv' ? 'shows' : 'movies'}...`}
                      className="h-10 w-full sm:w-64 rounded-full border border-border/50 bg-secondary/60 backdrop-blur-xl pl-11 pr-4 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all duration-300 placeholder:text-muted-foreground/60"
                    />
                    {(inputValue || searchQuery) && (
                      <button
                        type="button"
                        onClick={handleClear}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground hover:scale-110 transition-all duration-200 active:scale-90"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </form>
                )}

                {/* Desktop Favorites + Pricing + Auth */}
                <div className="hidden sm:flex items-center gap-4">
                  <Link to="/pricing">
                    <Button size="sm" variant="outline" className="relative overflow-hidden border border-golden-amber/30 text-golden-amber hover:bg-golden-amber/15 hover:border-golden-amber/60 hover:text-golden-amber transition-all duration-300 group hover:scale-105 active:scale-95 shadow-lg hover:shadow-golden-amber/25 h-9 rounded-full px-4">
                      <div className="absolute inset-0 bg-gradient-to-r from-golden-amber/0 via-golden-amber/20 to-golden-amber/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
                      <Crown className="h-3.5 w-3.5 mr-2 relative" />
                      <span className="relative font-bold text-xs uppercase tracking-wide">Upgrade</span>
                    </Button>
                  </Link>

                  {isAuthenticated && (
                    <Link to="/favorites">
                      <Button size="sm" variant="secondary" className="hover:scale-105 active:scale-95 transition-all duration-200 font-semibold shadow-md border border-border/50 h-9 rounded-full px-4 text-xs uppercase tracking-wide">
                        <Heart className="h-3.5 w-3.5 mr-2 fill-coral-pink text-coral-pink" />
                        Favorites
                      </Button>
                    </Link>
                  )}

                  {!isAuthenticated && (
                    <>
                      <Link to="/login">
                        <Button size="sm" variant="ghost" className="hover:bg-secondary hover:text-foreground h-9 rounded-full px-4 text-xs font-semibold uppercase tracking-wide">
                          Login
                        </Button>
                      </Link>
                      <Link to="/signup">
                        <Button size="sm" className="bg-gradient-primary text-white hover:opacity-90 hover:scale-105 active:scale-95 transition-all duration-200 shadow-md shadow-deep-purple/20 font-bold h-9 rounded-full px-5 text-xs uppercase tracking-wide">
                          Sign up
                        </Button>
                      </Link>
                    </>
                  )}

                  {isAuthenticated && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="rounded-full focus:outline-none focus:ring-2 focus:ring-primary ml-2">
                          <Avatar className="h-8 w-8 border border-border">
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
      </div>
    </header>
  )
}
