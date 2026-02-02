
import { motion } from 'motion/react'
import { MediaMode } from '@/lib/config'
import { cn } from '@/lib/utils'
import { Film, Tv, Download } from 'lucide-react'

interface MediaTypeSwitcherProps {
  mode: MediaMode
  onModeChange: (mode: MediaMode) => void
}

export function MediaTypeSwitcher({ mode, onModeChange }: MediaTypeSwitcherProps) {
  const modes: { id: MediaMode; label: string; icon: React.ReactNode }[] = [
    {
      id: 'movie',
      label: 'Movies',
      icon: <Film className="w-4 h-4" />,
    },
    {
      id: 'tv',
      label: 'Series',
      icon: <Tv className="w-4 h-4" />,
    },
    {
      id: 'downloads',
      label: 'Downloads',
      icon: <Download className="w-4 h-4" />,
    },
  ]

  return (
    <div className="relative flex items-center p-1 bg-secondary/40 backdrop-blur-xl border border-white/5 rounded-full">
      {modes.map((m) => {
        const isActive = mode === m.id
        return (
          <button
            key={m.id}
            onClick={() => onModeChange(m.id)}
            className={cn(
              'relative z-10 flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors duration-200 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-primary',
              isActive ? 'text-white' : 'text-muted-foreground hover:text-white'
            )}
          >
            {isActive && (
              <motion.div
                layoutId="activeTab"
                className="absolute inset-0 bg-primary/20 border border-primary/30 rounded-full shadow-[0_0_20px_0_rgba(var(--primary),0.3)] backdrop-blur-md"
                initial={false}
                transition={{
                  type: 'spring',
                  stiffness: 400,
                  damping: 30,
                }}
              />
            )}
            <span className="relative z-10 flex items-center gap-2">
              {m.icon}
              {m.label}
            </span>
          </button>
        )
      })}
    </div>
  )
}
