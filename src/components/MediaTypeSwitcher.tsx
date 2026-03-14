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
    { id: 'tv', label: 'Series' },
    { id: 'documentary', label: 'Docs' },
    { id: 'downloads', label: 'Downloads' },
  ]

  return (
    <div className="flex items-center gap-1.5 p-1 bg-black/20 backdrop-blur-md rounded-lg border border-white/10">
      {modes.map((m) => (
        <button
          key={m.id}
          onClick={() => onModeChange(m.id as MediaMode)}
          className={cn(
            "px-4 py-1.5 text-xs font-bold uppercase tracking-wider rounded transition-all duration-200",
            mode === m.id 
              ? "bg-white text-primary shadow-lg scale-105" 
              : "text-white/70 hover:bg-white/10 hover:text-white"
          )}
        >
          {m.label}
        </button>
      ))}
    </div>
  )
}
