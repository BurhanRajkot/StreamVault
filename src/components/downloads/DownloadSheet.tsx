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
 * Subtitles: a second tab offers one .srt per language, from the subtitle
 * search movy's own download picker uses (see subtitleDownloads).
 *
 * A bottom sheet on a phone, a dialog on a wider screen.
 */

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useAuth0 } from '@auth0/auth0-react'
import { Link } from 'react-router-dom'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { Captions, Check, Copy, Download, Film, Loader2, Users, X } from 'lucide-react'
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
import { bestPerLanguage, saveSubtitleFile, searchSubtitleFiles, type SubtitleLanguage } from '@/lib/subtitleDownloads'

export interface DownloadTarget {
  title: string
  year?: string | number
  imdbId?: string | null
  /** For the subtitle search. */
  tmdbId?: number
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
        <DialogPrimitive.Overlay className="animate-fade fixed inset-0 z-[180] bg-black/75 backdrop-blur-[2px]" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className={cn(
            'dark fixed z-[190] flex max-h-[88svh] flex-col overflow-hidden bg-[#181818] text-white shadow-[0_24px_80px_-12px_rgba(0,0,0,0.9)] ring-1 ring-white/[0.08] focus:outline-none',
            // Phone: a sheet from the bottom edge
            'inset-x-0 bottom-0 rounded-t-3xl pb-[env(safe-area-inset-bottom,0px)] max-md:animate-slide-up',
            // Wider: a dialog in the middle
            'md:inset-x-auto md:bottom-auto md:left-1/2 md:top-1/2 md:w-[min(34rem,calc(100vw-2rem))] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-2xl'
          )}
        >
          {target && <SheetBody key={`${target.mediaType}:${target.imdbId}:${target.season}:${target.episode}`} target={target} />}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

type Tab = 'video' | 'subtitles'

function SheetBody({ target }: { target: DownloadTarget }) {
  const { isAuthenticated, getAccessTokenSilently } = useAuth0()
  const [listing, setListing] = useState<Listing>({ state: 'searching' })
  const [tab, setTab] = useState<Tab>('video')

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
      {/* Drag handle on a phone */}
      <div className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-white/20 md:hidden" aria-hidden="true" />
      <div className="flex shrink-0 items-start gap-3 px-5 pb-4 pt-4 md:px-6 md:pt-6">
        <div className="min-w-0 flex-1">
          <DialogPrimitive.Title className="text-xl font-bold tracking-tight">Download</DialogPrimitive.Title>
          <p className="mt-1 truncate text-sm text-white/55">
            {title}
            {year ? ` (${year})` : ''}
            {target.label ? ` · ${target.label}` : ''}
          </p>
        </div>
        <DialogPrimitive.Close
          aria-label="Close"
          className="-mr-1.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white/60 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
        >
          <X className="h-5 w-5" />
        </DialogPrimitive.Close>
      </div>

      {/* Video / Subtitles */}
      <div role="tablist" aria-label="What to download" className="mx-5 mb-3 grid shrink-0 grid-cols-2 gap-1 rounded-xl bg-white/[0.06] p-1 md:mx-6">
        <TabButton active={tab === 'video'} onClick={() => setTab('video')} icon={<Film className="h-4 w-4" aria-hidden="true" />}>
          Video
        </TabButton>
        <TabButton active={tab === 'subtitles'} onClick={() => setTab('subtitles')} icon={<Captions className="h-4 w-4" aria-hidden="true" />}>
          Subtitles
        </TabButton>
      </div>

      <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto px-3 pb-3 md:px-4">
        {tab === 'video' ? (
          <>
            {listing.state === 'searching' && <Searching>Finding downloads…</Searching>}
            {listing.state === 'empty' && <Notice>No one is sharing this right now. Try again later.</Notice>}
            {listing.state === 'error' && <Notice>{listing.message}</Notice>}
            {listing.state === 'sign-in' && (
              <Notice>
                <Link to="/login" className="font-semibold text-white underline underline-offset-4">
                  Sign in
                </Link>{' '}
                to download.
              </Notice>
            )}
            {listing.state === 'ready' && (
              <ul className="space-y-2">
                {listing.offers.map((offer) => (
                  <li key={offer.release.info_hash}>
                    <OfferRow offer={offer} />
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <SubtitleList target={target} />
        )}
      </div>

      <p className="shrink-0 border-t border-white/[0.06] px-5 py-3 text-[11.5px] leading-relaxed text-white/45 md:px-6">
        {tab === 'video'
          ? 'Video opens in a torrent app — qBittorrent on a computer, LibreTorrent on Android (iPhones can’t). It comes from other people sharing it, so speed depends on how many there are, and they can see your IP address.'
          : 'Subtitles save as an .srt file. Keep it next to the video with the same name and most players load it on their own.'}
      </p>
    </>
  )
}

function TabButton({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: ReactNode; children: ReactNode }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        'flex h-9 items-center justify-center gap-2 rounded-lg text-[13px] font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60',
        active ? 'bg-white text-black shadow-sm' : 'text-white/65 hover:bg-white/[0.06] hover:text-white'
      )}
    >
      {icon}
      {children}
    </button>
  )
}

/** "4K" gets the accent, the rest a quiet outline — the same badges as the title page. */
function QualityBadge({ label }: { label: string }) {
  const uhd = label === '4K'
  return (
    <span
      className={cn(
        'inline-flex h-6 min-w-[3.25rem] items-center justify-center rounded-md px-2 text-[12px] font-bold tracking-wide',
        uhd ? 'bg-primary text-primary-foreground' : 'bg-white/[0.1] text-white ring-1 ring-inset ring-white/15'
      )}
    >
      {label}
    </span>
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
    <div className="group rounded-xl bg-white/[0.035] p-3 ring-1 ring-inset ring-white/[0.06] transition-colors hover:bg-white/[0.06] hover:ring-white/[0.12]">
      <div className="flex items-center gap-2.5">
        <QualityBadge label={offer.label} />
        {offer.tags.length > 0 && <span className="truncate text-xs font-medium text-white/70">{offer.tags.join(' · ')}</span>}
        <span className="ml-auto flex shrink-0 items-center gap-3 text-xs tabular-nums text-white/55">
          {offer.size && <span>{offer.size}</span>}
          <span className="flex items-center gap-1" title={`${offer.seeders.toLocaleString()} sharing`}>
            <Users className="h-3 w-3" aria-hidden="true" />
            {offer.seeders.toLocaleString()}
          </span>
        </span>
      </div>
      <p className="mt-1.5 truncate text-[11px] text-white/35" title={offer.release.name}>
        {offer.release.name}
        {offer.seasonPack && <span className="text-white/50"> · pick the episode in your torrent app</span>}
      </p>
      <div className="mt-2.5 flex gap-2">
        <a
          href={offer.magnet}
          aria-label={`Open ${offer.label} in torrent app`}
          className="flex h-9 flex-1 items-center justify-center gap-2 rounded-lg bg-white text-[13px] font-semibold text-black transition-all hover:bg-white/90 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#181818]"
        >
          <Download className="h-4 w-4" aria-hidden="true" />
          Download
        </a>
        <button
          onClick={() => void copy()}
          aria-label={`Copy ${offer.label} magnet link`}
          className="flex h-9 items-center justify-center gap-1.5 rounded-lg bg-white/[0.1] px-3 text-[13px] font-semibold text-white transition-all hover:bg-white/[0.18] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
        >
          {copied === 'yes' ? <Check className="h-4 w-4 text-emerald-400" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
          {copied === 'yes' ? 'Copied' : copied === 'failed' ? 'Copy failed' : 'Copy link'}
        </button>
      </div>
    </div>
  )
}

type SubtitleListing =
  | { state: 'searching' }
  | { state: 'ready'; languages: SubtitleLanguage[] }
  | { state: 'empty' }
  | { state: 'error' }

function SubtitleList({ target }: { target: DownloadTarget }) {
  const [listing, setListing] = useState<SubtitleListing>(() => (target.tmdbId ? { state: 'searching' } : { state: 'empty' }))
  const [saving, setSaving] = useState<string | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const { tmdbId, season, episode, title } = target

  useEffect(() => {
    if (!tmdbId) return
    const controller = new AbortController()
    searchSubtitleFiles(tmdbId, season, episode, controller.signal)
      .then((files) => {
        const languages = bestPerLanguage(files, typeof navigator !== 'undefined' ? [...navigator.languages] : [])
        setListing(languages.length > 0 ? { state: 'ready', languages } : { state: 'empty' })
      })
      .catch(() => {
        if (!controller.signal.aborted) setListing({ state: 'error' })
      })
    return () => controller.abort()
  }, [tmdbId, season, episode])

  const save = async (lang: SubtitleLanguage) => {
    setSaving(lang.display)
    setFailed(null)
    try {
      const base = [title, season !== undefined && episode !== undefined ? `S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}` : null]
        .filter(Boolean)
        .join('.')
      await saveSubtitleFile(lang.file, base.replace(/\s+/g, '.'))
    } catch {
      setFailed(lang.display)
    } finally {
      setSaving(null)
    }
  }

  if (listing.state === 'searching') return <Searching>Finding subtitles…</Searching>
  if (listing.state === 'empty') return <Notice>No subtitles found for this one.</Notice>
  if (listing.state === 'error') return <Notice>Couldn’t reach the subtitle search. Try again in a moment.</Notice>

  return (
    <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
      {listing.languages.map((lang) => (
        <li key={lang.display}>
          <button
            type="button"
            onClick={() => void save(lang)}
            disabled={saving !== null}
            aria-label={`Download ${lang.display} subtitles`}
            className="flex h-11 w-full items-center gap-2.5 rounded-xl bg-white/[0.035] px-3 text-left text-sm ring-1 ring-inset ring-white/[0.06] transition-colors hover:bg-white/[0.07] hover:ring-white/[0.14] disabled:cursor-wait focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
          >
            <span className="min-w-0 flex-1 truncate font-medium">{lang.display}</span>
            {lang.file.isHearingImpaired && <span className="rounded bg-white/10 px-1 text-[10px] font-bold text-white/70">CC</span>}
            {failed === lang.display ? (
              <span className="text-xs text-red-400">Failed</span>
            ) : saving === lang.display ? (
              <Loader2 className="h-4 w-4 animate-spin text-white/60" aria-hidden="true" />
            ) : (
              <Download className="h-4 w-4 text-white/50" aria-hidden="true" />
            )}
          </button>
        </li>
      ))}
    </ul>
  )
}

function Searching({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-2" role="status">
      <p className="sr-only">{children}</p>
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-[104px] animate-pulse rounded-xl bg-white/[0.04]" />
      ))}
    </div>
  )
}

function Notice({ children }: { children: ReactNode }) {
  return <p className="px-2 py-8 text-center text-sm leading-relaxed text-white/65">{children}</p>
}
