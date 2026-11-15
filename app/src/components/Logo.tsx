import { useId } from 'react'
import { cn } from '@/lib/utils'

/** The app mark: a play triangle in the vault's rounded square. */
export function LogoMark({ className }: { className?: string }) {
  // Unique per instance: a gradient defined inside a hidden copy (the sidebar on a phone) can't paint a visible one
  const id = useId()
  return (
    <svg viewBox="0 0 48 48" className={cn('h-7 w-7', className)} aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#60a5fa" />
          <stop offset="1" stopColor="#2563eb" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="44" height="44" rx="12" fill={`url(#${id})`} />
      <path d="M19 15.5v17a1.5 1.5 0 0 0 2.3 1.27l13.4-8.5a1.5 1.5 0 0 0 0-2.54l-13.4-8.5A1.5 1.5 0 0 0 19 15.5Z" fill="#fff" />
    </svg>
  )
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn('flex items-center gap-2', className)}>
      <LogoMark />
      <span className="text-[17px] font-bold tracking-tight text-white">
        Stream<span className="text-primary">Vault</span>
      </span>
    </span>
  )
}
