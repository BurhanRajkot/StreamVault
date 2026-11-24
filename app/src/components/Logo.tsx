import { cn } from '@/lib/utils'

/**
 * The mark: nested arches — a vault, the arched kind, receding like a
 * corridor to a doorway. Flat, one colour; the same drawing as the app icon
 * (app/public/icon.svg).
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={cn('h-7 w-7', className)} aria-hidden="true">
      <rect width="48" height="48" rx="11" fill="#2f6bff" />
      <g transform="translate(0 1.5)">
        <g fill="none" stroke="#fff" strokeWidth="3.6">
          <path d="M9 38 V22 a15 15 0 0 1 30 0 V38" />
          <path d="M16.5 38 V23.5 a7.5 7.5 0 0 1 15 0 V38" />
        </g>
        <path d="M21 38 V25.5 a3 3 0 0 1 6 0 V38 Z" fill="#fff" />
      </g>
    </svg>
  )
}

export function Logo({ className, compact }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn('flex items-center', compact ? 'gap-2' : 'gap-2.5', className)}>
      <LogoMark className={compact ? 'h-6 w-6' : undefined} />
      <span className={cn('font-bold tracking-[-0.02em] text-white', compact ? 'text-[17px]' : 'text-[19px]')}>StreamVault</span>
    </span>
  )
}
