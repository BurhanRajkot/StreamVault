/**
 * TorboxLibrary — cloud debrid library panel
 *
 * Displays the user's TorBox active torrents with per-file stream buttons.
 * Requires either an Auth0 access token or an admin token.
 */

import { useState, useEffect, useMemo } from 'react'
import {
  fetchTorboxList,
  formatBytes,
  torboxStateLabel,
  type TorboxTorrent,
  type TorboxFile,
} from '@/lib/torboxApi'
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
  file: TorboxFile
  torrentId: number
  token: string
}

function FileBadge({ file, torrentId, token }: FileBadgeProps) {
  const [playerOpen, setPlayerOpen] = useState(false)

  const isVideo =
    file.mimetype.startsWith('video/') || /\.(mp4|mkv|avi|mov|m4v|wmv|webm)$/i.test(file.name)

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
          {isVideo ? (
            <Play className="h-3.5 w-3.5 text-primary" />
          ) : (
            <HardDrive className="h-3.5 w-3.5" />
          )}
        </div>

        {/* Name + size */}
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium text-foreground">{file.short_name || file.name}</p>
          <p className="text-[10px] text-muted-foreground">{formatBytes(file.size)}</p>
        </div>

        {/* Stream button */}
        <button
          id={`torbox-stream-${torrentId}-${file.id}`}
          onClick={() => setPlayerOpen(true)}
          aria-label={`Stream ${file.short_name || file.name}`}
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
      </div>

      <VideoPlayerModal
        open={playerOpen}
        onOpenChange={setPlayerOpen}
        torrentId={torrentId}
        fileId={file.id}
        fileName={file.short_name || file.name}
        token={token}
      />
    </>
  )
}

// ---------------------------------------------------------------------------
// Torrent card
// ---------------------------------------------------------------------------

interface TorrentCardProps {
  torrent: TorboxTorrent
  token: string
}

function TorrentCard({ torrent, token }: TorrentCardProps) {
  const [expanded, setExpanded] = useState(false)
  const { label, colorClass } = torboxStateLabel(torrent.download_state)
  const progress = Math.min(100, Math.round(torrent.progress))
  const isReady = torrent.download_finished || torrent.cached

  // Only show video files by default; reveal all when expanded
  const videoFiles = torrent.files.filter(
    (f) => f.mimetype.startsWith('video/') || /\.(mp4|mkv|avi|mov|m4v|wmv|webm)$/i.test(f.name)
  )
  const displayFiles = expanded ? torrent.files : (videoFiles.length ? videoFiles : torrent.files.slice(0, 3))

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
          {/* Cached / seeding badge */}
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
              {torrent.name}
            </h3>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
              <span className={cn('font-medium', colorClass)}>{label}</span>
              <span>{formatBytes(torrent.size)}</span>
              {torrent.seeds > 0 && <span>{torrent.seeds} seeds</span>}
            </div>
          </div>

          {/* Expand toggle */}
          {torrent.files.length > 0 && (
            <button
              id={`torbox-expand-${torrent.id}`}
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
        {(expanded || (isReady && displayFiles.length > 0)) && displayFiles.length > 0 && (
          <div className="mt-3 space-y-1.5">
            {displayFiles.map((file) => (
              <FileBadge key={file.id} file={file} torrentId={torrent.id} token={token} />
            ))}
            {!expanded && torrent.files.length > displayFiles.length && (
              <button
                onClick={() => setExpanded(true)}
                className="w-full rounded-lg border border-dashed border-border/50 py-2 text-xs text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors"
              >
                +{torrent.files.length - displayFiles.length} more files
              </button>
            )}
          </div>
        )}

        {/* If ready but no files yet fetched, show stream all button */}
        {isReady && torrent.files.length === 0 && (
          <p className="mt-2 text-xs text-muted-foreground italic">No file list available yet.</p>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main TorboxLibrary component
// ---------------------------------------------------------------------------

interface TorboxLibraryProps {
  token: string
}

export default function TorboxLibrary({ token }: TorboxLibraryProps) {
  const [torrents, setTorrents] = useState<TorboxTorrent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'ready' | 'downloading'>('all')

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await fetchTorboxList(token)
      if (!result.success) {
        setError(result.detail || 'Failed to load TorBox library')
      } else {
        setTorrents(result.data ?? [])
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load TorBox library')
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
      list = list.filter((t) => t.download_finished || t.cached)
    } else if (filter === 'downloading') {
      list = list.filter((t) => !t.download_finished && !t.cached)
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter((t) => t.name.toLowerCase().includes(q))
    }
    return list
  }, [torrents, filter, search])

  // Stats
  const readyCount = torrents.filter((t) => t.download_finished || t.cached).length
  const dlCount = torrents.length - readyCount

  // ---------------------------------------------------------------------------
  // Loading state
  // ---------------------------------------------------------------------------
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20 text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm">Loading TorBox library…</p>
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
        <p className="text-sm font-medium text-foreground">TorBox Library Unavailable</p>
        <p className="max-w-sm text-xs text-muted-foreground">{error}</p>
        <button
          id="torbox-retry"
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
        <p className="text-sm font-medium">Your TorBox library is empty</p>
        <p className="max-w-xs text-xs opacity-60">
          Add content to TorBox at{' '}
          <a
            href="https://torbox.app"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            torbox.app
          </a>{' '}
          and it will appear here instantly.
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
              id={`torbox-filter-${key}`}
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
          id="torbox-refresh"
          onClick={load}
          aria-label="Refresh TorBox library"
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
