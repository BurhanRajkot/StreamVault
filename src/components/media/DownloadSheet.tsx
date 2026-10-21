/**
 * DownloadSheet — save a film or an episode without playing it first.
 *
 * Lists the releases Premium (Real-Debrid) can hand over at once, and when
 * the viewer picks one, has the backend prepare it (the same call that
 * starts playback) and offers its direct link. The link is a real anchor the
 * viewer taps, not a scripted download: a download started from script after
 * an await is no longer a user gesture, and phones block it.
 *
 * A bottom sheet on a phone, a dialog on a wider screen.
 */

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useAuth0 } from '@auth0/auth0-react'
import { Link } from 'react-router-dom'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { AlertTriangle, Check, Download, Loader2, X } from 'lucide-react'
import {
  DebridRequestError,
  formatBytes,
  isImaxRelease,
  parseTorrentHDR,
  parseTorrentQuality,
  playDebridRelease,
  searchDebridMedia,
  type DebridRelease,
} from '@/lib/debridApi'
import { getAdminToken } from '@/lib/api'
import { cn } from '@/lib/utils'

export interface DownloadTarget {
  title: string
  year?: string | number
  imdbId?: string | null
  mediaType: 'movie' | 'tv'
  season?: number
  episode?: number
  /** Shown under the heading — "S1 · E3 · Lord Snow". */
  label?: string
}

interface DownloadSheetProps {
  target: DownloadTarget | null
  onOpenChange: (open: boolean) => void
}

/** Releases offered. More is a wall of near-identical 1080p rows. */
const MAX_OFFERED = 8

/**
 * Quality order offered: 1080p first — the size most people want on a phone
 * or laptop — then 4K, then smaller.
 */
const QUALITY_RANK: Record<string, number> = { '1080p': 0, '4K': 1, '720p': 2, '480p': 3 }

/** Per quality, so a list of eight isn't eight 4K remuxes. */
const MAX_PER_QUALITY = 3

interface Offer {
  release: DebridRelease
  label: string
  tags: string[]
  /** The release's size — left out for a season pack, where only the one episode is saved. */
  size: string | null
}

/** A show's release that holds a whole season (or more) rather than this one episode. */
function isSeasonPack(name: string): boolean {
  return !/S\d{1,2}[ ._-]?E\d{1,3}|\b\d{1,2}x\d{2}\b/i.test(name)
}

function toOffer(release: DebridRelease, mediaType: 'movie' | 'tv'): Offer {
  const bytes = parseInt(release.size, 10)
  const pack = mediaType === 'tv' && isSeasonPack(release.name)
  return {
    release,
    label: parseTorrentQuality(release.name),
    tags: [parseTorrentHDR(release.name), isImaxRelease(release.name) ? 'IMAX' : null, pack ? 'From season pack' : null].filter(
      (t): t is string => !!t
    ),
    size: !pack && Number.isFinite(bytes) && bytes > 0 ? formatBytes(bytes) : null,
  }
}

function rankOffers(releases: DebridRelease[], mediaType: 'movie' | 'tv'): Offer[] {
  // Only what's ready now — anything else would sit in Premium's queue first
  const cached = releases.filter((r) => r.cached)
  const pool = cached.length > 0 ? cached : releases.filter((r) => parseInt(r.seeders, 10) > 0).slice(0, 5)
  const sorted = pool
    .map((r) => toOffer(r, mediaType))
    .sort(
      (a, b) =>
        (QUALITY_RANK[a.label] ?? 9) - (QUALITY_RANK[b.label] ?? 9) ||
        // A single-episode file before a season pack
        Number(a.tags.includes('From season pack')) - Number(b.tags.includes('From season pack')) ||
        parseInt(b.release.seeders, 10) - parseInt(a.release.seeders, 10)
    )
  const perQuality = new Map<string, number>()
  return sorted
    .filter((offer) => {
      const seen = perQuality.get(offer.label) ?? 0
      perQuality.set(offer.label, seen + 1)
      return seen < MAX_PER_QUALITY
    })
    .slice(0, MAX_OFFERED)
}

type Prepared =
  | { state: 'preparing' }
  | { state: 'ready'; url: string; fileName: string; size: string | null }
  | { state: 'failed'; message: string }

type Listing =
  | { state: 'searching' }
  | { state: 'ready'; offers: Offer[] }
  | { state: 'empty' }
  | { state: 'sign-in' }
  | { state: 'error'; message: string }

export function DownloadSheet({ target, onOpenChange }: DownloadSheetProps) {
  const open = target !== null
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="animate-fade fixed inset-0 z-[180] bg-black/70" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className={cn(
            'dark fixed z-[190] flex max-h-[85svh] flex-col overflow-hidden bg-neutral-900 text-white shadow-2xl ring-1 ring-white/10 focus:outline-none',
            // Phone: a sheet from the bottom edge
            'inset-x-0 bottom-0 rounded-t-2xl pb-[env(safe-area-inset-bottom,0px)] max-md:animate-slide-up',
            // Wider: a dialog in the middle
            'md:inset-x-auto md:bottom-auto md:left-1/2 md:top-1/2 md:w-[min(30rem,calc(100vw-2rem))] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-2xl'
          )}
        >
          {target && <SheetBody key={`${target.mediaType}:${target.imdbId}:${target.season}:${target.episode}`} target={target} />}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

function SheetBody({ target }: { target: DownloadTarget }) {
  const { isAuthenticated, getAccessTokenSilently } = useAuth0()
  const [listing, setListing] = useState<Listing>({ state: 'searching' })
  const [prepared, setPrepared] = useState<Record<string, Prepared>>({})

  const getToken = useCallback(async () => {
    try {
      const admin = getAdminToken()
      if (admin) return admin
      if (isAuthenticated) return await getAccessTokenSilently()
    } catch {
      // Guest, or a silent-token hiccup — the free period needs no token
    }
    return undefined
  }, [isAuthenticated, getAccessTokenSilently])

  const { title, year, imdbId, mediaType, season, episode } = target

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const token = await getToken()
        const cleanTitle = title.replace(/[^a-zA-Z0-9\s]/g, ' ').trim()
        const releases = await searchDebridMedia(year ? `${cleanTitle} ${year}` : cleanTitle, imdbId ?? undefined, mediaType, token, {
          season,
          episode,
          limit: 25,
        })
        if (cancelled) return
        const offers = rankOffers(releases, mediaType)
        setListing(offers.length > 0 ? { state: 'ready', offers } : { state: 'empty' })
      } catch (err: unknown) {
        if (cancelled) return
        if (err instanceof DebridRequestError && (err.status === 401 || err.status === 403)) setListing({ state: 'sign-in' })
        else setListing({ state: 'error', message: err instanceof Error ? err.message : 'Search failed' })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [title, year, imdbId, mediaType, season, episode, getToken])

  const prepare = async (offer: Offer) => {
    const id = offer.release.info_hash
    setPrepared((p) => ({ ...p, [id]: { state: 'preparing' } }))
    try {
      const token = await getToken()
      const res = await playDebridRelease(offer.release, token, { season, episode, instantOnly: true })
      const next: Prepared =
        res.status === 'ready'
          ? { state: 'ready', url: res.directUrl, fileName: res.fileName, size: res.fileSize > 0 ? formatBytes(res.fileSize) : offer.size }
          : {
              state: 'failed',
              message:
                res.status === 'failed' ? res.reason : 'Not ready to download yet — try another, or play it to fetch it first.',
            }
      setPrepared((p) => ({ ...p, [id]: next }))
    } catch (err: unknown) {
      setPrepared((p) => ({
        ...p,
        [id]: { state: 'failed', message: err instanceof Error ? err.message : 'Could not prepare this release' },
      }))
    }
  }

  return (
    <>
      <div className="flex shrink-0 items-start gap-3 px-5 pb-3 pt-4 md:pt-5">
        <div className="min-w-0 flex-1">
          <DialogPrimitive.Title className="text-[17px] font-bold leading-snug">Download</DialogPrimitive.Title>
          <p className="mt-0.5 truncate text-[13px] text-white/55">
            {title}
            {target.label ? ` · ${target.label}` : ''}
          </p>
        </div>
        <DialogPrimitive.Close
          aria-label="Close"
          className="-mr-1.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white/60 transition-colors hover:bg-white/10 hover:text-white"
        >
          <X className="h-5 w-5" />
        </DialogPrimitive.Close>
      </div>

      <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        {listing.state === 'searching' && (
          <p className="flex items-center gap-2.5 px-2 py-6 text-sm text-white/60" role="status">
            <Loader2 className="h-4 w-4 animate-spin" /> Finding downloads…
          </p>
        )}
        {listing.state === 'empty' && (
          <Notice>Premium has no copy of this ready to download yet. Try again later, or watch it on another server.</Notice>
        )}
        {listing.state === 'error' && <Notice>{listing.message}</Notice>}
        {listing.state === 'sign-in' && (
          <Notice>
            Downloads come with Premium.{' '}
            <Link to="/login" className="font-semibold text-white underline underline-offset-4">
              Sign in
            </Link>{' '}
            to download.
          </Notice>
        )}
        {listing.state === 'ready' && (
          <ul className="space-y-1">
            {listing.offers.map((offer) => {
              const status = prepared[offer.release.info_hash]
              return (
                <li key={offer.release.info_hash}>
                  <OfferRow offer={offer} status={status} onPrepare={() => void prepare(offer)} />
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </>
  )
}

function OfferRow({ offer, status, onPrepare }: { offer: Offer; status: Prepared | undefined; onPrepare: () => void }) {
  const heading = (
    <span className="min-w-0 flex-1">
      <span className="flex items-baseline gap-2">
        <span className="font-semibold">{offer.label}</span>
        {offer.tags.length > 0 && <span className="text-xs text-white/55">{offer.tags.join(' · ')}</span>}
        {offer.size && <span className="ml-auto shrink-0 text-xs tabular-nums text-white/50">{offer.size}</span>}
      </span>
      <span className="mt-0.5 block truncate text-[11px] text-white/35">{offer.release.name}</span>
    </span>
  )

  if (status?.state === 'ready') {
    return (
      <a
        href={status.url}
        download={status.fileName}
        target="_blank"
        rel="noopener noreferrer"
        className="flex w-full items-center gap-3 rounded-xl bg-white px-3 py-3 text-left text-black transition-colors hover:bg-white/90"
      >
        <Download className="h-5 w-5 shrink-0" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">Save {offer.label}{status.size ? ` · ${status.size}` : ''}</span>
          <span className="mt-0.5 block truncate text-[11px] text-black/55">{status.fileName}</span>
        </span>
        <Check className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
      </a>
    )
  }

  return (
    <div>
      <button
        onClick={onPrepare}
        disabled={status?.state === 'preparing'}
        className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-white/[0.07] active:bg-white/10 disabled:opacity-70"
      >
        {status?.state === 'preparing' ? (
          <Loader2 className="h-5 w-5 shrink-0 animate-spin text-white/70" aria-label="Preparing" />
        ) : (
          <Download className="h-5 w-5 shrink-0 text-white/70" aria-hidden="true" />
        )}
        {heading}
      </button>
      {status?.state === 'failed' && (
        <p className="flex items-start gap-1.5 px-3 pb-2 text-xs text-amber-300/90">
          <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {status.message}
        </p>
      )}
    </div>
  )
}

function Notice({ children }: { children: ReactNode }) {
  return <p className="px-2 py-6 text-sm leading-relaxed text-white/65">{children}</p>
}
