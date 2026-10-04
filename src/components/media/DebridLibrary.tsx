/**
 * DebridLibrary — Real-Debrid cloud library panel
 *
 * Displays the shared Real-Debrid account's torrents with per-file stream
 * buttons. File lists are loaded when a card is expanded (Real-Debrid's list
 * endpoint doesn't include them). Requires either an Auth0 access token or
 * an admin token.
 */

import { useState, useEffect, useMemo } from 'react'
import {
  fetchDebridTorrents,
  fetchDebridTorrent,
  formatBytes,
  debridStatusLabel,
  fileBaseName,
  isVideoPath,
  type DebridTorrent,
  type DebridTorrentFile,
} from '@/lib/debridApi'
import {
  Cloud,
  Play,
  ChevronDown,
  ChevronRight,
  Loader2,
  RefreshCw,
  Zap,
  HardDrive,
  Wifi,
  AlertCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import VideoPlayerModal from '@/components/media/VideoPlayerModal'

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface FileBadgeProps {
  file: DebridTorrentFile
  torrentId: string
  token: string
}

function FileBadge({ file, torrentId, token }: FileBadgeProps) {
  const [playerOpen, setPlayerOpen] = useState(false)
  const name = fileBaseName(file.path)
  const isVideo = isVideoPath(file.path)

  return (
    <>
      <div
        className={cn(
          'group flex items-center gap-3 rounded-lg border border-border/40 bg-secondary/30 px-3 py-2.5',
          'transition-all duration-200 hover:border-primary/40 hover:bg-secondary/60'
        )}
      >
        {/* File icon */}
        <div className="flex-shrink-0 text-muted-foreground">
          {isVideo ? <Play className="h-3.5 w-3.5 text-primary" /> : <HardDrive className="h-3.5 w-3.5" />}
        </div>

        {/* Name + size */}
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium text-foreground">{name}</p>
          <p className="text-[10px] text-muted-foreground">{formatBytes(file.bytes)}</p>
        </div>

        {/* Stream button */}
        {isVideo && (
          <button
            id={`debrid-stream-${torrentId}-${file.id}`}
            data-testid="debrid-library-stream"
            onClick={() => setPlayerOpen(true)}
            aria-label={`Stream ${name}`}
            className={cn(
              'flex-shrink-0 flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold',
              'bg-primary/10 text-primary border border-primary/20',
              'hover:bg-primary hover:text-primary-foreground hover:border-primary',
              'transition-all duration-200 active:scale-95'
            )}
          >
            <Play className="h-3 w-3" />
            Stream
          </button>
        )}
      </div>

      {playerOpen && (
        <VideoPlayerModal
          open={playerOpen}
          onOpenChange={setPlayerOpen}
          source={{ kind: 'file', torrentId, fileId: file.id }}
          fileName={name}
          token={token}
        />
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Torrent card
// ---------------------------------------------------------------------------

interface TorrentCardProps {
  torrent: DebridTorrent
  token: string
}

function TorrentCard({ torrent, token }: TorrentCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [files, setFiles] = useState<DebridTorrentFile[] | null>(null)
  const [filesError, setFilesError] = useState<string | null>(null)
  const { label, colorClass } = debridStatusLabel(torrent.status)
  const progress = Math.min(100, Math.round(torrent.progress))
  const isReady = torrent.status === 'downloaded'

  // Real-Debrid's list has no file names — fetch them the first time the card opens.
  useEffect(() => {
    if (!expanded || files) return
    let cancelled = false
    fetchDebridTorrent(torrent.id, token)
      .then((info) => {
        if (!cancelled) setFiles(info.files.filter((f) => f.selected === 1))
      })
      .catch((err: unknown) => {
        if (!cancelled) setFilesError(err instanceof Error ? err.message : 'Could not load files')
      })
    return () => {
      cancelled = true
    }
  }, [expanded, files, torrent.id, token])

  const displayFiles = files
    ? [...files].sort((a, b) => Number(isVideoPath(b.path)) - Number(isVideoPath(a.path)) || a.id - b.id)
    : []

  return (
    <div
      className={cn(
        'group relative overflow-hidden rounded-xl border border-border/50 bg-card/60 backdrop-blur-sm',
        'transition-all duration-300 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5'
      )}
    >
      {/* Gradient accent bar */}
      <div
        className="absolute left-0 top-0 h-0.5 w-full bg-gradient-to-r from-violet-500 via-primary to-sky-500 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
      />

      <div className="p-4">
        {/* Header row */}
        <div className="flex items-start gap-3">
          {/* Ready / downloading badge */}
          <div
            className={cn(
              'mt-0.5 flex-shrink-0 rounded-md p-1.5',
              isReady ? 'bg-emerald-500/10 text-emerald-400' : 'bg-sky-500/10 text-sky-400'
            )}
          >
            {isReady ? <Zap className="h-4 w-4" /> : <Wifi className="h-4 w-4" />}
          </div>

          <div className="min-w-0 flex-1">
            <h3 className="line-clamp-2 text-sm font-semibold text-foreground leading-snug">
              {torrent.filename}
            </h3>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
              <span className={cn('font-medium', colorClass)}>{label}</span>
              <span>{formatBytes(torrent.bytes)}</span>
              {!!torrent.seeders && <span>{torrent.seeders} seeds</span>}
            </div>
          </div>

          {/* Expand toggle */}
          {isReady && (
            <button
              id={`debrid-expand-${torrent.id}`}
              onClick={() => setExpanded((v) => !v)}
              aria-label={expanded ? 'Collapse files' : 'Show files'}
              className="flex-shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
            >
              {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
          )}
        </div>

        {/* Progress bar (only when actively downloading) */}
        {!isReady && progress > 0 && (
          <div className="mt-3">
            <div className="mb-1 flex justify-between text-[10px] text-muted-foreground">
              <span>Progress</span>
              <span>{progress}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-gradient-to-r from-sky-500 to-primary transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Files list */}
        {expanded && (
          <div className="mt-3 space-y-1.5">
            {!files && !filesError && (
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> Loading files…
              </p>
            )}
            {filesError && <p className="text-xs text-destructive">{filesError}</p>}
            {displayFiles.map((file) => (
              <FileBadge key={file.id} file={file} torrentId={torrent.id} token={token} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main DebridLibrary component
// ---------------------------------------------------------------------------

interface DebridLibraryProps {
  token: string
}

export default function DebridLibrary({ token }: DebridLibraryProps) {
  const [torrents, setTorrents] = useState<DebridTorrent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'ready' | 'downloading'>('all')

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      setTorrents(await fetchDebridTorrents(token, 200))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load Real-Debrid library')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  const filtered = useMemo(() => {
    let list = torrents
    if (filter === 'ready') {
      list = list.filter((t) => t.status === 'downloaded')
    } else if (filter === 'downloading') {
      list = list.filter((t) => t.status !== 'downloaded')
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter((t) => t.filename.toLowerCase().includes(q))
    }
    return list
  }, [torrents, filter, search])

  // Stats
  const readyCount = torrents.filter((t) => t.status === 'downloaded').length
  const dlCount = torrents.length - readyCount

  // ---------------------------------------------------------------------------
  // Loading state
  // ---------------------------------------------------------------------------
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20 text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm">Loading Real-Debrid library…</p>
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Error state
  // ---------------------------------------------------------------------------
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
        <div className="rounded-full bg-destructive/10 p-4">
          <AlertCircle className="h-8 w-8 text-destructive" />
        </div>
        <p className="text-sm font-medium text-foreground">Real-Debrid Library Unavailable</p>
        <p className="max-w-sm text-xs text-muted-foreground">{error}</p>
        <button
          id="debrid-retry"
          onClick={load}
          className="mt-2 flex items-center gap-2 rounded-lg bg-secondary px-4 py-2 text-sm font-medium text-foreground hover:bg-secondary/80 transition-colors"
        >
          <RefreshCw className="h-4 w-4" />
          Retry
        </button>
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Empty state
  // ---------------------------------------------------------------------------
  if (torrents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20 text-center text-muted-foreground">
        <div className="rounded-full border border-dashed border-border/60 p-6">
          <Cloud className="h-10 w-10 opacity-40" />
        </div>
        <p className="text-sm font-medium">Your Real-Debrid library is empty</p>
        <p className="max-w-xs text-xs opacity-60">
          Play something with the Real-Debrid server, or add it from the Debrid Search tab, and it will appear
          here.
        </p>
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Main view
  // ---------------------------------------------------------------------------
  return (
    <div className="space-y-5">
      {/* Stats row + refresh */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {/* Filter pills */}
          {(
            [
              { key: 'all', label: `All (${torrents.length})` },
              { key: 'ready', label: `Ready ⚡ (${readyCount})` },
              { key: 'downloading', label: `Active (${dlCount})` },
            ] as const
          ).map(({ key, label }) => (
            <button
              key={key}
              id={`debrid-filter-${key}`}
              onClick={() => setFilter(key)}
              className={cn(
                'rounded-full px-3 py-1 text-xs font-medium transition-all duration-200',
                filter === key
                  ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/20'
                  : 'bg-secondary text-muted-foreground hover:bg-secondary/80 hover:text-foreground'
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Refresh */}
        <button
          id="debrid-refresh"
          onClick={load}
          aria-label="Refresh Real-Debrid library"
          className="flex items-center gap-1.5 rounded-lg border border-border/50 bg-secondary/40 px-3 py-1.5 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </button>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search library…"
          className="h-9 w-full rounded-lg border border-border/50 bg-secondary/60 pl-3 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all"
        />
      </div>

      {/* Torrent grid */}
      {filtered.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-8">
          No torrents match your filter.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((torrent) => (
            <TorrentCard key={torrent.id} torrent={torrent} token={token} />
          ))}
        </div>
      )}
    </div>
  )
}
