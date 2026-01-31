import { Film, Tv, Download, Heart } from 'lucide-react'
import { MediaMode } from '@/lib/config'
import { cn } from '@/lib/utils'
import { Link, useLocation } from 'react-router-dom'

interface MobileNavProps {
  mode: MediaMode
  onModeChange: (mode: MediaMode) => void
}

export function MobileNav({ mode, onModeChange }: MobileNavProps) {
  const location = useLocation()
  const isFavorites = location.pathname === '/favorites'

  const navItems = [
    {
      id: 'movie',
      label: 'Movies',
      icon: Film,
      action: () => onModeChange('movie'),
      isActive: mode === 'movie' && !isFavorites,
    },
    {
      id: 'tv',
      label: 'Series',
      icon: Tv,
      action: () => onModeChange('tv'),
      isActive: mode === 'tv' && !isFavorites,
    },
    {
      id: 'downloads',
      label: 'Downloads',
      icon: Download,
      action: () => onModeChange('downloads'),
      isActive: mode === 'downloads' && !isFavorites,
    },
  ]

  return (
    <div className="fixed bottom-0 left-0 z-50 w-full sm:hidden">
      {/* Glassmorphism Background */}
      <div className="absolute inset-0 bg-background/80 backdrop-blur-xl border-t border-white/10" />

      <div className="relative flex items-center justify-around pb-4 pt-2 px-2">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={item.action}
            className={cn(
              'flex flex-col items-center gap-1 p-2 transition-all duration-300',
              item.isActive ? 'text-primary scale-110' : 'text-muted-foreground hover:text-white'
            )}
          >
            <div className={cn(
              "relative p-1.5 rounded-xl transition-all duration-300",
               item.isActive && "bg-primary/10"
            )}>
              <item.icon className={cn("h-5 w-5", item.isActive && "fill-current")} />
              {item.isActive && (
                <div className="absolute inset-0 bg-primary/20 blur-lg rounded-full" />
              )}
            </div>
            <span className="text-[10px] font-medium tracking-wide">{item.label}</span>
          </button>
        ))}

        {/* Favorites Link */}
        <Link
          to="/favorites"
          className={cn(
            'flex flex-col items-center gap-1 p-2 transition-all duration-300',
            isFavorites ? 'text-primary scale-110' : 'text-muted-foreground hover:text-white'
          )}
        >
          <div className={cn(
            "relative p-1.5 rounded-xl transition-all duration-300",
             isFavorites && "bg-primary/10"
          )}>
            <Heart className={cn("h-5 w-5", isFavorites && "fill-current")} />
             {isFavorites && (
                <div className="absolute inset-0 bg-primary/20 blur-lg rounded-full" />
              )}
          </div>
          <span className="text-[10px] font-medium tracking-wide">Favorites</span>
        </Link>
      </div>
    </div>
  )
}
