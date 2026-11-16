import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowDownToLine, Loader2, X } from 'lucide-react'
import { spring } from '@app/lib/motion'
import { isNativeApp } from '@app/native/platform'
import { useAvailableUpdate } from '@app/native/updates'
import { useInstallUpdate } from '@app/native/installUpdate'

const DISMISSED_KEY = 'sv-app:update-dismissed'

/** A floating card when a newer release is out — over the tab bar on a phone, bottom-right in a window. */
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

  const show = isNativeApp && !!update && dismissed !== update.version
  const busy = state.phase === 'downloading' || state.phase === 'installing'
  const label =
    state.phase === 'downloading'
      ? state.percent !== null ? `Downloading ${state.percent}%` : 'Downloading…'
      : state.phase === 'installing' ? 'Installing…' : 'Update now'

  return (
    <AnimatePresence>
      {show && update && (
        <motion.div
          initial={{ opacity: 0, y: 40, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 40, scale: 0.96 }}
          transition={{ ...spring, delay: 1.2 }}
          className="fixed inset-x-3 bottom-[calc(var(--tabbar-h)+var(--sab)+20px)] z-40 mx-auto max-w-md lg:inset-x-auto lg:bottom-6 lg:right-6 lg:w-[360px]"
        >
          <div className="glass-strong relative overflow-hidden rounded-2xl p-3.5">
            {state.phase === 'downloading' && state.percent !== null && (
              <motion.span className="absolute inset-y-0 left-0 bg-primary/15" animate={{ width: `${state.percent}%` }} transition={{ ease: 'linear' }} />
            )}
            <div className="relative flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary">
                <ArrowDownToLine className="h-5 w-5 text-white" />
              </span>
              <p className="min-w-0 flex-1 text-[12.5px] leading-tight text-white/65">
                <span className="block text-[13.5px] font-bold text-white">StreamVault {update.version}</span>
                {state.phase === 'error' ? <span className="text-red-300">{state.message}</span> : 'A new version is ready.'}
              </p>
              <button
                onClick={() => void install(update)}
                disabled={busy}
                className="press flex shrink-0 items-center gap-1.5 rounded-full bg-white px-3.5 py-2 text-[12px] font-bold text-black disabled:opacity-80"
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
                  className="-mr-1 rounded-full p-1.5 text-white/40 hover:bg-white/10 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
