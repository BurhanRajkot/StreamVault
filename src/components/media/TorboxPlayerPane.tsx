/**
 * TorboxPlayerPane — Automatic Comet-style Debrid Streaming Player
 *
 * Flow:
 *   1. User selects TorBox server on any movie or TV episode.
 *   2. Automatically searches for releases via Comet (many indexers, matched
 *      by IMDb id + season/episode) and, for movies, apibay too.
 *   3. If a cached release is found, it automatically mounts it and streams via
 *      TorBox's high-speed CDN in native 1080p/4K.
 *   4. If nothing is cached yet, the best uncached release is added to TorBox
 *      and polled until ready, then played automatically.
 *   5. Allows switching between different cached releases (4K UHD, 1080p, HDR).
 *   6. If nothing is found at all, provides an instant 1-click fallback to
 *      standard servers.
 */

import { useCallback, useEffect, useState, useRef } from 'react'
import Hls from 'hls.js'
import { useAuth0 } from '@auth0/auth0-react'
import { Link } from 'react-router-dom'
import {
  Loader2,
  AlertTriangle,
  Cloud,
  Crown,
  ExternalLink,
  ChevronDown,
  RefreshCw,
} from 'lucide-react'
import {
  fetchTorboxList,
  startTorboxHls,
  resolveTorboxHlsUrl,
  searchTorboxMedia,
  addTorboxByHash,
  parseTorrentQuality,
  parseTorrentHDR,
  hasIncompatibleAudio,
  isImaxRelease,
  formatBytes,
  type TorboxSearchResult,
  findTorrentForTitle,
  pickPlaybackFile,
} from '@/lib/torboxApi'
import { getAdminToken } from '@/lib/api'
import { cn } from '@/lib/utils'

interface TorboxPlayerPaneProps {
  title: string
  year?: string | number
  /** IMDb id, e.g. "tt1375666" — drives the Comet lookup. Omit to fall back to title-only apibay search (movies only). */
  imdbId?: string | null
  mediaType?: 'movie' | 'tv'
  /** Required (with `episode`) when mediaType is 'tv' — Comet matches per-episode, not by season pack alone. */
  season?: number
  episode?: number
  onSwitchServer: () => void
}

type Status = 'searching' | 'loading-stream' | 'downloading' | 'ready' | 'not-found' | 'error' | 'upgrade-required'

/**
 * True for the 403 the backend sends when the account has no active
 * subscription, or the 401 it sends when there is no account at all —
 * both mean "this needs premium access", just at different login states.
 */
function isUpgradeError(err: unknown): boolean {
  return err instanceof Error && /premium|unauthorized/i.test(err.message)
}

interface DownloadProgress {
  /** 0-1 or 0-100 depending on TorBox API version — normalized before display */
  progress: number
  seeds: number
  downloadSpeed: number
  eta: number
}

/**
 * Rank releases by audio compatibility first, then quality, then IMAX cut,
 * then seeders. The backend now transcodes DTS/TrueHD/Atmos audio to AAC on
 * the fly (see startTorboxHls), so a release with incompatible audio isn't
 * silent anymore — but it does mean a brief transcode window before the
 * player has a full seekable timeline, so a release that's already
 * browser-safe is still preferred when quality is otherwise equal. The
 * backend already caps release size (see MAX_RELEASE_SIZE_BYTES in
 * backend/src/lib/torbox.ts), so a 4K result here is never a 100GB+ remux —
 * just a normal encode that's fine to prefer over 1080p once audio
 * compatibility is equal.
 */
function compareReleases(a: TorboxSearchResult, b: TorboxSearchResult): number {
  const audioDiff = Number(hasIncompatibleAudio(a.name)) - Number(hasIncompatibleAudio(b.name))
  if (audioDiff !== 0) return audioDiff
  const rank = (q: string) => (q === '4K' ? 4 : q === '1080p' ? 3 : q === '720p' ? 2 : 1)
  const rankDiff = rank(parseTorrentQuality(b.name)) - rank(parseTorrentQuality(a.name))
  if (rankDiff !== 0) return rankDiff
  const imaxDiff = Number(isImaxRelease(b.name)) - Number(isImaxRelease(a.name))
  if (imaxDiff !== 0) return imaxDiff
  return parseInt(b.seeders, 10) - parseInt(a.seeders, 10)
}

/**
 * Turn a `startTorboxHls` response into a playable URL + the mode the
 * `<video>` element needs to be driven in. Throws when neither a direct URL
 * nor a playlist URL came back, since that means the backend couldn't
 * resolve a stream at all.
 */
function resolvePlaybackUrl(res: {
  mode: 'direct' | 'hls'
  url?: string
  playlistUrl?: string
}): { url: string; mode: 'direct' | 'hls' } {
  const url = res.mode === 'hls' ? res.playlistUrl && resolveTorboxHlsUrl(res.playlistUrl) : res.url
  if (!url) throw new Error('No stream URL returned')
  return { url, mode: res.mode }
}

function formatEta(seconds: number): string {
  if (!seconds || seconds <= 0) return '—'
  if (seconds < 60) return `${Math.round(seconds)}s`
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return `${m}m ${s}s`
}

export function TorboxPlayerPane({
  title,
  year,
  imdbId,
  mediaType = 'movie',
  season,
  episode,
  onSwitchServer,
}: TorboxPlayerPaneProps) {
  const { isAuthenticated, getAccessTokenSilently } = useAuth0()
  const [status, setStatus] = useState<Status>('searching')
  const [statusMessage, setStatusMessage] = useState('Searching TorBox debrid...')
  const [streamUrl, setStreamUrl] = useState<string | null>(null)
  /** 'hls' when the backend is transcoding audio on the fly (see startTorboxHls) — drives whether hls.js attaches to the <video> element. */
  const [playbackMode, setPlaybackMode] = useState<'direct' | 'hls'>('direct')
  /** True while the backend is still remuxing the file — the timeline behaves like a live stream until this flips (see the hls.js attach effect below). */
  const [isTranscodingLive, setIsTranscodingLive] = useState(false)
  const [cachedReleases, setCachedReleases] = useState<TorboxSearchResult[]>([])
  const [activeRelease, setActiveRelease] = useState<TorboxSearchResult | null>(null)
  const [playbackFailed, setPlaybackFailed] = useState(false)
  const [showReleasesDropdown, setShowReleasesDropdown] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  /** Bumped on every new search/poll so stale polling loops know to stop. */
  const pollGenerationRef = useRef(0)

  const getToken = useCallback(async () => {
    try {
      const adminToken = getAdminToken()
      if (adminToken) return adminToken
      if (isAuthenticated) {
        return await getAccessTokenSilently()
      }
    } catch {
      // Guest or silent token error
    }
    return undefined
  }, [isAuthenticated, getAccessTokenSilently])

  const streamTorrent = useCallback(
    async (release: TorboxSearchResult, token?: string) => {
      setStatus('loading-stream')
      setStatusMessage(`Preparing ${parseTorrentQuality(release.name)} stream...`)
      setPlaybackFailed(false)
      setActiveRelease(release)

      try {
        const addRes = await addTorboxByHash(release.info_hash, release.name, token)

        // TorBox sometimes returns the full file listing inline for an
        // already-cached hash — when it does, skip the full-library
        // `mylist` fetch entirely (it's a shared account's whole torrent
        // list, which is slow) and go straight to requesting a stream URL.
        // A "release" can be a season pack, so we still need *some* file
        // listing to pick the exact episode requested, not just file 0 —
        // fall back to `mylist` when the add response doesn't include one.
        let torrentId = addRes.data?.torrent_id
        let files = addRes.data?.files

        if (!torrentId || !files || files.length === 0) {
          const list = await fetchTorboxList(token)
          const match = list.data?.find(
            (t) => t.hash.toUpperCase() === release.info_hash.toUpperCase()
          )
          torrentId = torrentId ?? match?.id
          files = files && files.length > 0 ? files : match?.files
        }

        if (!torrentId) {
          throw new Error('Could not initialize TorBox stream')
        }

        const file = files ? pickPlaybackFile(files, mediaType, season, episode) : null
        const fileId = file?.id ?? 0

        const hlsRes = await startTorboxHls(torrentId, fileId, token, release.name)
        const { url, mode } = resolvePlaybackUrl(hlsRes)

        setPlaybackMode(mode)
        setStreamUrl(url)
        setStatus('ready')
      } catch (err: unknown) {
        console.error('TorBox stream error:', err)
        setStatus(isUpgradeError(err) ? 'upgrade-required' : 'error')
        setStatusMessage(err instanceof Error ? err.message : 'Failed to load TorBox stream')
      }
    },
    [mediaType, season, episode]
  )

  /**
   * Poll an already-added torrent until TorBox finishes downloading it, then
   * fetch a stream URL and start playback. Used for releases that weren't
   * instantly cached — most releases, in practice, since TorBox's cache is
   * only warm for titles someone already streamed recently.
   */
  const pollTorrentUntilReady = useCallback(
    async (torrentId: number, token: string | undefined, releaseName: string) => {
      const myGeneration = ++pollGenerationRef.current
      const startedAt = Date.now()
      const timeoutMs = 5 * 60 * 1000
      const pollIntervalMs = 4000

      while (pollGenerationRef.current === myGeneration && Date.now() - startedAt < timeoutMs) {
        try {
          const list = await fetchTorboxList(token)
          const torrent = list.data?.find((t) => t.id === torrentId)

          if (torrent) {
            const file = pickPlaybackFile(torrent.files, mediaType, season, episode)
            if ((torrent.download_finished || torrent.cached) && file) {
              const hlsRes = await startTorboxHls(torrentId, file.id, token, releaseName)
              const { url, mode } = resolvePlaybackUrl(hlsRes)
              if (pollGenerationRef.current === myGeneration) {
                setPlaybackMode(mode)
                setStreamUrl(url)
                setStatus('ready')
              }
              return
            }

            if (pollGenerationRef.current === myGeneration) {
              setDownloadProgress({
                progress: torrent.progress,
                seeds: torrent.seeds,
                downloadSpeed: torrent.download_speed,
                eta: torrent.eta,
              })
              setStatusMessage(`Downloading "${releaseName}"...`)
            }
          }
        } catch {
          // Transient network hiccup — keep polling rather than bailing out.
        }

        await new Promise((r) => setTimeout(r, pollIntervalMs))
      }

      if (pollGenerationRef.current === myGeneration) {
        setStatus('not-found')
        setStatusMessage(
          `"${releaseName}" is still downloading in TorBox. Check the TorBox Cloud tab in a few minutes, or switch to a standard server now.`
        )
      }
    },
    [mediaType, season, episode]
  )

  /** Add an uncached release to TorBox and stream it once the download finishes. */
  const downloadAndPlay = useCallback(
    async (release: TorboxSearchResult, token?: string) => {
      setStatus('downloading')
      setStatusMessage(`Adding "${parseTorrentQuality(release.name)}" release to TorBox...`)
      setPlaybackFailed(false)
      setActiveRelease(release)
      setDownloadProgress(null)

      try {
        const addRes = await addTorboxByHash(release.info_hash, release.name, token)
        let torrentId = addRes.data?.torrent_id

        if (!torrentId) {
          const list = await fetchTorboxList(token)
          const match = list.data?.find(
            (t) => t.hash.toUpperCase() === release.info_hash.toUpperCase()
          )
          torrentId = match?.id
        }

        if (!torrentId) {
          throw new Error('Could not add torrent to TorBox')
        }

        await pollTorrentUntilReady(torrentId, token, release.name)
      } catch (err: unknown) {
        console.error('TorBox download error:', err)
        setStatus(isUpgradeError(err) ? 'upgrade-required' : 'error')
        setStatusMessage(err instanceof Error ? err.message : 'Failed to download TorBox release')
      }
    },
    [pollTorrentUntilReady]
  )

  const searchAndPlay = useCallback(async () => {
    // Cancel any poll loop left over from a previous title/retry.
    pollGenerationRef.current++

    setStatus('searching')
    setStatusMessage(`Searching TorBox debrid for "${title}"...`)
    setPlaybackFailed(false)
    setStreamUrl(null)
    setCachedReleases([])
    setActiveRelease(null)
    setDownloadProgress(null)

    const token = await getToken()

    try {
      // 1. Search Comet (matched by IMDb id + season/episode) and, for
      // movies, apibay too — combined and de-duped by the backend.
      const cleanTitle = title.replace(/[^a-zA-Z0-9\s]/g, ' ').trim()
      const queryTitle = year ? `${cleanTitle} ${year}` : cleanTitle

      const searchRes = await searchTorboxMedia(queryTitle, imdbId ?? undefined, mediaType, token, {
        season,
        episode,
        limit: 15,
      })
      const allResults = searchRes.data || []

      const cached = allResults.filter((r) => r.torbox_cached).sort(compareReleases)

      // Prefer an already-cached release — instant playback, no wait.
      if (cached.length > 0) {
        setCachedReleases(cached)
        await streamTorrent(cached[0], token)
        return
      }

      // 3. Check the personal TorBox library — reuse a copy already added
      // instead of adding a duplicate, whether it's ready or still downloading.
      // Movies only: this matches by title text, and for TV that can't tell
      // a season pack (or a different episode of the same show) apart from
      // the exact episode wanted — better to search fresh via Comet below.
      if (mediaType === 'movie') {
        try {
          const list = await fetchTorboxList(token)
          if (list.success && list.data) {
            const torrent = findTorrentForTitle(list.data, title)
            if (torrent) {
              const file = pickPlaybackFile(torrent.files, 'movie')
              if ((torrent.download_finished || torrent.cached) && file) {
                const hlsRes = await startTorboxHls(torrent.id, file.id, token, torrent.name)
                const { url, mode } = resolvePlaybackUrl(hlsRes)
                setPlaybackMode(mode)
                setStreamUrl(url)
                setStatus('ready')
                return
              }

              setStatus('downloading')
              setStatusMessage(`Resuming download of "${torrent.name}"...`)
              await pollTorrentUntilReady(torrent.id, token, torrent.name)
              return
            }
          }
        } catch {
          // Ignore library check failure
        }
      }

      // 4. Nothing cached and nothing already in the library — download the
      // best uncached release and stream it once TorBox finishes fetching it.
      // Comet-sourced results (backend tags them via `username`) are trusted
      // even with an unparsed/zero seeder count — apibay's need a positive
      // count to filter out dead torrents.
      const candidates = allResults
        .filter((r) => r.info_hash && (r.username === 'comet' || parseInt(r.seeders, 10) > 0))
        .sort(compareReleases)

      if (candidates.length > 0) {
        await downloadAndPlay(candidates[0], token)
        return
      }

      // 5. No torrents found for this title at all
      setStatus('not-found')
      setStatusMessage(`No torrents found for "${title}".`)
    } catch (err: unknown) {
      console.error('TorBox search failed:', err)
      setStatus(isUpgradeError(err) ? 'upgrade-required' : 'error')
      setStatusMessage(err instanceof Error ? err.message : 'TorBox search failed')
    }
  }, [title, year, imdbId, mediaType, season, episode, getToken, streamTorrent, pollTorrentUntilReady, downloadAndPlay])

  useEffect(() => {
    void searchAndPlay()
    return () => {
      // Intentionally read the live ref, not a snapshot — this bumps whatever
      // generation is current at unmount/re-run time so any in-flight poll
      // loop (see pollTorrentUntilReady) sees the mismatch and stops.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      pollGenerationRef.current++
    }
  }, [searchAndPlay])

  // Fixed 10s seek on left/right arrow — the browser's native video controls
  // seek by an inconsistent amount (often a % of duration when focus lands on
  // the scrubber, which reads as minutes-long jumps on a 2h movie instead of
  // seconds). Handled globally while a stream is up, not just when the
  // <video> itself has focus, since this view is dedicated to playback.
  useEffect(() => {
    if (status !== 'ready') return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return

      const target = e.target as HTMLElement | null
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return

      const video = videoRef.current
      if (!video) return

      e.preventDefault()
      const delta = e.key === 'ArrowRight' ? 10 : -10
      const next = video.currentTime + delta
      video.currentTime = Number.isFinite(video.duration)
        ? Math.min(Math.max(next, 0), video.duration)
        : Math.max(next, 0)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [status])

  /**
   * Attach the stream to the <video> element. Direct mode just needs the
   * `src` attribute (set in JSX below); HLS mode needs hls.js to demux the
   * playlist/segments into MSE — no browser except Safari understands
   * `.m3u8` natively. This is the other half of the audio-transcode fix:
   * the backend only produces HLS when the source's audio codec needed
   * transcoding, so this path is exactly what makes that playable.
   */
  useEffect(() => {
    if (status !== 'ready' || !streamUrl || playbackMode !== 'hls') return
    const video = videoRef.current
    if (!video) return

    if (Hls.isSupported()) {
      setIsTranscodingLive(true)
      const hls = new Hls()
      hls.loadSource(streamUrl)
      hls.attachMedia(video)
      // The backend writes the HLS playlist progressively while ffmpeg works
      // through the file — hls.js (correctly) treats that as a live stream
      // until #EXT-X-ENDLIST shows up, which is why the timeline looks
      // live-like at first. Track that so the UI can explain it instead of
      // looking broken; it flips once the whole file's been remuxed.
      hls.on(Hls.Events.LEVEL_UPDATED, (_event, data) => {
        setIsTranscodingLive(!!data.details?.live)
      })
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          console.error('TorBox HLS playback error:', data)
          setPlaybackFailed(true)
        }
      })
      return () => {
        hls.destroy()
        setIsTranscodingLive(false)
      }
    }

    // Safari has no MSE-based hls.js support but plays .m3u8 natively.
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = streamUrl
      return () => {
        video.removeAttribute('src')
      }
    }

    setPlaybackFailed(true)
  }, [status, streamUrl, playbackMode])

  /**
   * Detect "plays fine, no sound" — the common outcome when a release's
   * audio track (DTS/TrueHD/Atmos, near-universal on BluRay remuxes, which
   * 4K releases skew heavily toward) can't be decoded by the browser. This
   * does NOT fire the <video> `error` event: the video track decodes and
   * plays normally, so from the element's perspective playback succeeded.
   * `webkitAudioDecodedByteCount` (Chromium/WebKit) staying at 0 while the
   * video is actively advancing is the standard way to catch this — treat it
   * the same as a hard playback failure so the existing fallback UI (open
   * externally in VLC, or try another cached release) kicks in instead of
   * silently looping a mute video. No equivalent API exists on Firefox, so
   * this is best-effort there rather than a guarantee.
   */
  useEffect(() => {
    if (status !== 'ready' || !streamUrl) return
    const video = videoRef.current
    if (!video) return

    const el = video as HTMLVideoElement & { webkitAudioDecodedByteCount?: number }
    if (typeof el.webkitAudioDecodedByteCount !== 'number') return

    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null

    const checkAudio = () => {
      if (cancelled) return
      if (!video.paused && video.currentTime > 0 && el.webkitAudioDecodedByteCount === 0) {
        setPlaybackFailed(true)
      }
    }

    const handlePlaying = () => {
      if (timer) clearTimeout(timer)
      // Give decoding a few seconds to ramp up before judging it silent.
      timer = setTimeout(checkAudio, 3000)
    }

    video.addEventListener('playing', handlePlaying)
    if (!video.paused) handlePlaying()

    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
      video.removeEventListener('playing', handlePlaying)
    }
  }, [status, streamUrl])

  // --- Loading / Searching state ---
  if (status === 'searching' || status === 'loading-stream') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <Loader2 className="h-6 w-6 animate-spin text-white/50" />
        <p className="max-w-xs text-sm text-white/70">{statusMessage}</p>
        <button
          onClick={onSwitchServer}
          className="text-xs text-white/40 underline underline-offset-4 transition-colors hover:text-white/70"
        >
          Switch to standard server
        </button>
      </div>
    )
  }

  // --- Downloading state: release added to TorBox, waiting for it to finish ---
  if (status === 'downloading') {
    const rawProgress = downloadProgress?.progress ?? 0
    const pct = Math.min(100, Math.round(rawProgress > 1 ? rawProgress : rawProgress * 100))

    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <Loader2 className="h-6 w-6 animate-spin text-white/50" />
        <div className="w-full max-w-xs space-y-2">
          <p className="text-sm text-white/70">
            {activeRelease
              ? `Downloading ${parseTorrentQuality(activeRelease.name)} release...`
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
                {pct}% · {formatBytes(downloadProgress.downloadSpeed)}/s · {downloadProgress.seeds} seeds · ETA {formatEta(downloadProgress.eta)}
              </p>
            </>
          )}
        </div>
        <button
          onClick={onSwitchServer}
          className="text-xs text-white/40 underline underline-offset-4 transition-colors hover:text-white/70"
        >
          Switch to standard server
        </button>
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
          <p className="text-sm font-medium text-white">TorBox is a premium feature</p>
          <p className="max-w-xs text-xs text-white/50">
            {isAuthenticated
              ? 'Upgrade your account to stream instantly via TorBox debrid.'
              : 'Sign in and upgrade to stream instantly via TorBox debrid.'}
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

  // --- Not found state ---
  if (status === 'not-found') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <div className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/5">
          <Cloud className="h-5 w-5 text-white/40" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-medium text-white">No TorBox stream available</p>
          <p className="max-w-xs text-xs text-white/50">
            {statusMessage || `No torrents found for "${title}".`}
          </p>
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
            title="Retry TorBox search"
            className="flex items-center justify-center rounded-full border border-white/10 p-2 text-white/50 transition-colors hover:border-white/30 hover:text-white"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    )
  }

  // --- Error state ---
  if (status === 'error') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <AlertTriangle className="h-6 w-6 text-destructive" />
        <p className="max-w-xs text-sm text-white/70">{statusMessage}</p>
        <div className="mt-1 flex items-center gap-2">
          <button
            onClick={onSwitchServer}
            className="rounded-full bg-white px-5 py-2 text-xs font-medium text-black transition-colors hover:bg-white/90"
          >
            Switch to Standard Server
          </button>
          <button
            onClick={() => void searchAndPlay()}
            className="rounded-full border border-white/10 px-4 py-2 text-xs text-white/70 transition-colors hover:border-white/30 hover:text-white"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  // --- Codec / inline playback error state ---
  if (playbackFailed) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <AlertTriangle className="h-6 w-6 text-destructive" />
        <div className="space-y-1">
          <p className="text-sm font-medium text-white">Playback not supported</p>
          <p className="max-w-sm text-xs text-white/50">
            This release uses a container or audio codec (e.g. MKV TrueHD/DTS) your browser can&apos;t decode inline.
          </p>
        </div>
        <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
          {streamUrl && (
            <a
              href={streamUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-xs font-medium text-black transition-colors hover:bg-white/90"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open in VLC / browser
            </a>
          )}
          {cachedReleases.length > 1 && (
            <button
              onClick={() => {
                const next = cachedReleases.find((r) => r.info_hash !== activeRelease?.info_hash)
                if (next) void streamTorrent(next)
              }}
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

  // --- Ready state: native video playback with a minimal hover-in overlay ---
  const activeQuality = activeRelease ? parseTorrentQuality(activeRelease.name) : 'HD'
  const activeHDR = activeRelease ? parseTorrentHDR(activeRelease.name) : null
  const activeIMAX = activeRelease ? isImaxRelease(activeRelease.name) : false

  return (
    <div className="group relative h-full w-full select-none overflow-hidden bg-black">
      <video
        ref={videoRef}
        key={streamUrl}
        src={playbackMode === 'direct' ? streamUrl ?? undefined : undefined}
        controls
        autoPlay
        playsInline
        className="absolute inset-0 h-full w-full bg-black object-contain"
        onError={() => setPlaybackFailed(true)}
      />

      {isTranscodingLive && (
        <div className="absolute left-3 top-3 z-30 flex items-center gap-1.5 rounded-full border border-white/10 bg-black/60 px-3 py-1.5 text-[11px] text-white/70 backdrop-blur-sm">
          <Loader2 className="h-3 w-3 animate-spin" />
          <span>Optimizing audio — full seeking available shortly</span>
        </div>
      )}

      <div className="absolute inset-x-0 top-0 z-30 flex items-center justify-between gap-3 bg-gradient-to-b from-black/70 to-transparent p-3 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
        <div className="flex min-w-0 items-center gap-2">
          <span className="rounded border border-white/15 bg-white/5 px-1.5 py-0.5 text-[10px] font-medium text-white/70">
            {activeQuality}
          </span>
          {activeHDR && (
            <span className="rounded border border-white/15 bg-white/5 px-1.5 py-0.5 text-[10px] font-medium text-white/70">
              {activeHDR}
            </span>
          )}
          {activeIMAX && (
            <span className="rounded border border-white/15 bg-white/5 px-1.5 py-0.5 text-[10px] font-medium text-white/70">
              IMAX
            </span>
          )}
          {activeRelease && (
            <span className="hidden max-w-[260px] truncate text-xs text-white/50 sm:inline">
              {activeRelease.name}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {cachedReleases.length > 1 && (
            <div className="relative">
              <button
                onClick={() => setShowReleasesDropdown(!showReleasesDropdown)}
                className="flex items-center gap-1.5 rounded-full border border-white/10 bg-black/40 px-2.5 py-1 text-xs text-white/70 transition-colors hover:text-white"
              >
                <span>{cachedReleases.length} releases</span>
                <ChevronDown className="h-3 w-3 opacity-60" />
              </button>

              {showReleasesDropdown && (
                <div className="absolute right-0 top-full z-50 mt-1.5 w-72 rounded-xl border border-white/10 bg-zinc-900/95 p-1.5 shadow-xl backdrop-blur-xl">
                  <div className="max-h-56 space-y-0.5 overflow-y-auto custom-scrollbar">
                    {cachedReleases.map((rel) => {
                      const isSelected = rel.info_hash === activeRelease?.info_hash
                      const q = parseTorrentQuality(rel.name)
                      const isImax = isImaxRelease(rel.name)
                      const sizeBytes = parseInt(rel.size, 10)
                      return (
                        <button
                          key={rel.info_hash}
                          onClick={() => {
                            setShowReleasesDropdown(false)
                            void streamTorrent(rel)
                          }}
                          className={cn(
                            'flex w-full flex-col gap-0.5 rounded-lg px-2 py-1.5 text-left text-xs transition-colors',
                            isSelected ? 'bg-white/10 text-white' : 'text-white/70 hover:bg-white/5'
                          )}
                        >
                          <span className="w-full truncate">{rel.name}</span>
                          <span className="flex items-center gap-1.5 text-[10px] font-medium opacity-70">
                            <span>{q}</span>
                            {isImax && (
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

          {streamUrl && (
            <a
              href={streamUrl}
              target="_blank"
              rel="noopener noreferrer"
              title="Open stream URL"
              className="rounded-full border border-white/10 bg-black/40 p-1.5 text-white/60 transition-colors hover:text-white"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
      </div>
    </div>
  )
}
