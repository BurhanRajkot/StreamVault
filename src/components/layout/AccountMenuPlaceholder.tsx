import { useAuth0 } from '@auth0/auth0-react'
import { initialsOf } from '@/lib/utils'

/**
 * The signed-in user's avatar while the account menu's code loads (see
 * Header) — same size and place, so nothing shifts when the real one lands.
 */
export function AccountMenuPlaceholder() {
  const { user } = useAuth0()
  return (
    <span
      aria-hidden="true"
      className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border/60"
    >
      <span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-muted text-sm">
        {initialsOf(user?.name)}
      </span>
    </span>
  )
}
