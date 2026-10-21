/**
 * DebridPlayerPane — automatic Stremio-style Real-Debrid player
 *
 * Flow:
 *   1. User picks the Real-Debrid server on any movie or TV episode.
 *   2. Releases are found via Torrentio (matched by IMDb id + season/episode,
 *      tagged with Real-Debrid cache status) and, for movies, apibay too.
 *   3. The best cached release is resolved by the backend (add → select files
 *      → unrestrict) and played straight from Real-Debrid — the direct link
 *      when the browser can decode it, Real-Debrid's HLS transcode otherwise
 *      (see DebridVideo). Our backend never touches the video.
 *   4. A cached release that won't start — stale cache tag, dead torrent, or
 *      unplayable in this browser — is skipped for the next one, a few
 *      times, before any error is shown.
 *   5. With nothing cached, the best uncached release is added to
 *      Real-Debrid and polled until it's downloaded, then played.
 *   6. Other cached releases (4K, HDR, ...) can be picked from the player's
 *      Quality menu; switching mid-film carries the position over.
 *   7. Where the viewer stopped is remembered per title/episode (see
 *      playbackPosition) and playback resumes there next time.
 */

import { useCallback, useEffect, useMemo, useState, useRef, type ReactNode } from 'react'
import { useAuth0 } from '@auth0/auth0-react'
import { Link } from 'react-router-dom'
import { ExternalLink, RefreshCw } from 'lucide-react'
import {
  playDebridRelease,
  pollDebridPlayback,
  searchDebridMedia,
  parseTorrentQuality,
  parseTorrentHDR,
  isImaxRelease,
  formatBytes,
  DebridRequestError,
  type DebridRelease,
  type DebridReadyPlayback,
} from '@/lib/debridApi'
import { detectBrowserVideoSupport, planPlaybackModes, rankReleasesForPlayback } from '@/lib/releasePlayback'
import { getAdminToken } from '@/lib/api'
import { formatPlayerTime, readResumePosition, resumeKey, saveResumePosition } from '@/lib/playbackPosition'
import { formatPromoDate, useDebridFreeUntil } from '@/hooks/useDebridPromo'
import { DebridVideo } from './DebridVideo'
import type { PlayerSource } from './PlayerControls'

interface DebridPlayerPaneProps {
  title: string
  year?: string | number
  /** IMDb id, e.g. "tt1375666" — drives the Torrentio lookup. Omit to fall back to title-only apibay search (movies only). */
  imdbId?: string | null
  mediaType?: 'movie' | 'tv'
  /** Required (with `episode`) when mediaType is 'tv' — Torrentio matches per-episode, not by season pack alone. */
  season?: number
  episode?: number
  onSwitchServer: () => void
  /** Leave playback for the title's details — the player's own back button, where the page's isn't visible. */
  onBack?: () => void
  /** Artwork behind the loading screens. */
  backdropUrl?: string | null
  /** Real playback position, every few seconds and on pause/end/close. */
  onProgress?: (position: number, duration: number) => void
  /** Next episode, when there is one. */
  onNext?: () => void
  /** What the next episode is, e.g. "S1 · E4". */
  nextLabel?: string
  /** The release picker and download link, for the page to draw under the player — null when there's nothing to offer. */
  onReleaseControls?: (controls: ReleaseControls | null) => void
  /** The season's episodes, for the player's Episodes panel. */
  episodes?: ReactNode
}

/** What the page shows under the player: the releases to switch between, and the playing file to save. */
export interface ReleaseControls {
  /** The instant releases, as the player's Quality menu lists them — the playing one always included. */
  releases: PlayerSource[]
  activeId: string | null
  onSelect: (id: string) => void
  /** The playing file — null until a release is ready. */
  download: { url: string; fileName: string; size: string | null } | null
  /** A release is being found or started. */
  busy: boolean
}

/** A release as the Quality menu and the release picker list it. */
function toPlayerSource(rel: DebridRelease): PlayerSource {
  const size = parseInt(rel.size, 10)
  const hdr = parseTorrentHDR(rel.name)
  return {
    id: rel.info_hash,
    label: parseTorrentQuality(rel.name),
    tags: [hdr, isImaxRelease(rel.name) ? 'IMAX' : null].filter((t): t is string => !!t),
    size: Number.isFinite(size) && size > 0 ? formatBytes(size) : undefined,
    name: rel.name,
  }
}

type Status = 'searching' | 'loading-stream' | 'downloading' | 'ready' | 'not-found' | 'error' | 'upgrade-required'

/** 401 (no account) or 403 (no subscription) — both mean "this needs premium access". */
function isUpgradeError(err: unknown): boolean {
  return err instanceof DebridRequestError && (err.status === 401 || err.status === 403)
}

/**
 * Real-Debrid refused for a reason every release shares — the server's IP is
 * blocked, the account is out of traffic, ... — so trying others won't help.
 */
function isDebridUnavailable(err: unknown): err is DebridRequestError {
  return err instanceof DebridRequestError && err.code === 'debrid_unavailable'
}

/** 4xx from the backend (other than rate limiting) won't fix itself on the next poll. */
function isPermanentRequestError(err: unknown): boolean {
  return err instanceof DebridRequestError && err.status >= 400 && err.status < 500 && err.status !== 429
}

interface DownloadProgress {
  /** 0-100 */
  progress: number
  seeders: number
  /** Bytes/second */
  speed: number
}

/**
 * Releases tried automatically before an error is shown — each costs one
 * backend round trip (~3-4s; a release Real-Debrid refuses outright, e.g. a
 * DMCA'd one, well under 1s). Popular series often have several refused
 * packs at the top.
 */
const MAX_AUTO_RELEASE_ATTEMPTS = 8

/**
 * Extra cached releases resolved, when the first one would need Real-Debrid's
 * HLS transcode, in search of one the browser plays directly. The transcode
 * is re-encoded, and every jump outside what it has loaded restarts it
 * (~7s), so a few seconds spent here buy the original quality and instant
 * seeking.
 */
const MAX_DIRECT_PLAY_PROBES = 2

/** Past this much playback, a failure is shown rather than silently restarting the viewer on another release. */
const AUTO_SWITCH_MAX_POSITION_S = 30

/** How long an uncached release is polled before giving up on waiting for it here. */
const DOWNLOAD_POLL_TIMEOUT_MS = 15 * 60 * 1000
const DOWNLOAD_POLL_INTERVAL_MS = 5000

export function DebridPlayerPane({
  title,
  year,
  imdbId,
  mediaType = 'movie',
  season,
  episode,
  onSwitchServer,
  onBack,
  backdropUrl,
  onProgress,
  onNext,
  nextLabel,
  onReleaseControls,
  episodes,
}: DebridPlayerPaneProps) {
  const { isAuthenticated, getAccessTokenSilently } = useAuth0()
  const freeUntil = useDebridFreeUntil()
  const [status, setStatus] = useState<Status>('searching')
  const [statusMessage, setStatusMessage] = useState('Finding the best stream…')
  const [playback, setPlayback] = useState<DebridReadyPlayback | null>(null)
  const [instantReleases, setInstantReleases] = useState<DebridRelease[]>([])
  const [activeRelease, setActiveRelease] = useState<DebridRelease | null>(null)
  const [playbackFailed, setPlaybackFailed] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null)
  /** Where the current file starts, in seconds. */
  const [startAt, setStartAt] = useState<number | undefined>(undefined)
  /** Bumped to remount the video (e.g. "Start over") without changing the file. */
  const [playNonce, setPlayNonce] = useState(0)
  const [resumeToast, setResumeToast] = useState(false)
  /** Latest position reported by the video, in seconds. */
  const positionRef = useRef(0)
  /** Bumped on every new search/poll/release attempt so stale loops know to stop. */
  const generationRef = useRef(0)
  /** Cached releases in the order they'll be tried automatically. */
  const releaseQueueRef = useRef<DebridRelease[]>([])
  const triedReleasesRef = useRef(new Set<string>())
  const autoAttemptsRef = useRef(0)
  /**
   * True when no release came tagged as cached (the cache-aware index was
   * unreachable — Torrentio refuses some server IPs): the queue is then made
   * of untagged releases, each asked "instant?" (instantOnly) before any is
   * downloaded.
   */
  const probingRef = useRef(false)
  /** Releases Real-Debrid said aren't instant — still fine to download. */
  const notInstantRef = useRef(new Set<string>())
  /** Best uncached release — downloaded if every cached one fails. */
  const uncachedFallbackRef = useRef<DebridRelease | null>(null)

  const episodeOpts = useMemo(() => (mediaType === 'tv' ? { season, episode } : {}), [mediaType, season, episode])

  /** Resume-point key for this title, or this episode. */
  const storageKey = useMemo(
    () => resumeKey(imdbId || `${title}:${year ?? ''}`, mediaType === 'tv' ? season : undefined, mediaType === 'tv' ? episode : undefined),
    [imdbId, title, year, mediaType, season, episode]
  )
  const storageKeyRef = useRef(storageKey)
  storageKeyRef.current = storageKey
  /**
   * Key of the file actually playing. Differs from `storageKey` for a moment
   * after the episode changes: the old video is still mounted (and reports
   * its final position on unmount) while the new episode is being found.
   */
  const playingKeyRef = useRef(storageKey)

  const getToken = useCallback(async () => {
    try {
      const adminToken = getAdminToken()
      if (adminToken) return adminToken
      if (isAuthenticated) return await getAccessTokenSilently()
    } catch {
      // Guest or silent token error
    }
    return undefined
  }, [isAuthenticated, getAccessTokenSilently])

  /**
   * Where a newly resolved file should start: wherever the viewer already is
   * (switching release mid-film), else the saved resume point.
   */
  const startPositionRef = useRef<number | undefined>(undefined)

  const showPlayback = useCallback((release: DebridRelease, ready: DebridReadyPlayback) => {
    const start = startPositionRef.current
    playingKeyRef.current = storageKeyRef.current
    setActiveRelease(release)
    setPlayback(ready)
    setStartAt(start)
    setResumeToast(!!start && start > 0)
    setPlaybackFailed(false)
    setDownloadProgress(null)
    setStatus('ready')
  }, [])

  useEffect(() => {
    if (!resumeToast) return
    const timer = setTimeout(() => setResumeToast(false), 8000)
    return () => clearTimeout(timer)
  }, [resumeToast])

  const handleProgress = useCallback(
    (position: number, duration: number) => {
      const key = playingKeyRef.current
      saveResumePosition(key, position, duration)
      // A last report from the previous episode: its resume point is saved
      // above under its own key, but it says nothing about the current one.
      if (key !== storageKeyRef.current) return
      positionRef.current = position
      onProgress?.(position, duration)
    },
    [onProgress]
  )

  const startOver = () => {
    startPositionRef.current = undefined
    positionRef.current = 0
    saveResumePosition(storageKey, 0, 0)
    setStartAt(undefined)
    setResumeToast(false)
    setPlayNonce((n) => n + 1)
  }

  /** Poll a release Real-Debrid is downloading until it's ready, then play it. */
  const pollUntilReady = useCallback(
    async (torrentId: string, release: DebridRelease, token: string | undefined, generation: number) => {
      const startedAt = Date.now()
      while (generationRef.current === generation && Date.now() - startedAt < DOWNLOAD_POLL_TIMEOUT_MS) {
        await new Promise((r) => setTimeout(r, DOWNLOAD_POLL_INTERVAL_MS))
        if (generationRef.current !== generation) return
        try {
          const res = await pollDebridPlayback(torrentId, release, token, episodeOpts)
          if (generationRef.current !== generation) return
          if (res.status === 'ready') {
            showPlayback(release, res)
            return
          }
          if (res.status === 'failed') {
            setStatus('error')
            setStatusMessage(`This release couldn't be downloaded (${res.reason}).`)
            return
          }
          if (res.status === 'downloading') {
            setDownloadProgress({ progress: res.progress, seeders: res.seeders, speed: res.speed })
          }
        } catch (err: unknown) {
          if (isPermanentRequestError(err) || isDebridUnavailable(err)) throw err
          // Otherwise a transient network hiccup — keep polling.
        }
      }
      if (generationRef.current === generation) {
        setStatus('not-found')
        setStatusMessage(
          `"${release.name}" is still downloading. Try again in a few minutes, or switch to another server now.`
        )
      }
    },
    [episodeOpts, showPlayback]
  )

  /** Add an uncached release to Real-Debrid and play it once it has downloaded. */
  const downloadAndPlay = useCallback(
    async (release: DebridRelease, token: string | undefined, generation: number) => {
      setStatus('downloading')
      setStatusMessage(`Adding the ${parseTorrentQuality(release.name)} release to Premium…`)
      setActiveRelease(release)
      setDownloadProgress(null)
      try {
        const res = await playDebridRelease(release, token, episodeOpts)
        if (generationRef.current !== generation) return
        if (res.status === 'ready') {
          showPlayback(release, res)
          return
        }
        if (res.status === 'downloading') {
          setDownloadProgress({ progress: res.progress, seeders: res.seeders, speed: res.speed })
          await pollUntilReady(res.torrentId, release, token, generation)
          return
        }
        setStatus('error')
        setStatusMessage(res.status === 'failed' ? res.reason : 'This release could not be prepared.')
      } catch (err: unknown) {
        if (generationRef.current !== generation) return
        console.error('Real-Debrid download error:', err)
        setStatus(isUpgradeError(err) ? 'upgrade-required' : 'error')
        setStatusMessage(err instanceof Error ? err.message : 'Failed to download release')
      }
    },
    [episodeOpts, showPlayback, pollUntilReady]
  )

  /**
   * Play a cached release, moving on to the next one in the queue when it
   * can't be started. Once the queue or the attempt budget runs out, falls
   * back to downloading the best uncached release, and only then shows an
   * error.
   *
   * `preferDirect` (automatic picks only, not a release the viewer chose):
   * when the resolved file would need Real-Debrid's transcode, try a couple
   * more cached releases for one that plays directly before settling for it.
   */
  const streamRelease = useCallback(
    async (release: DebridRelease, token?: string, opts: { preferDirect?: boolean } = {}) => {
      const generation = ++generationRef.current
      let current: DebridRelease | null = release
      /** A cached-tagged release already in the account but still downloading — polled if nothing else works. */
      let downloadingFallback: { torrentId: string; release: DebridRelease } | null = null
      /** The first ready release that needs the transcode — played if no direct one turns up. */
      let transcodeFallback: { release: DebridRelease; playback: DebridReadyPlayback } | null = null
      let directProbesLeft = opts.preferDirect ? MAX_DIRECT_PLAY_PROBES : 0

      while (current) {
        triedReleasesRef.current.add(current.info_hash)
        autoAttemptsRef.current++
        setStatus('loading-stream')
        setStatusMessage(
          autoAttemptsRef.current > 1
            ? `Trying another release (${parseTorrentQuality(current.name)})…`
            : `Starting the ${parseTorrentQuality(current.name)} stream…`
        )
        setPlaybackFailed(false)
        setActiveRelease(current)

        try {
          const res = await playDebridRelease(current, token, {
            ...episodeOpts,
            instantOnly: current.cached || probingRef.current,
          })
          if (generationRef.current !== generation) return
          if (res.status === 'ready') {
            const needsTranscode = planPlaybackModes(res, detectBrowserVideoSupport())[0]?.kind === 'hls'
            const next = releaseQueueRef.current.find((r) => !triedReleasesRef.current.has(r.info_hash))
            if (needsTranscode && directProbesLeft > 0 && next) {
              directProbesLeft--
              transcodeFallback ??= { release: current, playback: res }
              current = next
              setStatusMessage('Looking for a release your browser can play directly…')
              continue
            }
            if (probingRef.current) {
              // Proven instant — offer it in the picker.
              const proven: DebridRelease = { ...current, cached: true }
              setInstantReleases((prev) => (prev.some((r) => r.info_hash === proven.info_hash) ? prev : [...prev, proven]))
            }
            showPlayback(current, res)
            return
          }
          const skipped: DebridRelease = current
          if (res.status === 'not-cached') {
            notInstantRef.current.add(skipped.info_hash)
            // Stale cache tag — drop it from the picker too.
            setInstantReleases((prev) => prev.filter((r) => r.info_hash !== skipped.info_hash))
          } else if (res.status === 'downloading' && !downloadingFallback) {
            downloadingFallback = { torrentId: res.torrentId, release: current }
          }
          console.warn(`Real-Debrid release not playable (${res.status}), trying another:`, current.name)
        } catch (err: unknown) {
          if (generationRef.current !== generation) return
          if (isUpgradeError(err)) {
            setStatus('upgrade-required')
            setStatusMessage(err instanceof Error ? err.message : 'Premium required')
            return
          }
          if (isDebridUnavailable(err)) {
            setStatus('error')
            setStatusMessage(err.message)
            return
          }
          console.warn('Real-Debrid release could not start, trying another:', current.name, err)
        }

        current =
          autoAttemptsRef.current < MAX_AUTO_RELEASE_ATTEMPTS
            ? releaseQueueRef.current.find((r) => !triedReleasesRef.current.has(r.info_hash)) ?? null
            : null
      }

      if (transcodeFallback) {
        showPlayback(transcodeFallback.release, transcodeFallback.playback)
        return
      }
      if (downloadingFallback) {
        setStatus('downloading')
        setActiveRelease(downloadingFallback.release)
        await pollUntilReady(downloadingFallback.torrentId, downloadingFallback.release, token, generation)
        return
      }
      const fallback = uncachedFallbackRef.current
      // A release only asked "instant?" (and told no) can still be downloaded.
      if (fallback && (!triedReleasesRef.current.has(fallback.info_hash) || notInstantRef.current.has(fallback.info_hash))) {
        uncachedFallbackRef.current = null
        await downloadAndPlay(fallback, token, generation)
        return
      }
      setStatus('error')
      setStatusMessage("Couldn't start any release for this title on Premium.")
    },
    [episodeOpts, showPlayback, pollUntilReady, downloadAndPlay]
  )

  /**
   * Every playback mode of the current file failed. Early on, quietly move
   * to the next release; once the viewer is actually watching, show the
   * error instead of restarting them on a different file.
   */
  const handleExhausted = useCallback(
    (reason: string, position: number) => {
      if (position < AUTO_SWITCH_MAX_POSITION_S && autoAttemptsRef.current < MAX_AUTO_RELEASE_ATTEMPTS) {
        const next = releaseQueueRef.current.find((r) => !triedReleasesRef.current.has(r.info_hash))
        if (next) {
          console.warn(`Real-Debrid stream failed (${reason}), trying another release:`, next.name)
          startPositionRef.current = position > 0 ? position : startPositionRef.current
          void getToken().then((token) => streamRelease(next, token, { preferDirect: true }))
          return
        }
      }
      setPlaybackFailed(true)
    },
    [getToken, streamRelease]
  )

  const searchAndPlay = useCallback(async () => {
    const generation = ++generationRef.current

    setStatus('searching')
    setStatusMessage('Finding the best stream…')
    setPlaybackFailed(false)
    setPlayback(null)
    setInstantReleases([])
    setActiveRelease(null)
    setDownloadProgress(null)
    releaseQueueRef.current = []
    triedReleasesRef.current = new Set()
    autoAttemptsRef.current = 0
    uncachedFallbackRef.current = null
    probingRef.current = false
    notInstantRef.current = new Set()
    positionRef.current = 0
    startPositionRef.current = readResumePosition(storageKey) ?? undefined

    const token = await getToken()

    try {
      const cleanTitle = title.replace(/[^a-zA-Z0-9\s]/g, ' ').trim()
      const queryTitle = year ? `${cleanTitle} ${year}` : cleanTitle

      const releases = await searchDebridMedia(queryTitle, imdbId ?? undefined, mediaType, token, {
        season,
        episode,
        limit: 25,
      })
      if (generationRef.current !== generation) return

      const ranked = rankReleasesForPlayback(releases, detectBrowserVideoSupport())
      const cached = ranked.filter((r) => r.cached)
      // An uncached release needs live seeders, or it just sits in
      // Real-Debrid's download queue forever.
      const uncached = ranked.filter((r) => !r.cached && parseInt(r.seeders, 10) > 0)
      uncachedFallbackRef.current = uncached[0] ?? null

      if (cached.length > 0) {
        setInstantReleases(cached)
        releaseQueueRef.current = cached
        await streamRelease(cached[0], token, { preferDirect: true })
        return
      }

      if (uncached.length > 0) {
        // Nothing says what's cached, but popular releases usually are: ask
        // Real-Debrid about the best few before downloading anything.
        probingRef.current = true
        releaseQueueRef.current = uncached.slice(0, MAX_AUTO_RELEASE_ATTEMPTS)
        await streamRelease(uncached[0], token, { preferDirect: true })
        return
      }

      setStatus('not-found')
      setStatusMessage(
        `Premium has no copy of ${mediaType === 'tv' ? 'this episode' : title} yet. Another server may have it.`
      )
    } catch (err: unknown) {
      if (generationRef.current !== generation) return
      console.error('Real-Debrid search failed:', err)
      setStatus(isUpgradeError(err) ? 'upgrade-required' : 'error')
      setStatusMessage(err instanceof Error ? err.message : 'Search failed')
    }
  }, [title, year, imdbId, mediaType, season, episode, storageKey, getToken, streamRelease])

  useEffect(() => {
    void searchAndPlay()
    return () => {
      // Read the live ref, not a snapshot — bumping whatever generation is
      // current stops any in-flight poll loop.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      generationRef.current++
    }
  }, [searchAndPlay])

  const switchRelease = useCallback(
    (release: DebridRelease) => {
      autoAttemptsRef.current = 0
      triedReleasesRef.current = new Set()
      // Pick up where the viewer is in the current file.
      startPositionRef.current = positionRef.current > 0 ? positionRef.current : startPositionRef.current
      void getToken().then((token) => streamRelease(release, token))
    },
    [getToken, streamRelease]
  )

  /**
   * The cached releases, as the Quality menu and the release picker list
   * them — plus the playing one if it isn't among them (a release that had
   * to be downloaded first).
   */
  const sources = useMemo<PlayerSource[]>(() => {
    const list = instantReleases.map(toPlayerSource)
    if (activeRelease && !instantReleases.some((r) => r.info_hash === activeRelease.info_hash)) {
      list.unshift(toPlayerSource(activeRelease))
    }
    return list
  }, [instantReleases, activeRelease])

  const selectRelease = useCallback(
    (id: string) => {
      const release = instantReleases.find((r) => r.info_hash === id)
      if (release && release.info_hash !== activeRelease?.info_hash) switchRelease(release)
    },
    [instantReleases, activeRelease, switchRelease]
  )

  const releaseControls = useMemo<ReleaseControls | null>(() => {
    if (sources.length === 0) return null
    const ready = status === 'ready' && playback
    return {
      releases: sources,
      activeId: activeRelease?.info_hash ?? null,
      onSelect: selectRelease,
      download: ready
        ? { url: playback.directUrl, fileName: playback.fileName, size: playback.fileSize > 0 ? formatBytes(playback.fileSize) : null }
        : null,
      busy: status === 'searching' || status === 'loading-stream' || status === 'downloading',
    }
  }, [sources, status, playback, activeRelease, selectRelease])

  useEffect(() => {
    onReleaseControls?.(releaseControls)
  }, [onReleaseControls, releaseControls])
  useEffect(() => () => onReleaseControls?.(null), [onReleaseControls])

  const episodeLine =
    mediaType === 'tv' && season !== undefined && episode !== undefined ? `Season ${season} · Episode ${episode}` : undefined

  // --- Finding a release / resolving it / waiting on a download ---
  if (status === 'searching' || status === 'loading-stream' || status === 'downloading') {
    const pct = Math.min(100, Math.round(downloadProgress?.progress ?? 0))
    const downloading = status === 'downloading' && downloadProgress !== null
    return (
      <PaneBackdrop backdropUrl={backdropUrl} testId="debrid-loading" onSwitchServer={onSwitchServer}>
        <TitleLines title={title} episodeLine={episodeLine} />
        <div
          className="mt-7 h-[3px] w-44 overflow-hidden rounded-full bg-white/15 sm:w-56"
          role="progressbar"
          aria-label="Loading the stream"
          aria-valuemin={downloading ? 0 : undefined}
          aria-valuemax={downloading ? 100 : undefined}
          aria-valuenow={downloading ? pct : undefined}
        >
          {downloading ? (
            <div className="h-full rounded-full bg-white transition-[width] duration-700" style={{ width: `${pct}%` }} />
          ) : (
            <div className="pane-indeterminate h-full w-2/5 rounded-full bg-white" />
          )}
        </div>
        <p className="mt-4 text-sm text-white/75" aria-live="polite">
          {status === 'downloading' && activeRelease
            ? `Downloading the ${parseTorrentQuality(activeRelease.name)} release${downloading ? ` · ${pct}%` : '…'}`
            : statusMessage}
        </p>
        {downloading && (
          <p className="mt-1 text-xs tabular-nums text-white/45">
            {formatBytes(downloadProgress.speed)}/s · {downloadProgress.seeders} peers
          </p>
        )}
      </PaneBackdrop>
    )
  }

  // --- Sign in (or, outside the free period, subscribe) ---
  if (status === 'upgrade-required') {
    const free = freeUntil !== null
    return (
      <PaneBackdrop backdropUrl={backdropUrl}>
        <StatusMessage
          heading={free ? 'Sign in to watch on Premium' : 'Premium is for subscribers'}
          body={
            free
              ? `Premium is free until ${formatPromoDate(freeUntil)} — sign in with a free account to stream in 4K and 1080p.`
              : isAuthenticated
                ? 'Upgrade your account to stream in 4K and 1080p.'
                : 'Sign in and upgrade to stream in 4K and 1080p.'
          }
        />
        <ActionRow>
          <Link to={free || !isAuthenticated ? '/login' : '/pricing'} className={primaryAction}>
            {free || !isAuthenticated ? 'Sign in' : 'See plans'}
          </Link>
          <button onClick={onSwitchServer} className={secondaryAction}>
            Switch server
          </button>
        </ActionRow>
      </PaneBackdrop>
    )
  }

  // --- Not found / error ---
  if (status === 'not-found' || status === 'error') {
    return (
      <PaneBackdrop backdropUrl={backdropUrl}>
        <StatusMessage
          heading={status === 'not-found' ? 'No Premium stream available' : "Premium couldn't start this"}
          body={statusMessage}
        />
        <ActionRow>
          <button onClick={onSwitchServer} className={primaryAction}>
            Switch server
          </button>
          <button onClick={() => void searchAndPlay()} className={secondaryAction}>
            <RefreshCw className="h-4 w-4" />
            Try again
          </button>
        </ActionRow>
      </PaneBackdrop>
    )
  }

  // --- Every way of playing the file failed after the viewer started watching ---
  if (playbackFailed || !playback) {
    const nextRelease = instantReleases.find((r) => r.info_hash !== activeRelease?.info_hash)
    return (
      <PaneBackdrop backdropUrl={backdropUrl}>
        <StatusMessage
          heading="Playback stopped"
          body="This release won't play in this browser. Try another one, or open the file in a player like VLC."
        />
        <ActionRow>
          {nextRelease && (
            <button onClick={() => switchRelease(nextRelease)} className={primaryAction}>
              Try another release
            </button>
          )}
          {playback && (
            <a href={playback.directUrl} target="_blank" rel="noopener noreferrer" className={secondaryAction}>
              <ExternalLink className="h-4 w-4" />
              Open in VLC
            </a>
          )}
          <button onClick={onSwitchServer} className={secondaryAction}>
            Switch server
          </button>
        </ActionRow>
      </PaneBackdrop>
    )
  }

  // --- Ready ---
  const videoKey = `${activeRelease?.info_hash ?? ''}:${playback.directUrl}:${playNonce}`

  return (
    <div className="relative h-full w-full overflow-hidden bg-black">
      <DebridVideo
        key={videoKey}
        playback={playback}
        startAt={startAt}
        onExhausted={handleExhausted}
        onProgress={handleProgress}
        poster={backdropUrl}
        onNext={onNext}
        nextLabel={nextLabel}
        onBack={onBack}
        title={title}
        subtitle={mediaType === 'tv' && season !== undefined && episode !== undefined ? `S${season} · E${episode}` : undefined}
        sources={sources}
        activeSourceId={activeRelease?.info_hash ?? null}
        onSourceChange={selectRelease}
        episodes={episodes}
        overlay={
          resumeToast && startAt !== undefined ? (
            <div className="flex items-center gap-3 rounded-lg bg-black/80 px-3.5 py-2.5 text-sm text-white/90 shadow-lg">
              <span>Resumed from {formatPlayerTime(startAt)}</span>
              <button onClick={startOver} className="font-semibold text-white underline-offset-4 hover:underline">
                Start over
              </button>
            </div>
          ) : null
        }
        className="absolute inset-0 h-full w-full"
      />
    </div>
  )
}

const primaryAction =
  'inline-flex h-10 items-center justify-center gap-2 rounded-md bg-white px-5 text-sm font-semibold text-black transition-colors hover:bg-white/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-black'
const secondaryAction =
  'inline-flex h-10 items-center justify-center gap-2 rounded-md bg-white/10 px-4 text-sm font-medium text-white transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70'

/** Full-pane status screen over the title's artwork. */
function PaneBackdrop({
  backdropUrl,
  testId,
  onSwitchServer,
  children,
}: {
  backdropUrl?: string | null
  testId?: string
  /** A quiet way out while the viewer waits. */
  onSwitchServer?: () => void
  children: ReactNode
}) {
  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden bg-black text-white" data-testid={testId}>
      {backdropUrl && (
        <img
          src={backdropUrl}
          alt=""
          aria-hidden="true"
          decoding="async"
          className="absolute inset-0 h-full w-full scale-105 object-cover opacity-30"
        />
      )}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(0,0,0,0.35)_0%,rgba(0,0,0,0.85)_75%)]" />
      <div className="relative z-10 flex max-w-md flex-col items-center px-6 text-center">{children}</div>
      {onSwitchServer && (
        <button
          onClick={onSwitchServer}
          className="absolute bottom-3 right-3 z-10 rounded-md px-3 py-2 text-xs font-medium text-white/55 transition-colors hover:bg-white/10 hover:text-white sm:bottom-4 sm:right-4"
        >
          Switch server
        </button>
      )}
    </div>
  )
}

function TitleLines({ title, episodeLine }: { title: string; episodeLine?: string }) {
  return (
    <>
      <p className="line-clamp-2 font-display text-xl font-semibold leading-tight sm:text-3xl">{title}</p>
      {episodeLine && <p className="mt-1.5 text-sm text-white/60">{episodeLine}</p>}
    </>
  )
}

function StatusMessage({ heading, body }: { heading: string; body: string }) {
  return (
    <>
      <p className="text-lg font-semibold leading-snug sm:text-xl">{heading}</p>
      <p className="mt-2 text-sm leading-relaxed text-white/65">{body}</p>
    </>
  )
}

function ActionRow({ children }: { children: ReactNode }) {
  return <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5">{children}</div>
}
