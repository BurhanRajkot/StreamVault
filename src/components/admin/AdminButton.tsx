import { Suspense, lazy, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { LayoutDashboard, LogOut, Shield, ShieldCheck } from 'lucide-react'
import { clearAdminToken } from '@/lib/api'
import { useIsAdmin } from '@/hooks/useIsAdmin'
import { cn } from '@/lib/utils'

// The modal brings framer-motion with it; only someone signing in needs that.
const AdminLoginModal = lazy(() => import('./AdminLoginModal'))

interface AdminButtonProps {
  className?: string
}

/**
 * The header's admin entry point. Signed out, a shield that opens the
 * authenticator-code sign-in; signed in, an amber shield whose menu goes to
 * the dashboard or signs out. ⚡ Premium plays only for a signed-in admin.
 */
export function AdminButton({ className }: AdminButtonProps) {
  const isAdmin = useIsAdmin()
  const [signingIn, setSigningIn] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !rootRef.current?.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', close)
    }
  }, [menuOpen])

  const base = cn(
    'inline-flex h-10 w-10 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
    className
  )

  if (!isAdmin) {
    return (
      <>
        <button
          type="button"
          onClick={() => setSigningIn(true)}
          aria-label="Sign in as admin"
          title="Sign in as admin"
          className={cn(base, 'text-muted-foreground hover:bg-foreground/[0.07] hover:text-foreground')}
        >
          <Shield className="h-[18px] w-[18px]" aria-hidden="true" />
        </button>
        {signingIn && (
          <Suspense fallback={null}>
            <AdminLoginModal isOpen onClose={() => setSigningIn(false)} onSuccess={() => setSigningIn(false)} />
          </Suspense>
        )}
      </>
    )
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setMenuOpen((open) => !open)}
        aria-label="Admin menu"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        title="Signed in as admin"
        className={cn(base, 'text-amber-400 hover:bg-amber-400/10')}
      >
        <ShieldCheck className="h-[18px] w-[18px]" aria-hidden="true" />
      </button>
      {menuOpen && (
        <div
          role="menu"
          aria-label="Admin"
          className="absolute right-0 top-12 z-50 w-56 overflow-hidden rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-xl"
        >
          <p className="px-3 py-2 text-xs text-muted-foreground">Signed in as admin · Premium unlocked</p>
          <Link
            to="/admin/dashboard"
            role="menuitem"
            onClick={() => setMenuOpen(false)}
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-accent"
          >
            <LayoutDashboard className="h-4 w-4" aria-hidden="true" />
            Admin dashboard
          </Link>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setMenuOpen(false)
              clearAdminToken()
            }}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-destructive hover:bg-accent"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Sign out of admin
          </button>
        </div>
      )}
    </div>
  )
}
