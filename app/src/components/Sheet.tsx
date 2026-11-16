import type { ReactNode } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { AnimatePresence, motion, useDragControls, type PanInfo } from 'framer-motion'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useIsWide } from '@app/lib/hooks'
import { softSpring } from '@app/lib/motion'

/**
 * A panel over the screen. On a phone it slides up from the bottom and a
 * downward swipe on its handle puts it away; in a wide window it floats in
 * the middle. `side="right"` makes it a drawer down the right edge — the
 * player uses that, sideways. Radix gives focus trapping and Escape (Android's
 * back gesture and the Linux shell both send Escape — see App).
 */
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
  side = 'bottom',
  headerExtra,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  children: ReactNode
  className?: string
  side?: 'bottom' | 'right'
  headerExtra?: ReactNode
}) {
  const wide = useIsWide()
  const drag = useDragControls()
  const variant = side === 'right' ? 'right' : wide ? 'center' : 'bottom'

  const motionProps = {
    right: { initial: { x: '100%' }, animate: { x: 0 }, exit: { x: '100%' } },
    center: { initial: { opacity: 0, scale: 0.94, y: 12 }, animate: { opacity: 1, scale: 1, y: 0 }, exit: { opacity: 0, scale: 0.96, y: 8 } },
    bottom: { initial: { y: '100%' }, animate: { y: 0 }, exit: { y: '100%' } },
  }[variant]

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.y > 110 || info.velocity.y > 600) onOpenChange(false)
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild forceMount>
              <motion.div
                className="fixed inset-0 z-[400] bg-black/50"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
              />
            </Dialog.Overlay>
            <Dialog.Content asChild forceMount>
              <motion.div
                {...motionProps}
                transition={softSpring}
                drag={variant === 'bottom' ? 'y' : false}
                dragControls={drag}
                dragListener={false}
                dragConstraints={{ top: 0, bottom: 0 }}
                dragElastic={{ top: 0, bottom: 0.6 }}
                onDragEnd={onDragEnd}
                className={cn(
                  'material-sheet fixed z-[401] flex flex-col text-white outline-none',
                  variant === 'bottom' && 'inset-x-0 bottom-0 max-h-[90dvh] rounded-t-[22px] pb-safe',
                  variant === 'center' && 'inset-x-0 top-[8vh] mx-auto max-h-[84vh] w-[min(540px,calc(100vw-2rem))] rounded-[22px] shadow-[0_30px_80px_-20px_rgb(0_0_0/0.8)]',
                  variant === 'right' && 'inset-y-0 right-0 w-[min(400px,88vw)] rounded-l-[22px] pr-[var(--sar)]',
                  className
                )}
              >
                {variant === 'bottom' && (
                  <div className="flex cursor-grab touch-none justify-center pt-[6px] active:cursor-grabbing" onPointerDown={(e) => drag.start(e)} aria-hidden="true">
                    <span className="h-[5px] w-9 rounded-full bg-white/30" />
                  </div>
                )}
                <div
                  className={cn('flex items-center gap-3 px-4 pb-3', variant === 'bottom' ? 'touch-none pt-2' : 'pt-4')}
                  onPointerDown={variant === 'bottom' ? (e) => drag.start(e) : undefined}
                >
                  {/* Balances the close button, so the title sits in the middle */}
                  <span className="w-[30px] shrink-0" aria-hidden="true" />
                  <div className="min-w-0 flex-1 text-center">
                    <Dialog.Title className="t-headline truncate">{title}</Dialog.Title>
                    {description ? (
                      <Dialog.Description className="t-footnote mt-0.5 truncate text-label-2">{description}</Dialog.Description>
                    ) : (
                      <Dialog.Description className="sr-only">{title}</Dialog.Description>
                    )}
                  </div>
                  {headerExtra}
                  <Dialog.Close aria-label="Close" className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-fill text-white/70 transition-colors hover:bg-white/20 hover:text-white">
                    <X className="h-4 w-4" strokeWidth={2.6} />
                  </Dialog.Close>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-6">{children}</div>
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  )
}
