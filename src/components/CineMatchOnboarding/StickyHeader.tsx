import { FilmIcon } from './icons'

interface Props {
  selectedCount: number
  minSelections: number
  progress: number
}

export function StickyHeader({ selectedCount, minSelections, progress }: Props) {
  return (
    <header className="sticky top-0 z-40 bg-[#0a0a0a]/90 backdrop-blur-xl border-b border-white/5 px-5 py-3 sm:px-6 sm:py-4 flex items-center justify-between pt-safe">
      <div className="flex items-center gap-2.5 sm:gap-3">
        <div className="w-9 h-9 sm:w-10 sm:h-10 bg-blue-500 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20">
          <FilmIcon />
        </div>
        <div>
          <span className="text-lg sm:text-xl font-bold tracking-tight">CineMatch</span>
          <span className="hidden text-zinc-500 text-sm ml-2 font-medium sm:inline">by StreamVault</span>
        </div>
      </div>
      {/* Compact counter — the full progress rail needs width we don't have */}
      <span className="text-sm font-semibold tabular-nums text-zinc-400 sm:hidden">
        {selectedCount}/{minSelections}
      </span>
      <div className="hidden sm:flex items-center gap-3 text-sm font-medium text-zinc-400">
        <span>Taste Setup</span>
        <div className="w-28 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-500 rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className="text-zinc-500 tabular-nums">{selectedCount}/{minSelections}</span>
      </div>
    </header>
  )
}
