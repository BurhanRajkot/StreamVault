import { useState } from 'react'
import { ArrowDownToLine, Loader2, X } from 'lucide-react'
import { isNativeApp } from '@app/native/platform'
import { useAvailableUpdate } from '@app/native/updates'
import { useInstallUpdate } from '@app/native/installUpdate'

const DISMISSED_KEY = 'sv-app:update-dismissed'

/** A slim bar over every screen when GitHub has a newer release. */
export function UpdateBanner() {
  const { update } = useAvailableUpdate()
  const { state, install } = useInstallUpdate()
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISSED_KEY)
    } catch {
      return null
    }
  })

  if (!isNativeApp || !update || dismissed === update.version) return null

  const busy = state.phase === 'downloading' || state.phase === 'installing'
  const label =
    state.phase === 'downloading'
      ? state.percent !== null ? `Downloading ${state.percent}%` : 'Downloading…'
      : state.phase === 'installing' ? 'Installing…' : 'Update'

  return (
    <div className="sticky top-0 z-30 border-b border-primary/20 bg-[#0d1424]/95 pt-safe backdrop-blur-xl">
      <div className="flex items-center gap-3 px-4 py-2.5">
        <ArrowDownToLine className="h-4 w-4 shrink-0 text-primary" />
        <p className="min-w-0 flex-1 text-[12.5px] leading-tight text-white/80">
          <span className="font-semibold text-white">StreamVault {update.version}</span> is available.
          {state.phase === 'error' && <span className="block text-red-300">{state.message}</span>}
        </p>
        <button
          onClick={() => void install(update)}
          disabled={busy}
          className="press flex shrink-0 items-center gap-1.5 rounded-full bg-primary px-3.5 py-1.5 text-[12px] font-semibold text-white disabled:opacity-80"
        >
          {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {label}
        </button>
        {!busy && (
          <button
            aria-label="Not now"
            onClick={() => {
              setDismissed(update.version)
              try {
                localStorage.setItem(DISMISSED_KEY, update.version)
              } catch {
                /* shown again next launch */
              }
            }}
            className="-mr-1 p-1 text-white/40"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  )
}
