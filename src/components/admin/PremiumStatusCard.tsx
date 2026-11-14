import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, Loader2, RefreshCw, TriangleAlert, Zap } from 'lucide-react'
import { getAdminToken } from '@/lib/api'
import { fetchDebridStatus } from '@/lib/debridApi'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * The ⚡ Premium server's health, on the admin dashboard: is the Real-Debrid
 * key on the server accepted, is the account premium, and until when. The
 * place to look right after changing DEBRID_API_KEY.
 */
export function PremiumStatusCard() {
  const { data, isFetching, isError, refetch } = useQuery({
    queryKey: ['debrid-status'],
    queryFn: () => fetchDebridStatus(getAdminToken() ?? undefined),
    staleTime: 60_000,
    retry: false,
  })

  const working = !!data?.connected && data.premium
  const expires = data?.expiration ? new Date(data.expiration) : null
  const daysLeft = expires ? Math.ceil((expires.getTime() - Date.now()) / 86_400_000) : null

  let headline = 'Checking Real-Debrid…'
  let detail: string | null = null
  if (isError) {
    headline = "Couldn't reach the server"
    detail = 'The status check itself failed. Try again in a moment.'
  } else if (data) {
    if (working) {
      headline = 'Working'
      detail = expires
        ? `Real-Debrid premium until ${expires.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}${
            daysLeft !== null && daysLeft <= 14 ? ` — ${Math.max(daysLeft, 0)} days left, renew soon` : ''
          }.`
        : 'Real-Debrid account connected and premium.'
    } else {
      headline = data.connected ? 'Connected, but not usable' : 'Not connected'
      detail = data.note ?? 'Real-Debrid did not accept the server’s key.'
    }
  }

  const Icon = !data && !isError ? Loader2 : working ? CheckCircle2 : TriangleAlert

  return (
    <section
      aria-label="Premium server status"
      className="mb-10 flex flex-wrap items-center gap-4 rounded-xl border bg-card p-5"
    >
      <span
        className={cn(
          'flex h-11 w-11 shrink-0 items-center justify-center rounded-full',
          working ? 'bg-emerald-500/15 text-emerald-500' : data || isError ? 'bg-amber-500/15 text-amber-500' : 'bg-muted text-muted-foreground'
        )}
      >
        <Icon className={cn('h-5 w-5', !data && !isError && 'animate-spin')} aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
          <Zap className="h-3.5 w-3.5 fill-amber-400 text-amber-400" aria-hidden="true" />
          Premium server · admin-only
        </p>
        <p className="text-lg font-semibold" role="status">
          {headline}
        </p>
        {detail && <p className="mt-0.5 text-sm text-muted-foreground">{detail}</p>}
      </div>
      <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={isFetching}>
        <RefreshCw className={cn('mr-2 h-4 w-4', isFetching && 'animate-spin')} aria-hidden="true" />
        Check again
      </Button>
    </section>
  )
}
