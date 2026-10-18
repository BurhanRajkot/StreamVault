import { useAuth0 } from '@auth0/auth0-react'
import { LogOut } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { initialsOf } from '@/lib/utils'

const triggerClass =
  'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary'

/**
 * Avatar + account dropdown. Loaded on demand (see Header): only signed-in
 * users see it, and the dropdown machinery (Radix menu, floating-ui) would
 * otherwise sit in every guest's first download.
 */
export default function AccountMenu() {
  const { user, logout } = useAuth0()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button aria-label="Open account menu" className={triggerClass}>
          <Avatar className="h-9 w-9">
            <AvatarImage src={user?.picture} alt={user?.name || 'User avatar'} />
            <AvatarFallback>{initialsOf(user?.name)}</AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="flex flex-col gap-1">
          <span className="text-sm font-medium">{user?.name}</span>
          <span className="text-xs text-muted-foreground">{user?.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <button
          className="flex w-full items-center gap-2 px-2 py-1.5 text-sm text-destructive hover:bg-accent"
          onClick={() => logout({ logoutParams: { returnTo: window.location.origin } })}
        >
          <LogOut className="h-4 w-4" />
          Logout
        </button>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
