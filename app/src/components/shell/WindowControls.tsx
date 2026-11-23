import { useEffect } from 'react'
import { Copy, Minus, Pin, PinOff, Square, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { desktop, type WindowAction } from '@app/native/platform'
import { useWindowState } from '@app/lib/hooks'

/**
 * The frameless desktop window's own controls (Linux, Windows): the app
 * draws the title bar, so every screen has to leave a way to move, resize,
 * minimize and close the window — the wide layout's top bar, a slim strip in
 * a narrow (snapped, split-screen) window, and the players' bars.
 */

const control = (action: WindowAction) => void desktop?.windowControl?.(action)

/** Minimize, maximize/restore, close — for the wide layout's top bar. */
export function WindowButtons({ className }: { className?: string }) {
  const { maximized } = useWindowState()
  const base = 'flex h-8 w-10 items-center justify-center rounded-lg text-white/60 transition-colors hover:text-white'
  return (
    <div className={cn('no-drag flex items-center gap-0.5', className)}>
      <button onClick={() => control('minimize')} aria-label="Minimize" title="Minimize" className={cn(base, 'hover:bg-white/10')}>
        <Minus className="h-4 w-4" />
      </button>
      <button onClick={() => control('maximize')} aria-label={maximized ? 'Restore' : 'Maximize'} title={maximized ? 'Restore' : 'Maximize'} className={cn(base, 'hover:bg-white/10')}>
        {maximized ? <Copy className="h-3.5 w-3.5 -scale-x-100" /> : <Square className="h-3.5 w-3.5" />}
      </button>
      <button onClick={() => control('close')} aria-label="Close" title="Close" className={cn(base, 'hover:bg-red-500/90')}>
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}

/**
 * A narrow window has the phone layout and no top bar, so a slim strip
 * stands in for the title bar: it drags the window and carries its buttons.
 * The page makes room for it the way a phone's layout makes room for the
 * status bar (--sat, see app.css).
 */
export function WindowStrip() {
  const { maximized, fullscreen } = useWindowState()
  if (!desktop?.frameless || fullscreen) return null
  const base = 'flex h-full w-11 items-center justify-center text-white/70 transition-colors hover:text-white'
  return (
    <div
      className="drag fixed inset-x-0 top-0 z-[250] flex h-[var(--wbar-h)] items-center justify-end bg-gradient-to-b from-black/45 to-transparent lg:hidden"
      onDoubleClick={(e) => {
        if (e.target === e.currentTarget) control('maximize')
      }}
    >
      <button onClick={() => control('minimize')} aria-label="Minimize" title="Minimize" className={cn(base, 'hover:bg-white/10')}>
        <Minus className="h-4 w-4" />
      </button>
      <button onClick={() => control('maximize')} aria-label={maximized ? 'Restore' : 'Maximize'} title={maximized ? 'Restore' : 'Maximize'} className={cn(base, 'hover:bg-white/10')}>
        {maximized ? <Copy className="h-3.5 w-3.5 -scale-x-100" /> : <Square className="h-3 w-3" />}
      </button>
      <button onClick={() => control('close')} aria-label="Close" title="Close" className={cn(base, 'hover:bg-red-500/90')}>
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}

/**
 * `sv-frameless` on <html> while the window has the app's own title bar
 * (frameless, not full screen): narrow layouts start below the strip, and
 * the Premium player's title drags the window (app.css).
 */
export function useFramelessClass() {
  const { fullscreen } = useWindowState()
  const on = !!desktop?.frameless && !fullscreen
  useEffect(() => {
    document.documentElement.classList.toggle('sv-frameless', on)
    return () => document.documentElement.classList.remove('sv-frameless')
  }, [on])
}

/**
 * The players' window controls: keep on top, minimize, maximize/restore,
 * close — in the players' glass style, beside their own buttons. Hidden in
 * full screen (there is no window to move; Escape or F11 leaves it).
 */
export function PlayerWindowControls({ className }: { className?: string }) {
  const { maximized, fullscreen, pinned } = useWindowState()
  if (!desktop?.frameless || fullscreen) return null
  const base = 'flex h-8 w-9 items-center justify-center rounded-full text-white/80 transition-colors hover:bg-white/15 hover:text-white'
  return (
    <div className={cn('no-drag glass-button pointer-events-auto flex h-10 shrink-0 items-center gap-0.5 rounded-full px-1', className)}>
      <button
        onClick={() => control('pin')}
        aria-label={pinned ? 'Stop keeping on top' : 'Keep on top'}
        aria-pressed={!!pinned}
        title={pinned ? 'Stop keeping on top' : 'Keep on top of other windows'}
        className={cn(base, pinned && 'bg-white/20 text-white')}
      >
        {pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
      </button>
      <button onClick={() => control('minimize')} aria-label="Minimize" title="Minimize" className={base}>
        <Minus className="h-4 w-4" />
      </button>
      <button onClick={() => control('maximize')} aria-label={maximized ? 'Restore' : 'Maximize'} title={maximized ? 'Restore' : 'Maximize'} className={base}>
        {maximized ? <Copy className="h-3.5 w-3.5 -scale-x-100" /> : <Square className="h-3.5 w-3.5" />}
      </button>
      <button onClick={() => control('close')} aria-label="Close" title="Close" className={cn(base, 'hover:bg-red-500/90')}>
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
