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
      className="animate-slide-up fixed inset-x-3 bottom-[calc(var(--sv-tabbar-h)+env(safe-area-inset-bottom,0px)+0.75rem)] z-40 rounded-2xl border border-white/10 bg-zinc-900/95 p-3.5 text-white shadow-2xl md:inset-x-auto md:p-4 md:bottom-6 md:right-6 md:w-[380px]"
    >
      <button
        onClick={() => dismiss()}
        aria-label="Dismiss"
        className="absolute right-2.5 top-2.5 rounded-full p-1.5 text-white/50 transition-colors hover:bg-white/10 hover:text-white"
      >
        <X className="h-4 w-4" />
      </button>

      {/* Kept short on a phone: from the bottom it would otherwise reach up
          over the hero's Play button on the first screen anyone sees */}
      <div className="flex gap-3 pr-6">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-yellow-400/15 md:h-10 md:w-10">
          <Zap className="h-[18px] w-[18px] fill-yellow-400 text-yellow-400 md:h-5 md:w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold leading-snug md:text-[15px]">Premium servers are free for 6 months</p>
          <p className="mt-0.5 text-xs leading-relaxed text-white/65 md:mt-1">
            <span className="hidden md:inline">Stream in 4K and 1080p on the Premium server — free for everyone, </span>
            <span className="md:hidden">4K and 1080p for everyone — </span>
            no sign-in needed, until {formatPromoDate(freeUntil)}.
          </p>
        </div>
      </div>

      <div className="mt-2.5 flex items-center gap-2 pl-12 md:mt-3.5 md:pl-[52px]">
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
