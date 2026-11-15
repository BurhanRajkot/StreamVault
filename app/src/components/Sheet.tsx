import type { ReactNode } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * A bottom sheet on a phone, a centred panel in a wide window. Radix gives it
 * focus trapping and Escape (Android's back gesture sends Escape — see App).
 */
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  children: ReactNode
  className?: string
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[200] bg-black/65 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content
          className={cn(
            'sheet-up fixed inset-x-0 bottom-0 z-[201] flex max-h-[85dvh] flex-col rounded-t-2xl border-t border-white/10 bg-[#141417] pb-safe text-white outline-none',
            'lg:inset-auto lg:left-1/2 lg:top-1/2 lg:w-[460px] lg:-translate-x-1/2 lg:-translate-y-1/2 lg:rounded-2xl lg:border',
            className
          )}
        >
          <div className="mx-auto mt-2 h-1 w-9 rounded-full bg-white/20 lg:hidden" aria-hidden="true" />
          <div className="flex items-start gap-3 px-5 pb-2 pt-3">
            <div className="min-w-0 flex-1">
              <Dialog.Title className="text-[16px] font-bold tracking-tight">{title}</Dialog.Title>
              {description ? (
                <Dialog.Description className="mt-0.5 text-[12.5px] text-white/55">{description}</Dialog.Description>
              ) : (
                <Dialog.Description className="sr-only">{title}</Dialog.Description>
              )}
            </div>
            <Dialog.Close aria-label="Close" className="-mr-2 rounded-full p-2 text-white/50 hover:text-white">
              <X className="h-5 w-5" />
            </Dialog.Close>
          </div>
          <div className="app-scroll min-h-0 flex-1 overflow-y-auto px-5 pb-5">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
