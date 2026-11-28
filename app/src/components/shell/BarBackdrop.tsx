import { cn } from '@/lib/utils'

/**
 * A top bar's background: a clear wash over a hero, frosted glass once the
 * page scrolls under it. The two are layers that crossfade — a gradient
 * can't be transitioned, so switching the bar's own background snapped from
 * one to the other — and only their opacity moves, which the compositor runs.
 * Put it first inside a positioned bar (fixed or sticky with a z-index, so it
 * stacks within the bar, behind the bar's content).
 */
export function BarBackdrop({ solid, clear = 'bg-gradient-to-b from-black/60 via-black/20 to-transparent' }: { solid: boolean; clear?: string }) {
  return (
    <>
      <span aria-hidden="true" className={cn('pointer-events-none absolute inset-0 -z-10 transition-opacity duration-300 ease-out', clear, solid && 'opacity-0')} />
      <span aria-hidden="true" className={cn('material-bar pointer-events-none absolute inset-0 -z-10 transition-opacity duration-300 ease-out', !solid && 'opacity-0')} />
    </>
  )
}
