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
 *      top bar; switching mid-film carries the position over.
 *   7. Where the viewer stopped is remembered per title/episode (see
 *      playbackPosition) and playback resumes there next time.
 */

import { useCallback, useEffect, useMemo, useState, useRef, type ReactNode } from 'react'
import { useAuth0 } from '@auth0/auth0-react'
import { Link } from 'react-router-dom'
import { Loader2, AlertTriangle, Check, Cloud, Crown, ExternalLink, ChevronDown, RefreshCw, Zap } from 'lucide-react'
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
import {
  detectBrowserVideoSupport,
  planPlaybackModes,
  rankReleasesForPlayback,
  type PlaybackMode,
} from '@/lib/releasePlayback'
import { getAdminToken } from '@/lib/api'
import { formatPlayerTime, readResumePosition, resumeKey, saveResumePosition } from '@/lib/playbackPosition'
import { cn } from '@/lib/utils'
import { formatPromoDate, useDebridFreeUntil } from '@/hooks/useDebridPromo'
import { DebridVideo } from './DebridVideo'

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
  /** Artwork behind the loading screens. */
  backdropUrl?: string | null
  /** Real playback position, every few seconds and on pause/end/close. */
  onProgress?: (position: number, duration: number) => void
  /** Next episode, when there is one. */
  onNext?: () => void
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

/** Releases tried automatically before an error is shown — each costs one backend round trip (~3-4s). */
const MAX_AUTO_RELEASE_ATTEMPTS = 5

/**
 * Extra cached releases resolved, when the first one would need Real-Debrid's
 * HLS transcode, in search of one the browser plays directly. The transcode
 * can't reliably seek (a jump ahead took 20s, or 503'd after two minutes),
 * so a few seconds spent here buy a player that can skip and resume.
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
  backdropUrl,
  onProgress,
  onNext,
}: DebridPlayerPaneProps) {
  const { isAuthenticated, getAccessTokenSilently } = useAuth0()
  const freeUntil = useDebridFreeUntil()
  const [status, setStatus] = useState<Status>('searching')
  const [statusMessage, setStatusMessage] = useState('Searching Real-Debrid...')
  const [playback, setPlayback] = useState<DebridReadyPlayback | null>(null)
  const [playbackMode, setPlaybackMode] = useState<PlaybackMode | null>(null)
  const [instantReleases, setInstantReleases] = useState<DebridRelease[]>([])
  const [activeRelease, setActiveRelease] = useState<DebridRelease | null>(null)
  const [playbackFailed, setPlaybackFailed] = useState(false)
  const [showReleasesDropdown, setShowReleasesDropdown] = useState(false)
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
            setStatusMessage(`Real-Debrid couldn't download this release (${res.reason}).`)
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
          `"${release.name}" is still downloading on Real-Debrid. Check the Real-Debrid Cloud tab in a few minutes, or switch to a standard server now.`
        )
      }
    },
    [episodeOpts, showPlayback]
  )

  /** Add an uncached release to Real-Debrid and play it once it has downloaded. */
  const downloadAndPlay = useCallback(
    async (release: DebridRelease, token: string | undefined, generation: number) => {
      setStatus('downloading')
      setStatusMessage(`Adding ${parseTorrentQuality(release.name)} release to Real-Debrid...`)
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
        setStatusMessage(res.status === 'failed' ? res.reason : 'Real-Debrid could not add this release.')
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
            ? `Trying another release — preparing ${parseTorrentQuality(current.name)} stream...`
            : `Preparing ${parseTorrentQuality(current.name)} stream...`
        )
        setPlaybackFailed(false)
        setActiveRelease(current)

        try {
          const res = await playDebridRelease(current, token, { ...episodeOpts, instantOnly: current.cached })
          if (generationRef.current !== generation) return
          if (res.status === 'ready') {
            const needsTranscode = planPlaybackModes(res, detectBrowserVideoSupport())[0]?.kind === 'hls'
            const next = releaseQueueRef.current.find((r) => !triedReleasesRef.current.has(r.info_hash))
            if (needsTranscode && directProbesLeft > 0 && next) {
              directProbesLeft--
              transcodeFallback ??= { release: current, playback: res }
              current = next
              setStatusMessage('Looking for a release your browser can play directly...')
              continue
            }
            showPlayback(current, res)
            return
          }
          const skipped: DebridRelease = current
          if (res.status === 'not-cached') {
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
      if (fallback && !triedReleasesRef.current.has(fallback.info_hash)) {
        uncachedFallbackRef.current = null
        await downloadAndPlay(fallback, token, generation)
        return
      }
      setStatus('error')
      setStatusMessage("Couldn't start any release for this title on Real-Debrid.")
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
    setStatusMessage(`Searching Real-Debrid for "${title}"...`)
    setPlaybackFailed(false)
    setPlayback(null)
    setPlaybackMode(null)
    setInstantReleases([])
    setActiveRelease(null)
    setDownloadProgress(null)
    releaseQueueRef.current = []
    triedReleasesRef.current = new Set()
    autoAttemptsRef.current = 0
    uncachedFallbackRef.current = null
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
        uncachedFallbackRef.current = null
        await downloadAndPlay(uncached[0], token, generation)
        return
      }

      setStatus('not-found')
      setStatusMessage(`No torrents found for "${title}".`)
    } catch (err: unknown) {
      if (generationRef.current !== generation) return
      console.error('Real-Debrid search failed:', err)
      setStatus(isUpgradeError(err) ? 'upgrade-required' : 'error')
      setStatusMessage(err instanceof Error ? err.message : 'Real-Debrid search failed')
    }
  }, [title, year, imdbId, mediaType, season, episode, storageKey, getToken, streamRelease, downloadAndPlay])

  useEffect(() => {
    void searchAndPlay()
    return () => {
      // Read the live ref, not a snapshot — bumping whatever generation is
      // current stops any in-flight poll loop.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      generationRef.current++
    }
  }, [searchAndPlay])

  const switchRelease = (release: DebridRelease) => {
    setShowReleasesDropdown(false)
    autoAttemptsRef.current = 0
    triedReleasesRef.current = new Set()
    // Pick up where the viewer is in the current file.
    startPositionRef.current = positionRef.current > 0 ? positionRef.current : startPositionRef.current
    void getToken().then((token) => streamRelease(release, token))
  }


  const switchServerLink = (
    <button
      onClick={onSwitchServer}
      className="text-xs text-white/40 underline underline-offset-4 transition-colors hover:text-white/70"
    >
      Switch to standard server
    </button>
  )

  // --- Finding a release / resolving it / waiting on a download ---
  if (status === 'searching' || status === 'loading-stream' || status === 'downloading') {
    const pct = Math.min(100, Math.round(downloadProgress?.progress ?? 0))
    const step = status === 'searching' ? 0 : 1
    return (
      <PaneBackdrop backdropUrl={backdropUrl} testId="debrid-loading">
        <BrandLine freeUntil={freeUntil} />
        <Loader2 className="h-9 w-9 animate-spin text-white/70" />
        <p className="max-w-sm text-sm text-white/80">
          {status === 'downloading' && activeRelease
            ? `Real-Debrid is downloading the ${parseTorrentQuality(activeRelease.name)} release...`
            : statusMessage}
        </p>
        {status === 'downloading' && downloadProgress ? (
          <div className="w-full max-w-xs space-y-2">
            <div className="h-1 w-full overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${pct}%` }} />
            </div>
            <p className="text-[11px] text-white/45">
              {pct}% · {formatBytes(downloadProgress.speed)}/s · {downloadProgress.seeders} seeds
            </p>
          </div>
        ) : (
          <ol className="flex items-center gap-2 text-[11px] text-white/45" aria-label="Progress">
            {['Find release', 'Prepare stream', 'Play'].map((label, i) => (
              <li key={label} className="flex items-center gap-2">
                {i > 0 && <span className="h-px w-5 bg-white/15" />}
                <span className={cn('flex items-center gap-1', i < step && 'text-white/70', i === step && 'font-medium text-white')}>
                  {i < step ? <Check className="h-3 w-3" /> : <span className={cn('h-1.5 w-1.5 rounded-full', i === step ? 'bg-primary' : 'bg-white/25')} />}
                  {label}
                </span>
              </li>
            ))}
          </ol>
        )}
        {switchServerLink}
      </PaneBackdrop>
    )
  }

  // --- Sign in (or, outside the free period, subscribe) ---
  if (status === 'upgrade-required') {
    const free = freeUntil !== null
    return (
      <PaneBackdrop backdropUrl={backdropUrl}>
        <div className="flex h-12 w-12 items-center justify-center rounded-full border border-yellow-500/30 bg-yellow-500/10">
          {free ? <Zap className="h-5 w-5 text-yellow-400" /> : <Crown className="h-5 w-5 text-yellow-500" />}
        </div>
        <div className="space-y-1.5">
          <p className="text-base font-semibold text-white">
            {freeUntil ? `Real-Debrid is free until ${formatPromoDate(freeUntil)}` : 'Real-Debrid is a premium feature'}
          </p>
          <p className="max-w-sm text-xs text-white/60">
            {free
              ? 'Sign in with a free account to stream in 4K and 1080p — no subscription needed.'
              : isAuthenticated
                ? 'Upgrade your account to stream instantly via Real-Debrid.'
                : 'Sign in and upgrade to stream instantly via Real-Debrid.'}
          </p>
        </div>
        <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
          <Link
            to={free || !isAuthenticated ? '/login' : '/pricing'}
            className="rounded-full bg-white px-5 py-2 text-xs font-semibold text-black transition-colors hover:bg-white/90"
          >
            {free || !isAuthenticated ? 'Sign in' : 'Upgrade to Premium'}
          </Link>
          <button
            onClick={onSwitchServer}
            className="rounded-full border border-white/15 px-4 py-2 text-xs text-white/75 transition-colors hover:border-white/30 hover:text-white"
          >
            Switch to standard server
          </button>
        </div>
      </PaneBackdrop>
    )
  }

  // --- Not found / error ---
  if (status === 'not-found' || status === 'error') {
    return (
      <PaneBackdrop backdropUrl={backdropUrl}>
        {status === 'error' ? (
          <AlertTriangle className="h-7 w-7 text-destructive" />
        ) : (
          <div className="flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/5">
            <Cloud className="h-5 w-5 text-white/45" />
          </div>
        )}
        <div className="space-y-1">
          {status === 'not-found' && <p className="text-sm font-semibold text-white">No Real-Debrid stream available</p>}
          <p className="max-w-sm text-xs text-white/60">{statusMessage}</p>
        </div>
        <div className="mt-1 flex items-center gap-2">
          <button
            onClick={onSwitchServer}
            className="rounded-full bg-white px-5 py-2 text-xs font-semibold text-black transition-colors hover:bg-white/90"
          >
            Switch to standard server
          </button>
          <button
            onClick={() => void searchAndPlay()}
            className="flex items-center gap-1.5 rounded-full border border-white/15 px-4 py-2 text-xs text-white/75 transition-colors hover:border-white/30 hover:text-white"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Retry
          </button>
        </div>
      </PaneBackdrop>
    )
  }

  // --- Every way of playing the file failed after the viewer started watching ---
  if (playbackFailed || !playback) {
    const nextRelease = instantReleases.find((r) => r.info_hash !== activeRelease?.info_hash)
    return (
      <PaneBackdrop backdropUrl={backdropUrl}>
        <AlertTriangle className="h-7 w-7 text-destructive" />
        <div className="space-y-1">
          <p className="text-sm font-semibold text-white">Playback stopped</p>
          <p className="max-w-sm text-xs text-white/60">
            Neither the direct link nor Real-Debrid&apos;s stream would play in this browser. Try another release, or open
            the file in VLC.
          </p>
        </div>
        <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
          {nextRelease && (
            <button
              onClick={() => switchRelease(nextRelease)}
              className="rounded-full bg-white px-5 py-2 text-xs font-semibold text-black transition-colors hover:bg-white/90"
            >
              Try another release
            </button>
          )}
          {playback && (
            <a
              href={playback.directUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded-full border border-white/15 px-4 py-2 text-xs text-white/75 transition-colors hover:border-white/30 hover:text-white"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open in VLC / browser
            </a>
          )}
          <button
            onClick={onSwitchServer}
            className="rounded-full border border-white/15 px-4 py-2 text-xs text-white/75 transition-colors hover:border-white/30 hover:text-white"
          >
            Switch server
          </button>
        </div>
      </PaneBackdrop>
    )
  }

  // --- Ready ---
  const episodeLabel = mediaType === 'tv' && season !== undefined && episode !== undefined ? `S${season}:E${episode}` : undefined
  const videoKey = `${activeRelease?.info_hash ?? ''}:${playback.directUrl}:${playNonce}`

  return (
    <div className="relative h-full w-full overflow-hidden bg-black">
      <DebridVideo
        key={videoKey}
        playback={playback}
        startAt={startAt}
        onExhausted={handleExhausted}
        onModeChange={setPlaybackMode}
        onProgress={handleProgress}
        onNext={onNext}
        title={title}
        subtitle={episodeLabel}
        className="absolute inset-0 h-full w-full"
        topBarActions={
          <>
            <SourceMenu
              releases={instantReleases}
              active={activeRelease}
              transcoding={playbackMode?.kind === 'hls' ? playbackMode.label : null}
              open={showReleasesDropdown}
              onOpenChange={setShowReleasesDropdown}
              onPick={switchRelease}
            />
            <a
              href={playback.directUrl}
              target="_blank"
              rel="noopener noreferrer"
              title="Open the direct link (VLC, download)"
              aria-label="Open the direct link"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-black/50 text-white/70 transition-colors hover:text-white"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
          </>
        }
      />

      {resumeToast && startAt !== undefined && (
        <div className="absolute bottom-24 left-3 z-30 flex items-center gap-3 rounded-lg border border-white/10 bg-zinc-900/95 px-3.5 py-2.5 text-xs text-white/85 shadow-2xl sm:left-5">
          <span>Resumed at {formatPlayerTime(startAt)}</span>
          <button onClick={startOver} className="font-semibold text-primary hover:text-primary/80">
            Start over
          </button>
        </div>
      )}
    </div>
  )
}

/** Full-pane status screen over the title's artwork. */
function PaneBackdrop({
  backdropUrl,
  testId,
  children,
}: {
  backdropUrl?: string | null
  testId?: string
  children: ReactNode
}) {
  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden bg-black" data-testid={testId}>
      {backdropUrl && (
        <img src={backdropUrl} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full object-cover opacity-25" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/75 to-black/40" />
      <div className="relative z-10 flex flex-col items-center gap-3.5 px-6 text-center">{children}</div>
    </div>
  )
}

function BrandLine({ freeUntil }: { freeUntil: Date | null }) {
  return (
    <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-white/50">
      <Zap className="h-3.5 w-3.5 text-yellow-400" />
      Real-Debrid
      {freeUntil && (
        <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] tracking-wider text-emerald-300">
          Free until {formatPromoDate(freeUntil)}
        </span>
      )}
    </div>
  )
}

/**
 * The playing release's quality, and a menu of the other cached releases.
 * Renders inline (no portal) so it still shows in fullscreen.
 */
function SourceMenu({
  releases,
  active,
  transcoding,
  open,
  onOpenChange,
  onPick,
}: {
  releases: DebridRelease[]
  active: DebridRelease | null
  /** Label of Real-Debrid's transcode when that's what's playing. */
  transcoding: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onPick: (release: DebridRelease) => void
}) {
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) onOpenChange(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, onOpenChange])

  const quality = active ? parseTorrentQuality(active.name) : 'HD'
  const hdr = active ? parseTorrentHDR(active.name) : null
  const imax = active ? isImaxRelease(active.name) : false
  const canPick = releases.length > 1

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => canPick && onOpenChange(!open)}
        aria-expanded={canPick ? open : undefined}
        title={active?.name}
        className={cn(
          'flex h-9 items-center gap-1.5 rounded-full border border-white/15 bg-black/50 px-3 text-xs font-semibold text-white/90 transition-colors',
          canPick ? 'hover:border-white/30 hover:text-white' : 'cursor-default'
        )}
      >
        <span>{quality}</span>
        {hdr && <span className="text-white/60">· {hdr}</span>}
        {imax && <span className="text-white/60">· IMAX</span>}
        {transcoding && <span className="font-normal text-white/50">· {transcoding}</span>}
        {canPick && <ChevronDown className={cn('h-3.5 w-3.5 opacity-60 transition-transform', open && 'rotate-180')} />}
      </button>

      {open && canPick && (
        <div className="absolute right-0 top-full z-50 mt-2 w-[min(20rem,calc(100vw-2rem))] rounded-xl border border-white/10 bg-zinc-900/95 p-1.5 shadow-2xl">
          <p className="px-2 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-widest text-white/40">
            {releases.length} instant releases
          </p>
          <div className="custom-scrollbar max-h-64 space-y-0.5 overflow-y-auto">
            {releases.map((rel) => {
              const isSelected = rel.info_hash === active?.info_hash
              const sizeBytes = parseInt(rel.size, 10)
              const relHdr = parseTorrentHDR(rel.name)
              return (
                <button
                  key={rel.info_hash}
                  onClick={() => onPick(rel)}
                  className={cn(
                    'flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors',
                    isSelected ? 'bg-white/10 text-white' : 'text-white/70 hover:bg-white/5'
                  )}
                >
                  <Check className={cn('mt-0.5 h-3.5 w-3.5 shrink-0', isSelected ? 'opacity-100' : 'opacity-0')} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 font-semibold">
                      {parseTorrentQuality(rel.name)}
                      {relHdr && <span className="font-normal opacity-70">· {relHdr}</span>}
                      {isImaxRelease(rel.name) && <span className="font-normal opacity-70">· IMAX</span>}
                      {Number.isFinite(sizeBytes) && sizeBytes > 0 && (
                        <span className="ml-auto font-normal opacity-60">{formatBytes(sizeBytes)}</span>
                      )}
                    </span>
                    <span className="block truncate text-[10px] opacity-60">{rel.name}</span>
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
