import { useState } from 'react'
import { X, Zap } from 'lucide-react'
import { formatPromoDate, useDebridFreeUntil } from '@/hooks/useDebridPromo'

/** Versioned by the promotion's terms, so a change (guests welcome, 2026-10-16) shows again to people who dismissed the old one. */
const DISMISSED_KEY = 'sv:announce:debrid-free-2026-10-everyone'

/** ✕ or the main button: gone for good. "Maybe later": gone for this visit. */
function wasDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === 'true' || sessionStorage.getItem(DISMISSED_KEY) === 'true'
  } catch {
    return false
  }
}

/**
 * "Premium servers are free" card, shown on the home page while the free
 * Real-Debrid promotion runs (the backend decides — see useDebridFreeUntil)
 * until the viewer dismisses it.
 *
 * z-40 keeps it under the header, the bottom tab bar and the title modal
 * (all z-50), so it never covers playback.
 */
export function FreePremiumAnnouncement() {
  const freeUntil = useDebridFreeUntil()
  const [dismissed, setDismissed] = useState(wasDismissed)

  if (!freeUntil || dismissed) return null

  const dismiss = (forGood = true) => {
    setDismissed(true)
    try {
      ;(forGood ? localStorage : sessionStorage).setItem(DISMISSED_KEY, 'true')
    } catch {
      // Shows again next visit — harmless.
    }
  }

  return (
    <aside
      role="status"
      aria-label="Free premium servers"
      data-testid="free-premium-announcement"
      className="animate-slide-up fixed inset-x-3 bottom-[calc(var(--sv-tabbar-h)+env(safe-area-inset-bottom,0px)+0.75rem)] z-40 rounded-2xl border border-white/10 bg-zinc-900/95 p-4 text-white shadow-2xl md:inset-x-auto md:bottom-6 md:right-6 md:w-[380px]"
    >
      <button
        onClick={() => dismiss()}
        aria-label="Dismiss"
        className="absolute right-2.5 top-2.5 rounded-full p-1.5 text-white/50 transition-colors hover:bg-white/10 hover:text-white"
      >
        <X className="h-4 w-4" />
      </button>

      <div className="flex gap-3 pr-6">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-yellow-400/15">
          <Zap className="h-5 w-5 fill-yellow-400 text-yellow-400" />
        </div>
        <div className="min-w-0">
          <p className="text-[15px] font-bold leading-snug">Premium servers are free for 6 months</p>
          <p className="mt-1 text-xs leading-relaxed text-white/65">
            Stream in 4K and 1080p on the Premium server — free for everyone, no sign-in needed, until{' '}
            {formatPromoDate(freeUntil)}.
          </p>
        </div>
      </div>

      <div className="mt-3.5 flex items-center gap-2 pl-[52px]">
        <button
          onClick={() => dismiss()}
          className="rounded-full bg-white px-4 py-1.5 text-xs font-bold text-black transition-colors hover:bg-white/90"
        >
          Start watching
        </button>
        <button onClick={() => dismiss(false)} className="rounded-full px-3 py-1.5 text-xs text-white/60 transition-colors hover:text-white">
          Maybe later
        </button>
      </div>
    </aside>
  )
}
