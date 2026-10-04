/**
 * DebridSearch — search movies & TV shows and play them via Real-Debrid
 *
 * Flow:
 *   User types title → backend queries apibay.org for hashes
 *   → "Play" adds the release to Real-Debrid: cached ones come back ready
 *     and open in the player; anything else starts downloading on
 *     Real-Debrid and shows up in the Real-Debrid Cloud tab when done.
 *   → "Add" does the same without opening the player.
 *
 * Real-Debrid has no cache-check endpoint any more, so there's no
 * "instant" badge here — the title-matched player (DebridPlayerPane) gets
 * cache status from Torrentio instead.
 */

import { useState, useRef, useCallback } from 'react'
import {
  searchDebrid,
  playDebridRelease,
  parseTorrentQuality,
  qualityColorClass,
  parseTorrentSource,
  parseTorrentHDR,
  formatBytes,
  type DebridRelease,
  type DebridReadyPlayback,
} from '@/lib/debridApi'
import {
  Search,
  Plus,
  Loader2,
  Play,
  Magnet,
  Tv2,
  Film,
  SlidersHorizontal,
  CheckCircle2,
  AlertCircle,
  Clock,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import VideoPlayerModal from '@/components/media/VideoPlayerModal'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Category = { label: string; value: number; icon: React.ReactNode }

const CATEGORIES: Category[] = [
  { label: 'All', value: 0, icon: <SlidersHorizontal className="h-3.5 w-3.5" /> },
  { label: 'Movies', value: 207, icon: <Film className="h-3.5 w-3.5" /> },
  { label: 'TV', value: 208, icon: <Tv2 className="h-3.5 w-3.5" /> },
]

// ---------------------------------------------------------------------------
// Result card
// ---------------------------------------------------------------------------

interface ResultCardProps {
  result: DebridRelease
  token: string
  onAdded: (hash: string) => void
  onPlay: (playback: DebridReadyPlayback) => void
}

function ResultCard({ result, token, onAdded, onPlay }: ResultCardProps) {
  const [streamLoading, setStreamLoading] = useState(false)
  const [addLoading, setAddLoading] = useState(false)
  const [addedHash, setAddedHash] = useState<string | null>(null)

  const quality = parseTorrentQuality(result.name)
  const source = parseTorrentSource(result.name)
  const hdr = parseTorrentHDR(result.name)
  const seeders = parseInt(result.seeders, 10)
  const sizeNum = parseInt(result.size, 10)

  /** Add the release to Real-Debrid (or reuse it), and report what happened. */
  const addToDebrid = async () => {
    const res = await playDebridRelease(result, token)
    setAddedHash(result.info_hash)
    onAdded(result.info_hash)
    return res
  }

  const handleStream = async () => {
    setStreamLoading(true)
    try {
      const res = await addToDebrid()
      if (res.status === 'ready') {
        onPlay(res)
      } else if (res.status === 'downloading') {
        toast.info(
          `Not cached — Real-Debrid is downloading it (${Math.round(res.progress)}%). It'll be in the Real-Debrid Cloud tab when done.`,
          { duration: 6000 }
        )
      } else {
        toast.error(res.status === 'failed' ? res.reason : 'Real-Debrid could not add this release')
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Could not get stream URL')
    } finally {
      setStreamLoading(false)
    }
  }

  const handleAdd = async () => {
    setAddLoading(true)
    try {
      const res = await addToDebrid()
      if (res.status === 'failed') {
        toast.error(res.reason)
      } else {
        toast.success(
          res.status === 'ready' ? `"${result.name}" is ready in Real-Debrid` : `Added "${result.name}" to Real-Debrid`,
          { duration: 3000 }
        )
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to add torrent')
    } finally {
      setAddLoading(false)
    }
  }

  const isAdded = addedHash === result.info_hash

  return (
    <div
      className={cn(
        'group relative flex flex-col gap-3 overflow-hidden rounded-xl border p-4',
        'bg-card/60 backdrop-blur-sm transition-all duration-300',
        'border-border/50 hover:border-border hover:shadow-md'
      )}
    >
      {/* Header: name + badges */}
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5 mb-1">
            {/* Quality */}
            <span className={cn(
              'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold',
              qualityColorClass(quality)
            )}>
              {quality}
            </span>
            {/* Source */}
            {source && (
              <span className="inline-flex items-center rounded-full border border-border/40 bg-secondary/50 px-2 py-0.5 text-[10px] text-muted-foreground">
                {source}
              </span>
            )}
            {/* HDR */}
            {hdr && (
              <span className="inline-flex items-center rounded-full border border-amber-400/20 bg-amber-400/10 px-2 py-0.5 text-[10px] font-bold text-amber-400">
                {hdr}
              </span>
            )}
          </div>

          <p className="line-clamp-2 text-sm font-medium text-foreground leading-snug">
            {result.name}
          </p>
        </div>
      </div>

      {/* Meta row */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {sizeNum > 0 && (
          <span className="flex items-center gap-1">
            <span className="opacity-60">Size</span> {formatBytes(sizeNum)}
          </span>
        )}
        <span className={cn(
          'flex items-center gap-1',
          seeders > 50 ? 'text-emerald-400' : seeders > 10 ? 'text-amber-400' : 'text-red-400'
        )}>
          <span className="opacity-70">Seeds</span> {result.seeders}
        </span>
        {result.num_files !== '1' && (
          <span>{result.num_files} files</span>
        )}
        {result.imdb && (
          <a
            href={`https://imdb.com/title/${result.imdb}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-amber-400 hover:underline"
          >
            IMDb
          </a>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2">
        <div className="flex flex-1 items-center gap-2">
          <button
            id={`debrid-stream-search-${result.info_hash}`}
            data-testid="debrid-search-play"
            onClick={handleStream}
            disabled={streamLoading}
            className={cn(
              'flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-sm font-semibold',
              'bg-gradient-to-r from-violet-600 to-primary text-white',
              'hover:from-violet-500 hover:to-primary/90 hover:shadow-lg hover:shadow-primary/20',
              'disabled:opacity-60 disabled:cursor-not-allowed',
              'transition-all duration-200 active:scale-[0.98]'
            )}
          >
            {streamLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4 fill-white" />}
            {streamLoading ? 'Preparing…' : 'Play'}
          </button>
          <button
            id={`debrid-add-${result.info_hash}`}
            onClick={handleAdd}
            disabled={addLoading || isAdded}
            title={isAdded ? 'Added to Real-Debrid' : 'Save to Real-Debrid Cloud'}
            className={cn(
              'flex items-center justify-center rounded-lg px-3 py-2 text-sm font-medium border transition-all duration-200',
              isAdded
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                : 'bg-secondary/60 text-muted-foreground border-border/40 hover:text-foreground hover:bg-secondary'
            )}
          >
            {addLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : isAdded ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
          </button>
        </div>

        {/* Hash copy */}
        <button
          title={`Hash: ${result.info_hash}`}
          onClick={() => {
            void navigator.clipboard.writeText(result.info_hash)
            toast.success('Hash copied!')
          }}
          className="rounded-lg border border-border/40 bg-secondary/40 p-2 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
        >
          <Magnet className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main DebridSearch component
// ---------------------------------------------------------------------------

interface DebridSearchProps {
  token: string
}

export default function DebridSearch({ token }: DebridSearchProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<DebridRelease[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searched, setSearched] = useState(false)
  const [cat, setCat] = useState(0)
  const [addedHashes, setAddedHashes] = useState<Set<string>>(new Set())
  const [playerModal, setPlayerModal] = useState<DebridReadyPlayback | null>(null)

  const abortRef = useRef<AbortController | null>(null)

  const doSearch = useCallback(async (q: string, category: number) => {
    if (!q.trim() || q.trim().length < 2) return

    // Cancel any in-flight search
    abortRef.current?.abort()
    abortRef.current = new AbortController()

    setLoading(true)
    setError(null)
    setSearched(true)

    try {
      const data = await searchDebrid(q.trim(), token, { limit: 20, cat: category })
      setResults([...data].sort((a, b) => parseInt(b.seeders, 10) - parseInt(a.seeders, 10)))
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return
      setError(err instanceof Error ? err.message : 'Search failed')
    } finally {
      setLoading(false)
    }
  }, [token])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    void doSearch(query, cat)
  }

  const handleCategoryChange = (newCat: number) => {
    setCat(newCat)
    if (query.trim().length >= 2) {
      void doSearch(query, newCat)
    }
  }

  return (
    <div className="space-y-5">
      {/* Hero search bar */}
      <div className="relative overflow-hidden rounded-2xl border border-border/40 bg-gradient-to-br from-card/80 via-card/60 to-secondary/30 p-6 backdrop-blur-sm">
        <div className="absolute inset-0 bg-gradient-to-br from-violet-600/5 via-transparent to-primary/5" />

        <div className="relative">
          <h2 className="mb-1 text-lg font-bold text-foreground">Debrid Search</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            Search movies & TV shows. Cached releases play instantly; others download on Real-Debrid first.
          </p>

          <form onSubmit={handleSubmit} className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                id="debrid-search-input"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="e.g. Inception 2010, Breaking Bad S05..."
                className={cn(
                  'h-11 w-full rounded-xl border border-border/50 bg-background/60 pl-10 pr-4',
                  'text-sm placeholder:text-muted-foreground/50',
                  'focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary',
                  'transition-all duration-200'
                )}
              />
            </div>
            <button
              type="submit"
              id="debrid-search-submit"
              disabled={loading || query.trim().length < 2}
              className={cn(
                'flex h-11 items-center gap-2 rounded-xl px-5 text-sm font-semibold',
                'bg-gradient-to-r from-violet-600 to-primary text-white',
                'hover:from-violet-500 hover:to-primary/90',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                'transition-all duration-200 active:scale-[0.97]'
              )}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              {loading ? 'Searching…' : 'Search'}
            </button>
          </form>

          {/* Category filter */}
          <div className="mt-3 flex gap-1.5">
            {CATEGORIES.map((c) => (
              <button
                key={c.value}
                id={`debrid-cat-${c.value}`}
                onClick={() => handleCategoryChange(c.value)}
                className={cn(
                  'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all duration-200',
                  cat === c.value
                    ? 'bg-primary/15 text-primary border border-primary/20'
                    : 'text-muted-foreground hover:bg-secondary hover:text-foreground border border-transparent'
                )}
              >
                {c.icon}
                {c.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Results header */}
      {searched && !loading && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {results.length === 0
              ? 'No results found'
              : (
                <>
                  <span className="font-semibold text-foreground">{results.length}</span> results
                </>
              )}
          </p>
          {addedHashes.size > 0 && (
            <span className="text-xs text-emerald-400">{addedHashes.size} added to Real-Debrid</span>
          )}
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="flex items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
          <AlertCircle className="h-5 w-5 flex-shrink-0 text-destructive" />
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="grid gap-3 sm:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="animate-pulse rounded-xl border border-border/30 bg-card/40 p-4 space-y-3">
              <div className="flex gap-2">
                <div className="h-4 w-14 rounded-full bg-secondary" />
                <div className="h-4 w-12 rounded-full bg-secondary" />
              </div>
              <div className="h-4 w-3/4 rounded bg-secondary" />
              <div className="h-3 w-1/2 rounded bg-secondary/60" />
              <div className="h-9 w-full rounded-lg bg-secondary" />
            </div>
          ))}
        </div>
      )}

      {/* Idle state */}
      {!searched && !loading && (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-center text-muted-foreground">
          <div className="rounded-2xl border border-dashed border-border/50 p-8">
            <Search className="mx-auto mb-3 h-10 w-10 opacity-30" />
            <p className="text-sm font-medium">Search for any movie or TV show</p>
            <p className="mt-1 text-xs opacity-60">Best-seeded releases first</p>
          </div>
          <div className="flex flex-wrap justify-center gap-2 text-xs">
            {['Inception 2010', 'Breaking Bad', 'Dune Part Two', 'The Wire'].map((s) => (
              <button
                key={s}
                onClick={() => { setQuery(s); void doSearch(s, cat) }}
                className="rounded-full border border-border/40 bg-secondary/40 px-3 py-1 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Results grid */}
      {!loading && results.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {results.map((result) => (
            <ResultCard
              key={result.info_hash + result.id}
              result={result}
              token={token}
              onAdded={(hash) => setAddedHashes((prev) => new Set([...prev, hash]))}
              onPlay={setPlayerModal}
            />
          ))}
        </div>
      )}

      {/* Video Player Modal */}
      {playerModal && (
        <VideoPlayerModal
          open={!!playerModal}
          onOpenChange={(open) => {
            if (!open) setPlayerModal(null)
          }}
          source={{ kind: 'playback', playback: playerModal }}
          fileName={playerModal.fileName}
          token={token}
        />
      )}

      {/* Info footer */}
      {searched && !loading && results.length > 0 && (
        <p className="text-center text-xs text-muted-foreground/60">
          <Clock className="inline h-3 w-3 mr-1" />
          Results from Pirate Bay index · played and stored via Real-Debrid
        </p>
      )}
    </div>
  )
}
