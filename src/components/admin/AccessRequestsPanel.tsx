import { useState } from 'react'
import { Check, Github, Inbox, Loader2, RefreshCw, Star, Trash2 } from 'lucide-react'
import type { AdminAccessRequest } from '@/lib/api'
import { useAccessRequests } from '@/hooks/useAccessRequests'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

function when(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
}

/** Star status as a badge: checked with GitHub, not found, or not checked. */
export function StarBadge({ request }: { request: Pick<AdminAccessRequest, 'github' | 'starred'> }) {
  if (!request.github) return <Badge variant="outline">No GitHub</Badge>
  if (request.starred === true)
    return (
      <Badge className="gap-1 border-transparent bg-amber-400/15 text-amber-400 hover:bg-amber-400/15">
        <Star className="h-3 w-3 fill-current" aria-hidden="true" /> Starred
      </Badge>
    )
  if (request.starred === false) return <Badge variant="outline">Not starred</Badge>
  return <Badge variant="outline">Star not checked</Badge>
}

/**
 * Premium access requests, sent from the app: who asked, whether their
 * GitHub account starred the repo (checked with GitHub), their note. Approve switches Premium on for the account — it
 * plays in the app only. Delete drops the request; access already given
 * stays until it's changed in the Users panel.
 */
export function AccessRequestsPanel() {
  const { requests, pending, isLoading, error, refetch, isFetching, approve, remove, busyFor } = useAccessRequests()
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  return (
    <section aria-label="Premium access requests" className="mb-10 rounded-xl border bg-card p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          Premium access requests
          {pending > 0 && <Badge className="bg-red-500 text-white hover:bg-red-500">{pending} pending</Badge>}
        </h2>
        <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={isFetching}>
          <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} aria-hidden="true" /> Refresh
        </Button>
      </div>

      {isLoading ? (
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      ) : error ? (
        <p className="text-sm text-muted-foreground">{error instanceof Error ? error.message : 'Could not load requests'}</p>
      ) : requests.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Inbox className="h-4 w-4" aria-hidden="true" /> No requests yet. People ask from the app's Premium screen.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {requests.map((r) => {
            const busy = busyFor === r.userId
            return (
              <li key={r.userId} aria-label={`Request from ${r.email || r.name || r.userId}`} className="flex flex-wrap items-start gap-3 rounded-lg border bg-background/40 p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{r.email || r.name || r.userId}</p>
                  <p className="text-xs text-muted-foreground">
                    {r.name && r.email ? `${r.name} · ` : ''}
                    {when(r.createdAt)}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <StarBadge request={r} />
                    {r.github && (
                      <a
                        href={`https://github.com/${r.github}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:underline"
                      >
                        <Github className="h-3 w-3" aria-hidden="true" /> {r.github}
                      </a>
                    )}
                  </div>
                  {r.note && <p className="mt-2 text-sm text-muted-foreground">“{r.note}”</p>}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {r.status === 'pending' ? (
                    <Button size="sm" disabled={busy} onClick={() => approve.mutate(r.userId)}>
                      {busy && approve.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Check className="mr-1.5 h-4 w-4" />}
                      Approve
                    </Button>
                  ) : (
                    <Badge variant="outline" className="border-emerald-500/40 text-emerald-500">
                      Approved
                    </Badge>
                  )}
                  <Button
                    size="sm"
                    variant={confirmDelete === r.userId ? 'destructive' : 'outline'}
                    disabled={busy}
                    onClick={() => {
                      if (confirmDelete !== r.userId) return setConfirmDelete(r.userId)
                      setConfirmDelete(null)
                      remove.mutate(r.userId)
                    }}
                    onBlur={() => setConfirmDelete((id) => (id === r.userId ? null : id))}
                  >
                    <Trash2 className="mr-1.5 h-4 w-4" aria-hidden="true" />
                    {confirmDelete === r.userId ? 'Confirm' : 'Delete'}
                  </Button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
