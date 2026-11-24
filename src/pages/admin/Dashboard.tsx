import { useState } from 'react'
import { PageMeta } from '@/seo/PageMeta'
import { ShieldCheck } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Footer } from '@/components/layout/Footer'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AdminApiError, clearAdminToken, fetchAdminSettings, isAdminAuthenticated } from '@/lib/api'
import AdminLoginModal from '@/components/admin/AdminLoginModal'
import { AdminModeBadge } from '@/components/admin/AdminModeBadge'
import { PremiumStatusCard } from '@/components/admin/PremiumStatusCard'
import { PremiumSwitchCard } from '@/components/admin/PremiumSwitchCard'
import { UsersPanel } from '@/components/admin/UsersPanel'
import { AccessRequestsPanel } from '@/components/admin/AccessRequestsPanel'

export default function AdminDashboard() {
  const queryClient = useQueryClient()
  const [hasToken, setHasToken] = useState(isAdminAuthenticated())
  const [showLoginModal, setShowLoginModal] = useState(false)

  // The same call the Premium switch makes (one request between them): a 401
  // means the saved token has expired, so the login screen takes over.
  const { error: sessionError } = useQuery({
    queryKey: ['admin-settings'],
    queryFn: fetchAdminSettings,
    retry: false,
    enabled: hasToken,
  })
  const isAdmin = hasToken && !(sessionError instanceof AdminApiError && sessionError.status === 401)

  if (!isAdmin) {
    return (
      <>
        <PageMeta title="Admin Access Required" noindex />
        <div className="min-h-screen flex flex-col bg-background">
          <header className="border-b border-border/40 bg-background/80 backdrop-blur-xl">
            <div className="mx-auto max-w-7xl px-4 py-4 flex items-center justify-between">
              <h1 className="text-xl font-bold">Admin Dashboard</h1>
              <Link to="/">
                <Button variant="ghost" size="sm">Back to Home</Button>
              </Link>
            </div>
          </header>
          <main className="flex-1 flex flex-col items-center justify-center py-20 text-center px-4">
            <div className="max-w-md w-full border rounded-2xl bg-card p-8 shadow-2xl text-center space-y-6">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
                <ShieldCheck className="h-8 w-8" />
              </div>
              <h2 className="text-2xl font-bold">Admin Access Required</h2>
              <p className="text-muted-foreground text-sm leading-relaxed">
                This dashboard is restricted to administrator accounts. Please log in with today's authorization code to continue.
              </p>
              <Button onClick={() => setShowLoginModal(true)} className="w-full h-11">
                Log In as Admin
              </Button>
            </div>
          </main>
          <Footer />
          <AdminLoginModal
            isOpen={showLoginModal}
            onClose={() => setShowLoginModal(false)}
            onSuccess={() => {
              setHasToken(true)
              void queryClient.resetQueries({ queryKey: ['admin-settings'] })
            }}
          />
        </div>
      </>
    )
  }

  return (
    <>
      <PageMeta title="Admin Dashboard" noindex />

      <div className="min-h-screen flex flex-col bg-background">
        <header className="border-b border-golden-amber/25 bg-background/80 shadow-[inset_0_-1px_0_rgba(245,197,90,0.15)] backdrop-blur-xl">
          <div className="mx-auto max-w-7xl px-4 py-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold">Admin Dashboard</h1>
              <AdminModeBadge />
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  clearAdminToken()
                  setHasToken(false)
                }}
              >
                Logout
              </Button>
              <Link to="/">
                <Button variant="ghost" size="sm">Back to Home</Button>
              </Link>
            </div>
          </div>
        </header>

        <main className="flex-1 py-10 px-4">
          <div className="mx-auto max-w-7xl">
            <PremiumStatusCard />
            <PremiumSwitchCard />
            <AccessRequestsPanel />
            <UsersPanel />
          </div>
        </main>
        <Footer />
      </div>
    </>
  )
}
