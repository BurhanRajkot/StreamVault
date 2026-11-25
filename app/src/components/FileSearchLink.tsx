import { Link } from 'react-router-dom'
import { FileSearch } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useIsAdmin } from '@/hooks/useIsAdmin'
import { useSettings } from '@app/lib/settings'

/**
 * The shortcut to the Real-Debrid file search. It exists only for the admin,
 * and only once "File search" is switched on in My Space.
 */
export function FileSearchLink({ className }: { className?: string }) {
  const isAdmin = useIsAdmin()
  const { fileSearch } = useSettings()
  if (!isAdmin || !fileSearch) return null
  return (
    <Link
      to="/files"
      aria-label="Search my files"
      title="Search my files"
      className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-fill text-white transition-opacity active:opacity-70', className)}
    >
      <FileSearch className="h-4 w-4" strokeWidth={2.2} />
    </Link>
  )
}
