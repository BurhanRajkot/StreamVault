import { useRef } from 'react'
import { cn } from '@/lib/utils'
import { OTT_PROVIDERS } from '@/lib/ottProviders'

interface PlatformSelectorProps {
  selected: string | null
  onSelect: (id: string | null) => void
}

export function PlatformSelector({ selected, onSelect }: PlatformSelectorProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  return (
    <div className="relative group w-full max-w-[1800px] mx-auto px-4 md:px-10 mb-8 mt-4">
       <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <span className="w-1 h-6 bg-primary rounded-full" />
            Browse by Provider
          </h2>
       </div>

      {/* Scrollable Container */}
      <div
        ref={scrollRef}
        className="flex gap-6 overflow-x-auto pb-4 pt-2 scrollbar-hide snap-x"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {/* All Button */}
        <div
          onClick={() => onSelect(null)}
          className={cn(
            "flex-shrink-0 cursor-pointer snap-start flex flex-col items-center gap-3 transition-all duration-300 active:scale-95",
            selected === null ? "scale-110" : "opacity-60 hover:opacity-100 hover:scale-105"
          )}
        >
          <div
            className={cn(
              "relative h-14 w-14 md:h-16 md:w-16 rounded-full border-2 overflow-hidden transition-all duration-300 shadow-lg bg-gradient-to-br from-primary/20 to-purple-600/20 flex items-center justify-center backdrop-blur-sm",
              selected === null
                ? "border-primary shadow-xl shadow-primary/30 ring-2 ring-primary/50"
                : "border-border/50"
            )}
          >
            <span className="text-sm font-bold text-white">All</span>
          </div>
          <span className={cn(
            "text-xs font-medium transition-colors",
            selected === null ? "text-white" : "text-muted-foreground"
          )}>
            All
          </span>
        </div>

        {/* Provider Buttons */}
        {OTT_PROVIDERS.map((provider) => (
          <div
            key={provider.id}
            onClick={() => onSelect(selected === provider.id ? null : provider.id)}
            className={cn(
              "flex-shrink-0 cursor-pointer snap-start flex flex-col items-center gap-3 transition-all duration-300 group/item active:scale-95",
              selected === provider.id ? "scale-110" : "opacity-60 hover:opacity-100 hover:scale-105"
            )}
          >
            <div
              className={cn(
                "relative h-14 w-14 md:h-16 md:w-16 rounded-full border-2 overflow-hidden transition-all duration-300 shadow-lg bg-white/5 flex items-center justify-center",
                provider.color,
                selected === provider.id ? "border-current shadow-xl shadow-current/30" : "border-transparent"
              )}
            >
              <img
                src={provider.logo}
                alt={provider.displayName}
                className="h-full w-full object-contain p-2"
                onError={(e) => {
                    const target = e.currentTarget;
                    const parent = target.parentElement;
                    target.style.display = 'none';
                    if (parent) {
                        parent.classList.add('bg-zinc-800');
                        // Create and append text node if it doesn't exist
                        if (!parent.querySelector('.fallback-text')) {
                            const span = document.createElement('span');
                            span.className = 'fallback-text text-white font-bold text-xs';
                            span.innerText = provider.displayName.slice(0, 2);
                            parent.appendChild(span);
                        }
                    }
                }}
              />
            </div>
            <span className={cn(
                "text-xs font-medium transition-colors",
                selected === provider.id ? "text-white" : "text-muted-foreground group-hover/item:text-white"
            )}>
                {provider.displayName}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
