import { useState, FormEvent } from 'react';
import { Film, Tv, Sparkles, Search, X } from 'lucide-react';
import { MediaMode } from '@/lib/config';
import { cn } from '@/lib/utils';
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/auth/AuthProvider"; // 👈 add this

interface HeaderProps {
  mode: MediaMode;
  onModeChange: (mode: MediaMode) => void;
  onSearch: (query: string) => void;
  searchQuery: string;
  onClearSearch: () => void;
}

export function Header({ mode, onModeChange, onSearch, searchQuery, onClearSearch }: HeaderProps) {
  const [inputValue, setInputValue] = useState('');

  // 👇 auth state
  const { user, logout } = useAuth();

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (inputValue.trim()) {
      onSearch(inputValue.trim());
    }
  };

  const handleClear = () => {
    setInputValue('');
    onClearSearch();
  };

  const modes: { id: MediaMode; label: string; icon: typeof Film }[] = [
    { id: 'movie', label: 'Movies', icon: Film },
    { id: 'tv', label: 'TV Shows', icon: Tv },
    { id: 'anime', label: 'Anime', icon: Sparkles },
  ];

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur-xl">
      <div className="container flex h-16 items-center justify-between gap-4">

        {/* Logo */}
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-primary">
            <Film className="h-5 w-5 text-primary-foreground" />
          </div>
          <h1 className="hidden text-xl font-bold tracking-tight sm:block">
            <span className="text-gradient">Stream</span>
            <span className="text-foreground">Vault</span>
          </h1>
        </div>

        {/* Mode Selector */}
        <nav className="flex items-center gap-1 rounded-lg bg-secondary/50 p-1">
          {modes.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => onModeChange(id)}
              className={cn(
                'flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-all duration-200',
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
        <form onSubmit={handleSubmit} className="relative flex items-center">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder={`Search ${mode === 'tv' ? 'shows' : mode}...`}
              className="h-10 w-40 rounded-lg border border-border bg-secondary/50 pl-10 pr-10 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary sm:w-64 transition-all"
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
          </div>
        </form>

        {/* AUTH UI (NEW) */}
        <div className="flex items-center gap-3">
          {!user && (
            <Button asChild size="sm" variant="secondary">
              <Link to="/login">Login</Link>
            </Button>
          )}

          {user && (
            <div className="flex items-center gap-3">
              {/* show logged in email */}
              <span className="hidden sm:block text-sm text-muted-foreground">
                {user.email}
              </span>

              <Button size="sm" variant="outline" onClick={logout}>
                Logout
              </Button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
