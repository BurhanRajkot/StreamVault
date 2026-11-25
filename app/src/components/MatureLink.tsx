import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { useIsAdmin } from '@/hooks/useIsAdmin'

/**
 * The "18+" icon that opens the erotic shelf. It only exists for the admin:
 * everyone else gets nothing, not a disabled button.
 */
export function MatureLink({ className }: { className?: string }) {
  const isAdmin = useIsAdmin()
  if (!isAdmin) return null
  return (
    <Link
      to="/18plus"
      aria-label="18+ shelf"
      title="18+"
      className={cn(
        'flex h-8 shrink-0 items-center justify-center rounded-full bg-ios-red px-2.5 text-[12px] font-bold leading-none text-white transition-opacity active:opacity-70',
        className
      )}
    >
      18+
    </Link>
  )
}
