import { useEffect, useSyncExternalStore } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

/**
 * Ambient light: the artwork on screen (the hero, the title being viewed)
 * glows softly behind the whole app, like a TV's bias lighting. Screens call
 * useAmbient(url); the light crossfades as it changes.
 */
let current: string | null = null
const listeners = new Set<() => void>()

function setAmbient(url: string | null) {
  if (url === current) return
  current = url
  listeners.forEach((fn) => fn())
}

export function useAmbient(url: string | null | undefined) {
  useEffect(() => {
    if (!url || url.endsWith('placeholder.svg')) return
    setAmbient(url)
    return () => setAmbient(null)
  }, [url])
}

export function AmbientBackdrop() {
  const url = useSyncExternalStore(
    (fn) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    () => current
  )
  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
      <AnimatePresence>
        {url && (
          <motion.img
            key={url}
            src={url}
            alt=""
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.32 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.4, ease: 'easeInOut' }}
            className="absolute inset-0 h-full w-full scale-125 object-cover blur-[90px] saturate-[1.15]"
          />
        )}
      </AnimatePresence>
      <div className="absolute inset-0 bg-gradient-to-b from-background/20 via-background/75 to-background" />
    </div>
  )
}
