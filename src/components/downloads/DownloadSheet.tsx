/**
 * DownloadSheet — save a film or an episode, with a torrent app.
 *
 * Lists the releases people are sharing, and hands each over as a magnet
 * link: the viewer's own torrent app (qBittorrent, LibreTorrent, ...) fetches
 * it from those people. Real-Debrid isn't involved — one account can't serve
 * downloads to many connections at once, and Real-Debrid bans sharing it.
 *
 * The link is a real anchor the viewer taps, which hands it to the torrent
 * app; Copy covers a device where nothing opens magnet links.
 *
 * A bottom sheet on a phone, a dialog on a wider screen.
 */

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useAuth0 } from '@auth0/auth0-react'
import { Link } from 'react-router-dom'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { Check, Copy, Download, Loader2, Users, X } from 'lucide-react'
import {
  DebridRequestError,
  formatBytes,
  isImaxRelease,
  parseTorrentHDR,
  parseTorrentQuality,
  searchDebridMedia,
  type DebridRelease,
} from '@/lib/debridApi'
import { getAdminToken } from '@/lib/api'
import { magnetLink } from '@/lib/magnet'
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
  size: string | null
  seeders: number
  /** A show's release holding the whole season: the torrent app lets the viewer pick the episode. */
  seasonPack: boolean
  magnet: string
}

/** A show's release that holds a whole season (or more) rather than this one episode. */
function isSeasonPack(name: string): boolean {
  return !/S\d{1,2}[ ._-]?E\d{1,3}|\b\d{1,2}x\d{2}\b/i.test(name)
}

function toOffer(release: DebridRelease, mediaType: 'movie' | 'tv'): Offer | null {
  const magnet = magnetLink(release.info_hash, release.name)
  if (!magnet) return null
  const bytes = parseInt(release.size, 10)
  const seasonPack = mediaType === 'tv' && isSeasonPack(release.name)
  return {
    release,
    label: parseTorrentQuality(release.name),
    tags: [parseTorrentHDR(release.name), isImaxRelease(release.name) ? 'IMAX' : null, seasonPack ? 'Whole season' : null].filter(
      (t): t is string => !!t
    ),
    size: Number.isFinite(bytes) && bytes > 0 ? formatBytes(bytes) : null,
    seeders: parseInt(release.seeders, 10) || 0,
    seasonPack,
    magnet,
  }
}

/** Only releases someone is sharing (nothing would download otherwise), best quality and most shared first. */
function rankOffers(releases: DebridRelease[], mediaType: 'movie' | 'tv'): Offer[] {
  const sorted = releases
    .map((r) => toOffer(r, mediaType))
    .filter((o): o is Offer => o !== null && o.seeders > 0)
    .sort(
      (a, b) =>
        (QUALITY_RANK[a.label] ?? 9) - (QUALITY_RANK[b.label] ?? 9) ||
        // A single-episode file before a whole season
        Number(a.seasonPack) - Number(b.seasonPack) ||
        b.seeders - a.seeders
    )
  const perQuality = new Map<string, number>()
  const seen = new Set<string>()
  return sorted
    .filter((offer) => {
      const hash = offer.release.info_hash.toLowerCase()
      if (seen.has(hash)) return false
      seen.add(hash)
      const count = perQuality.get(offer.label) ?? 0
      perQuality.set(offer.label, count + 1)
      return count < MAX_PER_QUALITY
    })
    .slice(0, MAX_OFFERED)
}

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
            'md:inset-x-auto md:bottom-auto md:left-1/2 md:top-1/2 md:w-[min(32rem,calc(100vw-2rem))] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-2xl'
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

  return (
    <>
      <div className="flex shrink-0 items-start gap-3 px-5 pb-2 pt-4 md:pt-5">
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

      <p className="shrink-0 px-5 pb-3 text-[12px] leading-relaxed text-white/50">
        Downloads open in a torrent app, such as qBittorrent on a computer or LibreTorrent on Android (iPhones can’t). The file
        comes from other people sharing it, so speed depends on how many there are, and they can see your IP address.
      </p>

      <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        {listing.state === 'searching' && (
          <p className="flex items-center gap-2.5 px-2 py-6 text-sm text-white/60" role="status">
            <Loader2 className="h-4 w-4 animate-spin" /> Finding downloads…
          </p>
        )}
        {listing.state === 'empty' && <Notice>No one is sharing this right now. Try again later, or watch it on Premium.</Notice>}
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
          <ul className="space-y-1.5">
            {listing.offers.map((offer) => (
              <li key={offer.release.info_hash}>
                <OfferRow offer={offer} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  )
}

function OfferRow({ offer }: { offer: Offer }) {
  const [copied, setCopied] = useState<'yes' | 'failed' | null>(null)

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(null), 2000)
    return () => clearTimeout(timer)
  }, [copied])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(offer.magnet)
      setCopied('yes')
    } catch {
      setCopied('failed')
    }
  }

  return (
    <div className="rounded-xl px-3 py-2.5 transition-colors hover:bg-white/[0.05]">
      <div className="flex items-baseline gap-2">
        <span className="font-semibold">{offer.label}</span>
        {offer.tags.length > 0 && <span className="text-xs text-white/55">{offer.tags.join(' · ')}</span>}
        {offer.size && <span className="ml-auto shrink-0 text-xs tabular-nums text-white/50">{offer.size}</span>}
      </div>
      <p className="mt-0.5 truncate text-[11px] text-white/35" title={offer.release.name}>
        {offer.release.name}
      </p>
      <p className="mt-1 flex items-center gap-1 text-[11px] text-white/45">
        <Users className="h-3 w-3" aria-hidden="true" />
        {offer.seeders.toLocaleString()} sharing
        {offer.seasonPack && <span>· pick the episode in your torrent app</span>}
      </p>
      <div className="mt-2 flex gap-2">
        <a
          href={offer.magnet}
          aria-label={`Open ${offer.label} in torrent app`}
          className="flex h-9 flex-1 items-center justify-center gap-2 rounded-lg bg-white text-[13px] font-semibold text-black transition-colors hover:bg-white/90"
        >
          <Download className="h-4 w-4" aria-hidden="true" />
          Open in torrent app
        </a>
        <button
          onClick={() => void copy()}
          aria-label={`Copy ${offer.label} magnet link`}
          className="flex h-9 items-center justify-center gap-1.5 rounded-lg bg-white/[0.12] px-3 text-[13px] font-semibold text-white transition-colors hover:bg-white/20"
        >
          {copied === 'yes' ? <Check className="h-4 w-4 text-emerald-400" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
          {copied === 'yes' ? 'Copied' : copied === 'failed' ? 'Copy failed' : 'Copy link'}
        </button>
      </div>
    </div>
  )
}

function Notice({ children }: { children: ReactNode }) {
  return <p className="px-2 py-6 text-sm leading-relaxed text-white/65">{children}</p>
}
