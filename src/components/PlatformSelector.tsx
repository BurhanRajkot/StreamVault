import { useRef } from 'react'
import { cn } from '@/lib/utils'
import { OTT_PROVIDERS } from '@/lib/ottProviders'
import { MonitorPlay, Check, Sparkles } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

interface PlatformSelectorProps {
  selected: string | null
  onSelect: (id: string | null) => void
}

export function PlatformSelector({ selected, onSelect }: PlatformSelectorProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  return (
    <div className="w-full max-w-[1800px] mx-auto px-4 md:px-10 mb-4 mt-4">
       <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg md:text-xl font-bold text-white flex items-center gap-2">
            <div className="flex items-center justify-center p-1.5 rounded-lg bg-primary/10 border border-primary/20">
                <MonitorPlay className="w-4 h-4 text-primary" />
            </div>
            Stream By Provider
          </h2>
       </div>

      {/* Scrollable Container */}
      <div
        ref={scrollRef}
        className="flex md:flex-wrap items-center gap-3 md:gap-5 overflow-x-auto pb-4 pt-2 scrollbar-hide snap-x md:justify-start"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {/* All Button */}
        <motion.button
          onClick={() => onSelect(null)}
          className={cn(
            "relative flex-shrink-0 group cursor-pointer snap-start flex flex-col items-center gap-2 outline-none"
          )}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          <div
            className={cn(
              "relative h-12 w-12 md:h-16 md:w-16 rounded-2xl border transition-all duration-300 flex items-center justify-center overflow-hidden",
              selected === null
                ? "bg-gradient-to-br from-primary to-purple-600 border-white/20 shadow-[0_0_20px_-5px_theme(colors.primary.DEFAULT)]"
                : "bg-zinc-900/40 border-white/5 group-hover:bg-zinc-800"
            )}
          >
            {selected === null && (
                 <motion.div
                    layoutId="active-glow"
                    className="absolute inset-0 bg-white/20 blur-xl"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                 />
            )}

            <span className={cn(
                "text-sm md:text-lg font-bold text-white tracking-widest uppercase z-10",
                selected === null ? "scale-110" : "scale-100"
            )}>ALL</span>

             {/* Decorative shine for All button */}
             {selected === null && (
                <motion.div
                    initial={{ x: '-100%' }}
                    animate={{ x: '100%' }}
                    transition={{ repeat: Infinity, duration: 3, ease: 'linear' }}
                    className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent skew-x-12"
                />
             )}
          </div>

          <div className="flex flex-col items-center gap-1">
              <span className={cn(
                "text-[10px] md:text-xs font-bold tracking-wide transition-colors uppercase",
                selected === null ? "text-white" : "text-muted-foreground group-hover:text-white"
              )}>
                All Content
              </span>
              {selected === null && (
                  <motion.div layoutId="active-dot" className="w-1 h-1 rounded-full bg-primary" />
              )}
          </div>
        </motion.button>

        {/* Separator for desktop */}
        <div className="hidden md:block w-px h-12 bg-gradient-to-b from-transparent via-white/10 to-transparent mx-1" />

        {/* Provider Buttons */}
            {OTT_PROVIDERS.map((provider) => {
                const isSelected = selected === provider.id;
                return (
                  <motion.button
                    key={provider.id}
                    onClick={() => onSelect(isSelected ? null : provider.id)}
                    className={cn(
                      "relative flex-shrink-0 group cursor-pointer snap-start flex flex-col items-center gap-2 outline-none"
                    )}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    <div
                      className={cn(
                        "relative h-12 w-12 md:h-16 md:w-16 rounded-2xl border transition-all duration-300 flex items-center justify-center overflow-hidden bg-zinc-900/40 backdrop-blur-sm",
                        isSelected
                            ? cn("border-transparent shadow-lg", provider.color.replace('hover:', '')) // Active styling
                            : "border-white/5 group-hover:border-white/10 group-hover:bg-zinc-800"
                      )}
                    >
                       {/* Active Glow Background */}
                       {isSelected && (
                            <div className={cn("absolute inset-0 opacity-20", provider.color.split(" ")[0].replace('hover:shadow-', 'bg-'))} />
                       )}

                      <img
                        src={provider.logo}
                        alt={provider.displayName}
                        className={cn(
                            "h-full w-full object-contain transition-transform duration-500 will-change-transform",
                            isSelected ? "scale-100" : "grayscale opacity-70 group-hover:grayscale-0 group-hover:opacity-100 group-hover:scale-110"
                        )}
                        onError={(e) => {
                            e.currentTarget.style.display = 'none';
                            e.currentTarget.parentElement?.classList.add('bg-zinc-800');
                        }}
                      />

                      {/* Checkmark */}
                      {isSelected && (
                          <motion.div
                            initial={{ scale: 0, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            className="absolute inset-0 bg-black/40 flex items-center justify-center backdrop-blur-[2px]"
                          >
                              <Check className="w-6 h-6 md:w-8 md:h-8 text-white drop-shadow-md" strokeWidth={3} />
                          </motion.div>
                      )}
                    </div>

                    <div className="flex flex-col items-center gap-1">
                        <span className={cn(
                            "text-[10px] md:text-xs font-semibold tracking-wide transition-colors max-w-[80px] truncate text-center",
                            isSelected ? "text-white" : "text-muted-foreground group-hover:text-white"
                        )}>
                            {provider.displayName}
                        </span>
                        {isSelected && (
                             <motion.div layoutId="active-dot" className="w-1 h-1 rounded-full bg-white" />
                        )}
                    </div>
                  </motion.button>
                );
            })}
      </div>
    </div>
  )
}
