import type { Transition, Variants } from 'framer-motion'

/** The app's motion vocabulary — one place, so every screen moves alike. */
export const EASE_OUT = [0.22, 1, 0.36, 1] as const

export const spring: Transition = { type: 'spring', stiffness: 420, damping: 34, mass: 0.7 }
export const softSpring: Transition = { type: 'spring', stiffness: 240, damping: 30 }

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: EASE_OUT } },
}

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.4, ease: EASE_OUT } },
}

export function stagger(each = 0.045, delay = 0): Variants {
  return { hidden: {}, show: { transition: { staggerChildren: each, delayChildren: delay } } }
}

/** Items of a row or grid: rise in one after another. */
export const item: Variants = {
  hidden: { opacity: 0, y: 14, scale: 0.98 },
  show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.45, ease: EASE_OUT } },
}
