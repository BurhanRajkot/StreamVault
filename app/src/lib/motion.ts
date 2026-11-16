import type { Transition, Variants } from 'framer-motion'

/**
 * The app's motion vocabulary — one place, so every screen moves alike.
 * Modelled on iOS: content is simply there; controls answer with short,
 * critically damped springs; nothing bounces for show.
 */
export const EASE_OUT = [0.25, 1, 0.5, 1] as const

/** Controls: pills sliding between segments, switches, checkmarks. */
export const spring: Transition = { type: 'spring', stiffness: 500, damping: 42, mass: 0.8 }
/** Larger surfaces: sheets, the tab bar. */
export const softSpring: Transition = { type: 'spring', stiffness: 320, damping: 36 }

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: EASE_OUT } },
}

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.25, ease: EASE_OUT } },
}

export function stagger(each = 0.02, delay = 0): Variants {
  return { hidden: {}, show: { transition: { staggerChildren: each, delayChildren: delay } } }
}

/** Items of a grid or list: a quick fade, no travel. */
export const item: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.25, ease: EASE_OUT } },
}
