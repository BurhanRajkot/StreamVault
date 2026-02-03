import { useRef } from 'react'
import { cn } from '@/lib/utils'
import { OTT_PROVIDERS } from '@/lib/ottProviders'
import { MonitorPlay, Check } from 'lucide-react'

interface PlatformSelectorProps {
  selected: string | null
  onSelect: (id: string | null) => void
}

export function PlatformSelector({ selected, onSelect }: PlatformSelectorProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  return (
    <div className="w-full max-w-[1800px] mx-auto px-4 md:px-10 mb-8 mt-6">
       <div className="flex items-center justify-between mb-5">
          <h2 className="text-xl md:text-2xl font-bold text-white flex items-center gap-3">
            <div className="flex items-center justify-center p-1.5 rounded-lg bg-primary/10">
                <MonitorPlay className="w-5 h-5 text-primary" />
            </div>
            Stream By Provider
          </h2>
       </div>

      {/* Scrollable Container */}
      <div
        ref={scrollRef}
        className="flex md:flex-wrap items-center gap-4 md:gap-6 overflow-x-auto pb-4 pt-2 scrollbar-hide snap-x md:justify-start"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {/* All Button */}
        <button
          onClick={() => onSelect(null)}
          className={cn(
            "relative flex-shrink-0 group cursor-pointer snap-start flex flex-col items-center gap-3 transition-all duration-300",
             selected === null ? "scale-105" : "opacity-70 hover:opacity-100 hover:scale-105"
          )}
        >
          <div
            className={cn(
              "relative h-16 w-16 md:h-20 md:w-20 rounded-2xl border transition-all duration-500 flex items-center justify-center overflow-hidden",
              selected === null
                ? "bg-gradient-to-br from-primary to-purple-600 border-white/20 shadow-[0_0_30px_-5px_theme(colors.primary.DEFAULT)]"
                : "bg-zinc-900/50 border-white/5 hover:border-white/20 hover:bg-zinc-800"
            )}
          >
            <span className={cn(
                "text-base md:text-lg font-bold text-white tracking-wider",
                selected === null ? "scale-110" : "scale-100"
            )}>ALL</span>

            {/* Active Indicator Pulse */}
            {selected === null && (
                <div className="absolute inset-0 rounded-2xl ring-2 ring-white/20 animate-pulse" />
            )}
          </div>
          <span className={cn(
            "text-xs font-semibold tracking-wide uppercase transition-colors",
            selected === null ? "text-primary" : "text-muted-foreground"
          )}>
            All Content
          </span>
        </button>

        {/* Separator for desktop */}
        <div className="hidden md:block w-px h-12 bg-white/10 mx-2" />

        {/* Provider Buttons */}
        {OTT_PROVIDERS.map((provider) => {
            const isSelected = selected === provider.id;
            return (
              <button
                key={provider.id}
                onClick={() => onSelect(isSelected ? null : provider.id)}
                className={cn(
                  "relative flex-shrink-0 group cursor-pointer snap-start flex flex-col items-center gap-3 transition-all duration-300",
                  isSelected ? "scale-105 opacity-100" : "opacity-70 hover:opacity-100 hover:scale-105"
                )}
              >
                <div
                  className={cn(
                    "relative h-16 w-16 md:h-20 md:w-20 rounded-2xl border transition-all duration-500 flex items-center justify-center overflow-hidden bg-zinc-900/50 backdrop-blur-sm",
                    isSelected
                        ? cn("border-white/20 shadow-lg", provider.color.replace('hover:', '')) // Apply active glow
                        : "border-white/5 hover:border-white/20 hover:bg-zinc-800"
                  )}
                >
                  <img
                    src={provider.logo}
                    alt={provider.displayName}
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                    onError={(e) => {
                        e.currentTarget.style.display = 'none';
                        e.currentTarget.parentElement?.classList.add('bg-zinc-800');
                    }}
                  />

                  {/* Selected Checkmark Overlay */}
                  {isSelected && (
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center backdrop-blur-[1px] animate-in fade-in duration-200">
                          <Check className="w-8 h-8 text-white drop-shadow-md" />
                      </div>
                  )}
                </div>

                <span className={cn(
                    "text-xs font-semibold tracking-wide transition-colors max-w-[80px] truncate text-center",
                    isSelected ? "text-white" : "text-muted-foreground group-hover:text-white"
                )}>
                    {provider.displayName}
                </span>

                {/* Active Underline (Visual flair) */}
                <div className={cn(
                    "absolute -bottom-2 w-12 h-0.5 rounded-full transition-all duration-300",
                    isSelected ? "bg-primary opacity-100" : "bg-transparent opacity-0 w-0"
                )} />
              </button>
            );
        })}
      </div>
    </div>
  )
}
