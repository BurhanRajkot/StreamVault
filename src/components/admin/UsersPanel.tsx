import { useEffect, useState } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Ban, Loader2, RotateCcw, Search, Users } from 'lucide-react'
import { toast } from 'sonner'
import {
  AdminApiError,
  fetchAdminUsers,
  updateAdminUser,
  type AdminUser,
  type PremiumAccessLevel,
} from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

const PAGE_SIZE = 25
const MIGRATION_FILE = 'backend/supabase/migrations/20261115000000_user_access_controls.sql'

const PREMIUM_LABELS: Record<PremiumAccessLevel, string> = {
  none: 'No access',
  granted: 'Allowed',
  paused: 'Paused',
}

function relativeTime(iso: string | null): string {
  if (!iso) return 'Never'
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days} d ago`
  return new Date(iso).toLocaleDateString()
}

/**
 * Every account that has signed in: give or pause its ⚡ Premium access, or
 * suspend it (My List, continue watching, recommendations and Premium are
 * refused; the free servers still play, as they need no account).
 */
export function UsersPanel() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)

  // Search as the admin types, without a request per keystroke.
  useEffect(() => {
    const id = setTimeout(() => {
      setQuery(search.trim())
      setPage(0)
    }, 300)
    return () => clearTimeout(id)
  }, [search])

  const queryKey = ['admin-users', query, page] as const
  const { data, error, isLoading, isFetching, refetch } = useQuery({
    queryKey,
    queryFn: () => fetchAdminUsers({ q: query || undefined, offset: page * PAGE_SIZE, limit: PAGE_SIZE }),
    placeholderData: keepPreviousData,
    retry: false,
  })

  const mutation = useMutation({
    mutationFn: ({ id, change }: { id: string; change: { premiumAccess?: PremiumAccessLevel; suspended?: boolean } }) =>
      updateAdminUser(id, change),
    onSuccess: ({ user }, { change }) => {
      queryClient.setQueryData(queryKey, (old: typeof data) =>
        old ? { ...old, users: old.users.map((u) => (u.id === user.id ? user : u)) } : old
      )
      const who = user.email ?? user.name ?? 'Account'
      if (change.suspended !== undefined) toast.success(change.suspended ? `${who} suspended` : `${who} restored`)
      else toast.success(`${who}: Premium ${PREMIUM_LABELS[user.premiumAccess].toLowerCase()}`)
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Could not update the account'),
  })

  const migrationMissing = error instanceof AdminApiError && error.code === 'migration_required'
  const users = data?.users ?? []
  const total = data?.total ?? 0
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const busyId = mutation.isPending ? mutation.variables?.id : null

  return (
    <section aria-label="Users" className="mb-12">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-2xl font-bold">
          <Users className="h-6 w-6" aria-hidden="true" />
          Users
          {data && <span className="text-base font-normal text-muted-foreground">({total})</span>}
        </h2>
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <div className="relative flex-1 sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search email, name or id"
              aria-label="Search users"
              className="pl-9"
            />
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : 'Refresh'}
          </Button>
        </div>
      </div>

      {migrationMissing ? (
        <div role="alert" className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-5 text-sm">
          <p className="font-semibold">One-time setup needed</p>
          <p className="mt-1 text-muted-foreground">
            The database doesn't have the user-access columns yet. Open the Supabase SQL editor, paste in{' '}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">{MIGRATION_FILE}</code>, and run it. Then press Refresh.
          </p>
        </div>
      ) : error ? (
        <div role="alert" className="rounded-xl border bg-card/50 p-8 text-center text-sm text-muted-foreground">
          {error instanceof Error ? error.message : 'Could not load users'}
        </div>
      ) : isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-label="Loading users" />
        </div>
      ) : users.length === 0 ? (
        <div className="rounded-xl border bg-card/50 py-16 text-center text-muted-foreground">
          {query ? `No accounts match “${query}”` : 'No one has signed in yet'}
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Account</TableHead>
                  <TableHead>Last seen</TableHead>
                  <TableHead>Premium</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <UserRow
                    key={user.id}
                    user={user}
                    busy={busyId === user.id}
                    onChange={(change) => mutation.mutate({ id: user.id, change })}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
          {pages > 1 && (
            <nav aria-label="Users pages" className="mt-4 flex items-center justify-end gap-2 text-sm">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                Previous
              </Button>
              <span className="text-muted-foreground">
                Page {page + 1} of {pages}
              </span>
              <Button variant="outline" size="sm" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>
                Next
              </Button>
            </nav>
          )}
        </>
      )}
    </section>
  )
}

interface UserRowProps {
  user: AdminUser
  busy: boolean
  onChange: (change: { premiumAccess?: PremiumAccessLevel; suspended?: boolean }) => void
}

function UserRow({ user, busy, onChange }: UserRowProps) {
  const suspended = user.suspendedAt !== null
  const label = user.email ?? user.name ?? user.id

  return (
    <TableRow className={suspended ? 'opacity-70' : undefined}>
      <TableCell className="max-w-[16rem]">
        <p className="truncate font-medium">{user.name ?? user.email ?? 'Unknown account'}</p>
        <p className="truncate text-xs text-muted-foreground">{user.name && user.email ? user.email : user.id}</p>
      </TableCell>
      <TableCell className="whitespace-nowrap text-muted-foreground">{relativeTime(user.lastSeenAt)}</TableCell>
      <TableCell>
        <Select
          value={user.premiumAccess}
          onValueChange={(value) => onChange({ premiumAccess: value as PremiumAccessLevel })}
          disabled={busy}
        >
          <SelectTrigger className="h-8 w-32" aria-label={`Premium access for ${label}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(PREMIUM_LABELS) as PremiumAccessLevel[]).map((level) => (
              <SelectItem key={level} value={level}>
                {PREMIUM_LABELS[level]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        {suspended ? <Badge variant="destructive">Suspended</Badge> : <Badge variant="secondary">Active</Badge>}
      </TableCell>
      <TableCell className="text-right">
        <Button
          variant={suspended ? 'outline' : 'ghost'}
          size="sm"
          disabled={busy}
          onClick={() => onChange({ suspended: !suspended })}
          aria-label={`${suspended ? 'Restore' : 'Suspend'} ${label}`}
          className={suspended ? undefined : 'text-destructive hover:text-destructive'}
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : suspended ? (
            <>
              <RotateCcw className="mr-1.5 h-4 w-4" aria-hidden="true" />
              Restore
            </>
          ) : (
            <>
              <Ban className="mr-1.5 h-4 w-4" aria-hidden="true" />
              Suspend
            </>
          )}
        </Button>
      </TableCell>
    </TableRow>
  )
}
