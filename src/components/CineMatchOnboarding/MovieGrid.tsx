import { CheckIcon } from './icons'
import { CURATED_TITLES, POSTER_BASE, GENRE_COLORS } from './constants'

interface Props {
  selectedIds: number[]
  imgErrors: Set<number>
  loadedImgs: Set<number>
  onToggleSelection: (id: number) => void
  onImgError: (id: number) => void
  onImgLoad: (id: number) => void
}

export function MovieGrid({
  selectedIds,
  imgErrors,
  loadedImgs,
  onToggleSelection,
  onImgError,
  onImgLoad,
}: Props) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8 gap-3 sm:gap-4 px-6 pb-4">
      {CURATED_TITLES.map((title) => {
        const isSelected = selectedIds.includes(title.tmdbId)
        const hasImgError = imgErrors.has(title.tmdbId)
        const genreColor = GENRE_COLORS[title.genre] || 'bg-zinc-600/80'

        return (
          <button
            key={title.tmdbId}
            onClick={() => onToggleSelection(title.tmdbId)}
            className={[
              'relative group cursor-pointer aspect-[2/3] rounded-xl overflow-hidden bg-zinc-900 border-[2.5px] transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
              isSelected
                ? 'border-blue-500 shadow-[0_0_20px_rgba(59,130,246,0.3)] scale-[1.02]'
                : 'border-transparent hover:border-white/20 hover:scale-[1.01]',
            ].join(' ')}
            aria-label={`${isSelected ? 'Deselect' : 'Select'} ${title.title}`}
            aria-pressed={isSelected}
          >
            {/* Poster Image */}
            {hasImgError ? (
              <div className="w-full h-full bg-zinc-800 flex items-center justify-center p-4">
                <span className="text-zinc-400 text-xs text-center font-medium leading-tight">{title.title}</span>
              </div>
            ) : (
              <>
                {!loadedImgs.has(title.tmdbId) && (
                  <div className="absolute inset-0 bg-zinc-800 animate-pulse" />
                )}
                <img
                  src={`${POSTER_BASE}${title.posterPath}`}
                  alt={title.title}
                  loading="lazy"
                  decoding="async"
                  className={[
                    'w-full h-full object-cover transition-all duration-150',
                    !loadedImgs.has(title.tmdbId) ? 'opacity-0' : 'opacity-100',
                    isSelected ? 'scale-110 brightness-40' : 'group-hover:scale-105 group-hover:brightness-75',
                  ].join(' ')}
                  onError={() => onImgError(title.tmdbId)}
                  onLoad={() => onImgLoad(title.tmdbId)}
                />
              </>
            )}

            {/* Bottom gradient + title */}
            <div className={[
              'absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-[#0a0a0a]/95 via-[#0a0a0a]/40 to-transparent transition-all duration-150',
              isSelected ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100',
            ].join(' ')}>
              <p className="text-white font-bold text-xs sm:text-sm leading-tight">{title.title}</p>
              <span className={`inline-block mt-1 text-[10px] font-medium px-1.5 py-0.5 rounded-md text-white ${genreColor}`}>
                {title.genre}
              </span>
            </div>

            {/* Selection border overlay */}
            <div className={[
              'absolute inset-0 rounded-xl transition-colors duration-300 pointer-events-none',
              isSelected ? 'bg-blue-500/10' : '',
            ].join(' ')} />

            {/* Checkmark badge */}
            <div className={[
              'absolute top-2.5 right-2.5 w-7 h-7 bg-blue-500 rounded-full flex items-center justify-center shadow-lg shadow-blue-500/40 transition-all duration-150',
              isSelected ? 'scale-100 opacity-100' : 'scale-50 opacity-0',
            ].join(' ')}>
              <CheckIcon />
            </div>
          </button>
        )
      })}
    </div>
  )
}
