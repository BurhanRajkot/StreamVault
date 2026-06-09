interface Props {
  selectedCount: number
  minSelections: number
  isReady: boolean
  isSubmitting: boolean
  progress: number
  onContinue: () => void
}

export function BottomActionBar({
  selectedCount,
  minSelections,
  isReady,
  isSubmitting,
  progress,
  onContinue,
}: Props) {
  return (
    <div className={[
      'fixed bottom-0 left-0 right-0 z-50 p-4 sm:p-6 transition-all duration-500',
      selectedCount > 0 ? 'opacity-100' : 'opacity-60',
    ].join(' ')}>
      <div className="max-w-4xl mx-auto bg-zinc-900/95 backdrop-blur-xl border border-white/10 p-4 sm:p-5 rounded-2xl flex items-center justify-between shadow-2xl shadow-black/50">
        {/* Count + Progress */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-8 flex-1">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-zinc-800 border border-white/10 flex items-center justify-center text-xl font-bold text-white tabular-nums">
              {selectedCount}
            </div>
            <div className="text-sm text-zinc-400 leading-tight font-medium">
              titles<br />selected
            </div>
          </div>

          <div className="hidden sm:block w-px h-10 bg-white/10" />

          <div className="flex-1 max-w-sm w-full">
            <div className="flex justify-between text-xs font-medium mb-2">
              <span className="text-zinc-300">
                {isReady
                  ? '✓ Awesome taste! Ready to continue.'
                  : `Select ${minSelections - selectedCount} more to continue`}
              </span>
              <span className="text-zinc-500 tabular-nums">{selectedCount}/{minSelections}</span>
            </div>
            <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-all duration-500 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>

        {/* Continue Button */}
        <button
          onClick={onContinue}
          disabled={!isReady || isSubmitting}
          className={[
            'relative overflow-hidden ml-4 flex items-center gap-2 px-6 sm:px-8 py-3.5 rounded-xl font-bold transition-all shrink-0',
            isReady
              ? 'bg-blue-500 hover:bg-blue-400 text-white shadow-[0_0_24px_rgba(59,130,246,0.35)] hover:shadow-[0_0_36px_rgba(59,130,246,0.55)] active:scale-95'
              : 'bg-zinc-800 text-zinc-500 cursor-not-allowed',
          ].join(' ')}
        >
          {/* Shine sweep */}
          {isReady && !isSubmitting && (
            <div
              className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent"
              style={{ animation: 'shineSweep 2.5s linear infinite 1s' }}
            />
          )}

          <span className="relative z-10 flex items-center gap-2">
            {isSubmitting ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                Let&apos;s go
                <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 18l6-6-6-6" />
                </svg>
              </>
            )}
          </span>
        </button>
      </div>
      <style>{`
        @keyframes shineSweep {
          from { transform: translateX(-100%); }
          to   { transform: translateX(300%); }
        }
      `}</style>
    </div>
  )
}
