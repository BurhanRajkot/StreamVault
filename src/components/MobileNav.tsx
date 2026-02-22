import { Film, Tv, Download, Heart, Home } from 'lucide-react'
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
      id: 'home',
      label: 'Home',
      icon: Home,
      action: () => onModeChange('home'),
      isActive: mode === 'home' && !isFavorites,
    },
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
      id: 'documentary',
      label: 'Docs',
      icon: Film,
      action: () => onModeChange('documentary'),
      isActive: mode === 'documentary' && !isFavorites,
    },
    {
      id: 'downloads',
      label: 'DLs',
      icon: Download,
      action: () => onModeChange('downloads'),
      isActive: mode === 'downloads' && !isFavorites,
    },
  ]

  return (
    <div className="fixed bottom-0 left-0 z-50 w-full sm:hidden pb-safe">
      {/* Glassmorphism Background - Darker and blurrier for "Premium" feel */}
      <div className="absolute inset-0 bg-[#181A20]/90 backdrop-blur-2xl border-t border-white/5" />

      {/* Nav Items Container - Optimized for touch */}
      <div className="relative flex items-center justify-around pb-2 pt-2 px-2">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={item.action}
            className="group relative flex flex-col items-center justify-center gap-1 min-w-[48px] min-h-[48px] p-2 active:scale-95 transition-transform"
          >
            {/* Active Indicator (Pill Shape behind icon) */}
             <div className={cn(
               "absolute top-0 h-[3px] w-8 rounded-full transition-all duration-300",
               item.isActive ? "bg-primary shadow-[0_0_10px_rgba(226,18,33,0.5)]" : "bg-transparent"
             )} />

            <div className={cn(
              "relative p-2.5 rounded-2xl transition-all duration-300",
               item.isActive ? "text-primary" : "text-gray-400 group-hover:text-white group-active:text-white"
            )}>
              <item.icon className={cn("h-6 w-6 transition-all duration-300", item.isActive && "fill-current scale-110")} />
            </div>
            <span className={cn(
              "text-[10px] font-medium tracking-wide transition-colors duration-300",
              item.isActive ? "text-primary" : "text-gray-500"
            )}>
              {item.label}
            </span>
          </button>
        ))}

        {/* Favorites Link - Optimized for touch */}
        <Link
          to="/favorites"
          className="group relative flex flex-col items-center justify-center gap-1 min-w-[48px] min-h-[48px] p-2 active:scale-95 transition-transform"
        >
           <div className={cn(
               "absolute top-0 h-[3px] w-8 rounded-full transition-all duration-300",
               isFavorites ? "bg-primary shadow-[0_0_10px_rgba(226,18,33,0.5)]" : "bg-transparent"
             )} />

          <div className={cn(
            "relative p-2.5 rounded-2xl transition-all duration-300",
            isFavorites ? "text-primary" : "text-gray-400 group-hover:text-white group-active:text-white"
          )}>
            <Heart className={cn("h-6 w-6 transition-all duration-300", isFavorites && "fill-current scale-110")} />
          </div>
           <span className={cn(
              "text-[10px] font-medium tracking-wide transition-colors duration-300",
              isFavorites ? "text-primary" : "text-gray-500"
            )}>
            Favorites
          </span>
        </Link>
      </div>
    </div>
  )
}
