import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, Pause, Play } from 'lucide-react'
import { toast } from 'sonner'
import { AdminApiError, fetchAdminSettings, setPremiumPausedForAll } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * The site-wide Premium switch: pause it for every approved account at once
 * (the admin keeps it), or turn it back on.
 */
export function PremiumSwitchCard() {
  const queryClient = useQueryClient()
  const { data, error, isLoading } = useQuery({ queryKey: ['admin-settings'], queryFn: fetchAdminSettings, retry: false })
  const mutation = useMutation({
    mutationFn: setPremiumPausedForAll,
    onSuccess: (next) => {
      queryClient.setQueryData(['admin-settings'], next)
      toast.success(next.premiumPausedForAll ? 'Premium paused for everyone but you' : 'Premium is on for approved accounts')
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Could not change the setting'),
  })

  const paused = data?.premiumPausedForAll ?? false
  const migrationMissing = error instanceof AdminApiError && error.code === 'migration_required'

  return (
    <section aria-label="Premium for approved accounts" className="mb-10 flex flex-wrap items-center gap-4 rounded-xl border bg-card p-5">
      <span
        className={cn(
          'flex h-11 w-11 shrink-0 items-center justify-center rounded-full',
          paused ? 'bg-amber-500/15 text-amber-500' : 'bg-emerald-500/15 text-emerald-500'
        )}
        aria-hidden="true"
      >
        {paused ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-muted-foreground">Premium for approved accounts</p>
        <p className="text-lg font-semibold" role="status">
          {isLoading ? 'Checking…' : migrationMissing ? 'Setup needed' : paused ? 'Paused for everyone but you' : 'On'}
        </p>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {migrationMissing
            ? 'Run the user-access SQL in Supabase first (see the Users panel below).'
            : 'Pausing stops Premium for every account you approved at once. You keep it.'}
        </p>
      </div>
      <Button
        variant={paused ? 'default' : 'outline'}
        size="sm"
        disabled={isLoading || migrationMissing || mutation.isPending}
        onClick={() => mutation.mutate(!paused)}
      >
        {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
        {paused ? 'Turn Premium back on' : 'Pause Premium for everyone'}
      </Button>
    </section>
  )
}
