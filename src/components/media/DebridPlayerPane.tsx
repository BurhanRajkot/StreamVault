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
 *   6. Other cached releases (4K, HDR, ...) can be picked from a dropdown.
 */

import { useCallback, useEffect, useMemo, useState, useRef } from 'react'
import { useAuth0 } from '@auth0/auth0-react'
import { Link } from 'react-router-dom'
import { Loader2, AlertTriangle, Cloud, Crown, ExternalLink, ChevronDown, RefreshCw } from 'lucide-react'
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
import { cn } from '@/lib/utils'
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
}

type Status = 'searching' | 'loading-stream' | 'downloading' | 'ready' | 'not-found' | 'error' | 'upgrade-required'

/** 401 (no account) or 403 (no subscription) — both mean "this needs premium access". */
function isUpgradeError(err: unknown): boolean {
  return err instanceof DebridRequestError && (err.status === 401 || err.status === 403)
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
}: DebridPlayerPaneProps) {
  const { isAuthenticated, getAccessTokenSilently } = useAuth0()
  const [status, setStatus] = useState<Status>('searching')
  const [statusMessage, setStatusMessage] = useState('Searching Real-Debrid...')
  const [playback, setPlayback] = useState<DebridReadyPlayback | null>(null)
  const [playbackMode, setPlaybackMode] = useState<PlaybackMode | null>(null)
  const [instantReleases, setInstantReleases] = useState<DebridRelease[]>([])
  const [activeRelease, setActiveRelease] = useState<DebridRelease | null>(null)
  const [playbackFailed, setPlaybackFailed] = useState(false)
  const [showReleasesDropdown, setShowReleasesDropdown] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null)
  /** Bumped on every new search/poll/release attempt so stale loops know to stop. */
  const generationRef = useRef(0)
  /** Cached releases in the order they'll be tried automatically. */
  const releaseQueueRef = useRef<DebridRelease[]>([])
  const triedReleasesRef = useRef(new Set<string>())
  const autoAttemptsRef = useRef(0)
  /** Best uncached release — downloaded if every cached one fails. */
  const uncachedFallbackRef = useRef<DebridRelease | null>(null)

  const episodeOpts = useMemo(() => (mediaType === 'tv' ? { season, episode } : {}), [mediaType, season, episode])

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

  const showPlayback = useCallback((release: DebridRelease, ready: DebridReadyPlayback) => {
    setActiveRelease(release)
    setPlayback(ready)
    setPlaybackFailed(false)
    setDownloadProgress(null)
    setStatus('ready')
  }, [])

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
          if (isPermanentRequestError(err)) throw err
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
  }, [title, year, imdbId, mediaType, season, episode, getToken, streamRelease, downloadAndPlay])

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

  // --- Loading / Searching state ---
  if (status === 'searching' || status === 'loading-stream') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center" data-testid="debrid-loading">
        <Loader2 className="h-6 w-6 animate-spin text-white/50" />
        <p className="max-w-xs text-sm text-white/70">{statusMessage}</p>
        {switchServerLink}
      </div>
    )
  }

  // --- Downloading: release added to Real-Debrid, waiting for it to finish ---
  if (status === 'downloading') {
    const pct = Math.min(100, Math.round(downloadProgress?.progress ?? 0))
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <Loader2 className="h-6 w-6 animate-spin text-white/50" />
        <div className="w-full max-w-xs space-y-2">
          <p className="text-sm text-white/70">
            {activeRelease
              ? `Real-Debrid is downloading the ${parseTorrentQuality(activeRelease.name)} release...`
              : statusMessage}
          </p>
          {downloadProgress && (
            <>
              <div className="h-1 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-500"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="text-[11px] text-white/40">
                {pct}% · {formatBytes(downloadProgress.speed)}/s · {downloadProgress.seeders} seeds
              </p>
            </>
          )}
        </div>
        {switchServerLink}
      </div>
    )
  }

  // --- Upgrade required: guest or non-premium account hit the paywall ---
  if (status === 'upgrade-required') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <div className="flex h-11 w-11 items-center justify-center rounded-full border border-yellow-500/30 bg-yellow-500/10">
          <Crown className="h-5 w-5 text-yellow-500" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-medium text-white">Real-Debrid is a premium feature</p>
          <p className="max-w-xs text-xs text-white/50">
            {isAuthenticated
              ? 'Upgrade your account to stream instantly via Real-Debrid.'
              : 'Sign in and upgrade to stream instantly via Real-Debrid.'}
          </p>
        </div>
        <div className="mt-1 flex items-center gap-2">
          <Link
            to={isAuthenticated ? '/pricing' : '/login'}
            className="rounded-full bg-white px-5 py-2 text-xs font-medium text-black transition-colors hover:bg-white/90"
          >
            {isAuthenticated ? 'Upgrade to Premium' : 'Sign In'}
          </Link>
          <button
            onClick={onSwitchServer}
            className="rounded-full border border-white/10 px-4 py-2 text-xs text-white/70 transition-colors hover:border-white/30 hover:text-white"
          >
            Switch to Standard Server
          </button>
        </div>
      </div>
    )
  }

  // --- Not found / error ---
  if (status === 'not-found' || status === 'error') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        {status === 'error' ? (
          <AlertTriangle className="h-6 w-6 text-destructive" />
        ) : (
          <div className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/5">
            <Cloud className="h-5 w-5 text-white/40" />
          </div>
        )}
        <div className="space-y-1">
          {status === 'not-found' && <p className="text-sm font-medium text-white">No Real-Debrid stream available</p>}
          <p className="max-w-xs text-xs text-white/50">{statusMessage}</p>
        </div>
        <div className="mt-1 flex items-center gap-2">
          <button
            onClick={onSwitchServer}
            className="rounded-full bg-white px-5 py-2 text-xs font-medium text-black transition-colors hover:bg-white/90"
          >
            Switch to Standard Server
          </button>
          <button
            onClick={() => void searchAndPlay()}
            title="Retry Real-Debrid"
            className="flex items-center justify-center rounded-full border border-white/10 p-2 text-white/50 transition-colors hover:border-white/30 hover:text-white"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    )
  }

  // --- Every way of playing the file failed after the viewer started watching ---
  if (playbackFailed || !playback) {
    const nextRelease = instantReleases.find((r) => r.info_hash !== activeRelease?.info_hash)
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <AlertTriangle className="h-6 w-6 text-destructive" />
        <div className="space-y-1">
          <p className="text-sm font-medium text-white">Playback stopped</p>
          <p className="max-w-sm text-xs text-white/50">
            Neither the direct link nor Real-Debrid&apos;s stream would play in this browser. You can open the file in VLC or try
            another release.
          </p>
        </div>
        <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
          {playback && (
            <a
              href={playback.directUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-xs font-medium text-black transition-colors hover:bg-white/90"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open in VLC / browser
            </a>
          )}
          {nextRelease && (
            <button
              onClick={() => switchRelease(nextRelease)}
              className="rounded-full border border-white/10 px-4 py-2 text-xs text-white/70 transition-colors hover:border-white/30 hover:text-white"
            >
              Try another release
            </button>
          )}
          <button
            onClick={onSwitchServer}
            className="rounded-full border border-white/10 px-4 py-2 text-xs text-white/70 transition-colors hover:border-white/30 hover:text-white"
          >
            Switch server
          </button>
        </div>
      </div>
    )
  }

  // --- Ready: native video playback with a minimal hover-in overlay ---
  const activeQuality = activeRelease ? parseTorrentQuality(activeRelease.name) : 'HD'
  const activeHDR = activeRelease ? parseTorrentHDR(activeRelease.name) : null
  const activeIMAX = activeRelease ? isImaxRelease(activeRelease.name) : false
  const chip = 'rounded border border-white/15 bg-white/5 px-1.5 py-0.5 text-[10px] font-medium text-white/70'

  return (
    <div className="group relative h-full w-full select-none overflow-hidden bg-black">
      <DebridVideo
        playback={playback}
        onExhausted={handleExhausted}
        onModeChange={setPlaybackMode}
        className="absolute inset-0 h-full w-full"
      />

      <div className="absolute inset-x-0 top-0 z-30 flex items-center justify-between gap-3 bg-gradient-to-b from-black/70 to-transparent p-3 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
        <div className="flex min-w-0 items-center gap-2">
          <span className={chip}>{activeQuality}</span>
          {activeHDR && <span className={chip}>{activeHDR}</span>}
          {activeIMAX && <span className={chip}>IMAX</span>}
          {playbackMode && playbackMode.kind === 'hls' && (
            <span className={chip} title="Real-Debrid is converting this file for your browser">
              {playbackMode.label}
            </span>
          )}
          {activeRelease && (
            <span className="hidden max-w-[260px] truncate text-xs text-white/50 sm:inline">{activeRelease.name}</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {instantReleases.length > 1 && (
            <div className="relative">
              <button
                onClick={() => setShowReleasesDropdown(!showReleasesDropdown)}
                className="flex items-center gap-1.5 rounded-full border border-white/10 bg-black/40 px-2.5 py-1 text-xs text-white/70 transition-colors hover:text-white"
              >
                <span>{instantReleases.length} releases</span>
                <ChevronDown className="h-3 w-3 opacity-60" />
              </button>

              {showReleasesDropdown && (
                <div className="absolute right-0 top-full z-50 mt-1.5 w-72 rounded-xl border border-white/10 bg-zinc-900/95 p-1.5 shadow-xl backdrop-blur-xl">
                  <div className="max-h-56 space-y-0.5 overflow-y-auto custom-scrollbar">
                    {instantReleases.map((rel) => {
                      const isSelected = rel.info_hash === activeRelease?.info_hash
                      const sizeBytes = parseInt(rel.size, 10)
                      return (
                        <button
                          key={rel.info_hash}
                          onClick={() => switchRelease(rel)}
                          className={cn(
                            'flex w-full flex-col gap-0.5 rounded-lg px-2 py-1.5 text-left text-xs transition-colors',
                            isSelected ? 'bg-white/10 text-white' : 'text-white/70 hover:bg-white/5'
                          )}
                        >
                          <span className="w-full truncate">{rel.name}</span>
                          <span className="flex items-center gap-1.5 text-[10px] font-medium opacity-70">
                            <span>{parseTorrentQuality(rel.name)}</span>
                            {isImaxRelease(rel.name) && (
                              <>
                                <span className="opacity-50">·</span>
                                <span>IMAX</span>
                              </>
                            )}
                            {Number.isFinite(sizeBytes) && sizeBytes > 0 && (
                              <>
                                <span className="opacity-50">·</span>
                                <span>{formatBytes(sizeBytes)}</span>
                              </>
                            )}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          <a
            href={playback.directUrl}
            target="_blank"
            rel="noopener noreferrer"
            title="Open the direct link (VLC, download)"
            className="rounded-full border border-white/10 bg-black/40 p-1.5 text-white/60 transition-colors hover:text-white"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>
    </div>
  )
}
