import { MediaMode } from '@/lib/config'
import { cn } from '@/lib/utils'

interface MediaTypeSwitcherProps {
  mode: MediaMode
  onModeChange: (mode: MediaMode) => void
}

export function MediaTypeSwitcher({ mode, onModeChange }: MediaTypeSwitcherProps) {
  const modes = [
    { id: 'home', label: 'Home' },
    { id: 'movie', label: 'Movies' },
    { id: 'tv', label: 'TV' },
    { id: 'documentary', label: 'Docs' },
    { id: 'downloads', label: 'Downloads' },
  ]

  return (
    <div className="flex items-center gap-1">
      {modes.map((m) => (
        <button
          key={m.id}
          onClick={() => onModeChange(m.id as MediaMode)}
          className={cn(
            "px-4 py-1.5 text-xs font-bold uppercase tracking-wider rounded-xs transition-all duration-200",
            mode === m.id 
              ? "bg-primary text-white shadow-sm" 
              : "text-muted-foreground hover:bg-secondary hover:text-foreground"
          )}
        >
          {m.label}
        </button>
      ))}
    </div>
  )
}
