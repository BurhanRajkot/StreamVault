import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Loader2, X } from 'lucide-react'
import { softSpring } from '@app/lib/motion'
import { LogoMark } from './Logo'
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
      : state.phase === 'installing' ? 'Installing…' : 'Update'

  return (
    <AnimatePresence>
      {show && update && (
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 24 }}
          transition={{ ...softSpring, delay: 1.2 }}
          className="fixed inset-x-4 bottom-[calc(var(--tabbar-h)+var(--sab)+20px)] z-40 mx-auto max-w-[420px] lg:inset-x-auto lg:bottom-6 lg:right-6 lg:w-[360px]"
        >
          <div className="material-float relative overflow-hidden rounded-[22px] py-2.5 pl-2.5 pr-3">
            {state.phase === 'downloading' && state.percent !== null && (
              <motion.span className="absolute inset-y-0 left-0 bg-white/[0.08]" animate={{ width: `${state.percent}%` }} transition={{ ease: 'linear' }} />
            )}
            <div className="relative flex items-center gap-3">
              <LogoMark className="h-[38px] w-[38px] shrink-0" />
              <p className="min-w-0 flex-1">
                <span className="t-subhead block truncate font-semibold text-white">StreamVault {update.version}</span>
                <span className={state.phase === 'error' ? 't-footnote block text-ios-red' : 't-footnote block text-label-2'}>{state.phase === 'error' ? state.message : 'Update available'}</span>
              </p>
              <button
                onClick={() => void install(update)}
                disabled={busy}
                className="press flex h-[30px] shrink-0 items-center gap-1.5 rounded-full bg-tint px-3.5 text-[14px] font-semibold text-white disabled:opacity-80"
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
                  className="-mr-1 flex h-7 w-7 items-center justify-center rounded-full text-label-2 hover:bg-white/10 hover:text-white"
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
