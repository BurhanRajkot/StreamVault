import { useEffect, useState } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import { toast } from 'sonner'
import { CheckCircle2, ChevronDown, Loader2, Pause, Search, TriangleAlert, Zap } from 'lucide-react'
import {
  AdminApiError,
  fetchAdminSettings,
  fetchAdminUsers,
  getAdminToken,
  setPremiumPausedForAll,
  updateAdminUser,
  type AdminUser,
  type AdminUserChange,
  type PremiumAccessLevel,
} from '@/lib/api'
import { fetchDebridStatus } from '@/lib/debridApi'
import { cn } from '@/lib/utils'
import { IconTile, ListRow, ListSection, SegmentedControl, Switch } from '@app/components/kit'
import { EASE_OUT } from '@app/lib/motion'

/*
 * The admin dashboard's sections, built for the app: the same data and calls
 * as the website's cards (Real-Debrid status, the Premium switch, the Users
 * panel), laid out as grouped lists that work on a phone.
 */

// ── Premium server ──────────────────────────────────────────────────────────

export function PremiumServerSection() {
  const queryClient = useQueryClient()
  const status = useQuery({
    queryKey: ['debrid-status'],
    queryFn: () => fetchDebridStatus(getAdminToken() ?? undefined),
    staleTime: 60_000,
    retry: false,
  })
  const settings = useQuery({ queryKey: ['admin-settings'], queryFn: fetchAdminSettings, retry: false })
  const toggle = useMutation({
    mutationFn: setPremiumPausedForAll,
    onSuccess: (next) => {
      queryClient.setQueryData(['admin-settings'], next)
      toast.success(next.premiumPausedForAll ? 'Premium paused for everyone but you' : 'Premium is on for approved accounts')
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Could not change the setting'),
  })

  const data = status.data
  const working = !!data?.connected && data.premium
  const expires = data?.expiration ? new Date(data.expiration) : null
  const daysLeft = expires ? Math.ceil((expires.getTime() - Date.now()) / 86_400_000) : null
  const statusDetail = status.isError
    ? 'The status check failed — tap to try again.'
    : !data
      ? 'Checking…'
      : working
        ? expires
          ? `Premium until ${expires.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}${daysLeft !== null && daysLeft <= 14 ? ` · ${Math.max(daysLeft, 0)} days left` : ''}`
          : 'Connected and premium'
        : (data.note ?? 'Real-Debrid did not accept the server’s key.')

  const paused = settings.data?.premiumPausedForAll ?? false
  const migrationMissing = settings.error instanceof AdminApiError && settings.error.code === 'migration_required'

  return (
    <ListSection header="Premium server" footer="Pausing stops Premium for every account you approved at once. You keep it.">
      <ListRow
        onClick={() => void status.refetch()}
        accessory="none"
        icon={
          <IconTile color={working ? 'green' : data || status.isError ? 'orange' : 'gray'}>
            {!data && !status.isError ? <Loader2 className="animate-spin" /> : working ? <CheckCircle2 /> : <TriangleAlert />}
          </IconTile>
        }
        label={status.isError ? 'Couldn’t reach the server' : !data ? 'Real-Debrid' : working ? 'Real-Debrid working' : data.connected ? 'Connected, not usable' : 'Not connected'}
        detail={statusDetail}
        trailing={status.isFetching && data ? <Loader2 className="h-4 w-4 animate-spin text-label-2" /> : undefined}
      />
      <ListRow
        icon={
          <IconTile color={paused ? 'orange' : 'yellow'}>{paused ? <Pause className="fill-current" /> : <Zap className="fill-current" />}</IconTile>
        }
        label="Premium for approved accounts"
        detail={migrationMissing ? 'Run the user-access SQL in Supabase first.' : paused ? 'Paused for everyone but you' : 'On'}
        trailing={
          <Switch
            label="Premium for approved accounts"
            checked={!paused}
            onChange={(on) => !settings.isLoading && !migrationMissing && !toggle.isPending && toggle.mutate(!on)}
          />
        }
      />
    </ListSection>
  )
}

// ── Accounts ────────────────────────────────────────────────────────────────

const PAGE = 20

function ago(iso: string | null): string {
  if (!iso) return 'never'
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  const days = Math.round(hours / 24)
  return days < 30 ? `${days} d ago` : new Date(iso).toLocaleDateString()
}

export function AccountsSection() {
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [limit, setLimit] = useState(PAGE)
  const [open, setOpen] = useState<string | null>(null)

  useEffect(() => {
    const t = setTimeout(() => {
      setQuery(search.trim())
      setLimit(PAGE)
    }, 300)
    return () => clearTimeout(t)
  }, [search])

  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: ['admin-users', query, limit],
    queryFn: () => fetchAdminUsers({ q: query || undefined, limit }),
    placeholderData: keepPreviousData,
    retry: false,
  })
  const users = data?.users ?? []
  const migrationMissing = error instanceof AdminApiError && error.code === 'migration_required'

  return (
    <ListSection
      header={`Accounts${data ? ` · ${data.total}` : ''}`}
      footer="Tap an account to give or pause Premium, pause its Premium downloads, or suspend it."
    >
      <label className="flex items-center gap-2 px-4 py-2.5">
        <span className="flex h-9 flex-1 items-center gap-2 rounded-[10px] bg-fill px-2.5">
          <Search className="h-4 w-4 shrink-0 text-label-2" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search email or name"
            className="t-body h-full min-w-0 flex-1 bg-transparent caret-tint outline-none placeholder:text-label-2"
          />
          {isFetching && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-label-2" />}
        </span>
      </label>
      {isLoading ? (
        <div className="flex h-16 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-label-2" />
        </div>
      ) : migrationMissing ? (
        <ListRow label="Setup needed" detail="Run backend/supabase/migrations/20261115000000_user_access_controls.sql in the Supabase SQL editor." />
      ) : error ? (
        <ListRow label="Couldn’t load accounts" detail={error instanceof Error ? error.message : undefined} />
      ) : users.length === 0 ? (
        <ListRow label={query ? 'No account matches' : 'No one has signed in yet'} />
      ) : (
        <>
          {users.map((u) => (
            <AccountCell key={u.id} user={u} open={open === u.id} onToggle={() => setOpen((id) => (id === u.id ? null : u.id))} />
          ))}
          {data && users.length < data.total && (
            <ListRow onClick={() => setLimit((n) => n + PAGE)} label={`Show more (${data.total - users.length})`} tint accessory="none" />
          )}
        </>
      )}
    </ListSection>
  )
}

const ACCESS_LABEL: Record<PremiumAccessLevel, string> = { none: 'No access', granted: 'Allowed', paused: 'Paused' }

function AccountCell({ user, open, onToggle }: { user: AdminUser; open: boolean; onToggle: () => void }) {
  const queryClient = useQueryClient()
  const change = useMutation({
    mutationFn: (c: AdminUserChange) => updateAdminUser(user.id, c),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-users'] })
      void queryClient.invalidateQueries({ queryKey: ['admin-access-requests'] })
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Could not change the account'),
  })
  const suspended = !!user.suspendedAt
  const status = suspended
    ? { text: 'Suspended', cls: 'bg-ios-red/15 text-ios-red' }
    : user.premiumAccess === 'granted'
      ? { text: 'Premium', cls: 'bg-ios-yellow/15 text-ios-yellow' }
      : user.premiumAccess === 'paused'
        ? { text: 'Paused', cls: 'bg-ios-orange/15 text-ios-orange' }
        : null

  return (
    <div className="cell-sep-inset relative" style={{ '--sep-inset': '16px' } as React.CSSProperties}>
      <button type="button" onClick={onToggle} aria-expanded={open} className="tap flex w-full items-center gap-3 px-4 py-2.5 text-left">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#3a3a3c] text-[14px] font-semibold uppercase">
          {(user.name || user.email || '?').slice(0, 1)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="t-body block truncate">{user.email || user.name || user.id}</span>
          <span className="t-footnote block truncate text-label-2">Seen {ago(user.lastSeenAt)}</span>
        </span>
        {change.isPending && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-label-2" />}
        {status && <span className={cn('shrink-0 rounded-full px-2 py-[2px] text-[12px] font-semibold', status.cls)}>{status.text}</span>}
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-label-3 transition-transform duration-300', open && 'rotate-180')} strokeWidth={2.6} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: EASE_OUT }}
            className="overflow-hidden"
          >
            <div className="mx-4 mb-3 flex flex-col gap-3 rounded-[12px] bg-fill-2 p-3">
              <div>
                <p className="t-footnote mb-1.5 text-label-2">Premium</p>
                <SegmentedControl
                  size="sm"
                  layoutId={`access-${user.id}`}
                  options={(['none', 'granted', 'paused'] as PremiumAccessLevel[]).map((id) => ({ id, label: ACCESS_LABEL[id] }))}
                  value={user.premiumAccess}
                  onChange={(premiumAccess) => change.mutate({ premiumAccess })}
                />
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>
                  <span className="t-subhead block">Premium downloads</span>
                  <span className="t-footnote block text-label-2">Save or open the file in another player</span>
                </span>
                <Switch label={`Premium downloads for ${user.email ?? user.id}`} checked={user.debridDownloads} onChange={(debridDownloads) => change.mutate({ debridDownloads })} />
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>
                  <span className="t-subhead block">Suspended</span>
                  <span className="t-footnote block text-label-2">No list, history or Premium; free servers still play</span>
                </span>
                <Switch label={`Suspend ${user.email ?? user.id}`} checked={suspended} onChange={(s) => change.mutate({ suspended: s })} />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
