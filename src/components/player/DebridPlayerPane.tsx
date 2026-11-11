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
  parseTorrentQuality,
  parseTorrentHDR,
  isImaxRelease,
  formatBytes,
  DebridRequestError,
  type DebridRelease,
  type DebridReadyPlayback,
} from '@/lib/debridApi'
import {
  declaresBrowserAudio,
  detectBrowserVideoSupport,
  isLikelyDirectPlayable,
  planPlaybackModes,
  rankReleasesForPlayback,
} from '@/lib/releasePlayback'
import { knownEdge, nearestEdge, type EdgeChoice } from '@/lib/debridHost'
import { findPremiumReleases } from '@/lib/premiumSearch'
import { useDebridToken } from '@/hooks/useDebridToken'
import { useSubtitles } from '@/hooks/useSubtitles'
import { formatPlayerTime, readResumePosition, resumeKey, saveResumePosition } from '@/lib/playbackPosition'
import { formatPromoDate, useDebridFreeUntil } from '@/hooks/useDebridPromo'
import { recordPremiumPlay } from '@/lib/supportPrompt'
import { DebridVideo } from './DebridVideo'
import { PaneBackdrop, PremiumLoading } from './PremiumLoading'
import { SupportPrompt } from './SupportPrompt'
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
 * seeking. They're asked about at once — one round trip (~3-4s) rather than
 * one each — and only those whose names don't already rule direct play out.
 */
const MAX_DIRECT_PLAY_PROBES = 2

/**
 * Of those, how many are asked about alongside the first pick, before it's
 * known whether it needs the transcode — when its name doesn't promise
 * browser-safe audio, it often does (Dolby audio in a name that doesn't say
 * so, a second language first). That saves the second round trip (~2.5s,
 * the "Looking for a release your browser can play directly" step on
 * Sinners, 2026-11-10) at the cost of one extra lookup when it didn't.
 */
const SPECULATIVE_DIRECT_PLAY_PROBES = 1

/** One release, as Real-Debrid answered for it (see streamRelease). */
type Attempt =
  | { kind: 'ready'; playback: DebridReadyPlayback; direct: boolean }
  | { kind: 'skipped' }
  /** Refused for a reason every release shares (no access, account down) — stop trying. */
  | { kind: 'stop'; status: Status; message: string }

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
  const { isAuthenticated } = useAuth0()
  const getToken = useDebridToken()
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
  /** The current file has shown its first frame. */
  const [videoStarted, setVideoStarted] = useState(false)
  /** Real-Debrid's download server nearest this viewer — measured while the release is found (lib/debridHost). */
  const [edge, setEdge] = useState<EdgeChoice | undefined>(() => knownEdge())
  /** The star/coffee prompt, shown in place of the video until dismissed (see lib/supportPrompt). */
  const [supportPrompt, setSupportPrompt] = useState(false)
  /** The title/episode last counted as a Premium play — switching release or retrying doesn't count again. */
  const countedPlayKeyRef = useRef<string | null>(null)
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

  // Searched once a file is ready to play: the versions are ranked for it.
  const subtitles = useSubtitles(
    {
      imdbId,
      mediaType,
      season,
      episode,
      fileName: playback?.fileName,
      duration: playback?.media?.duration,
    },
    getToken
  )

  // ~1s, in parallel with finding and starting a release (3s and more).
  useEffect(() => {
    let live = true
    void nearestEdge().then((e) => {
      if (live) setEdge(e)
    })
    return () => {
      live = false
    }
  }, [])

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

  /**
   * Where a newly resolved file should start: wherever the viewer already is
   * (switching release mid-film), else the saved resume point.
   */
  const startPositionRef = useRef<number | undefined>(undefined)

  const showPlayback = useCallback((release: DebridRelease, ready: DebridReadyPlayback) => {
    const start = startPositionRef.current
    playingKeyRef.current = storageKeyRef.current
    if (countedPlayKeyRef.current !== storageKeyRef.current) {
      countedPlayKeyRef.current = storageKeyRef.current
      if (recordPremiumPlay()) setSupportPrompt(true)
    }
    setActiveRelease(release)
    setPlayback(ready)
    setStartAt(start)
    setResumeToast(!!start && start > 0)
    setVideoStarted(false)
    setPlaybackFailed(false)
    setDownloadProgress(null)
    setStatus('ready')
  }, [])

  // Counted from the first frame: the toast isn't on screen before that.
  useEffect(() => {
    if (!resumeToast || !videoStarted) return
    const timer = setTimeout(() => setResumeToast(false), 8000)
    return () => clearTimeout(timer)
  }, [resumeToast, videoStarted])

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
    setVideoStarted(false)
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
   * when the resolved file would need Real-Debrid's transcode, ask about a
   * couple more cached releases — together — for one that plays directly,
   * before settling for it.
   */
  const streamRelease = useCallback(
    async (release: DebridRelease, token?: string, opts: { preferDirect?: boolean } = {}) => {
      const generation = ++generationRef.current
      const support = detectBrowserVideoSupport()
      /** A cached-tagged release already in the account but still downloading — polled if nothing else works. */
      let downloadingFallback: { torrentId: string; release: DebridRelease } | null = null

      /** Ask Real-Debrid for one release, and note what its answer says about it. */
      const attempt = async (rel: DebridRelease): Promise<Attempt> => {
        triedReleasesRef.current.add(rel.info_hash)
        autoAttemptsRef.current++
        try {
          const res = await playDebridRelease(rel, token, {
            ...episodeOpts,
            instantOnly: rel.cached || probingRef.current,
          })
          const current = generationRef.current === generation
          if (res.status === 'ready') {
            if (probingRef.current && current) {
              // Proven instant — offer it in the picker.
              const proven: DebridRelease = { ...rel, cached: true }
              setInstantReleases((prev) => (prev.some((r) => r.info_hash === proven.info_hash) ? prev : [...prev, proven]))
            }
            return { kind: 'ready', playback: res, direct: planPlaybackModes(res, support)[0]?.kind !== 'hls' }
          }
          if (res.status === 'not-cached') {
            notInstantRef.current.add(rel.info_hash)
            // Stale cache tag — drop it from the picker too.
            if (current) setInstantReleases((prev) => prev.filter((r) => r.info_hash !== rel.info_hash))
          } else if (res.status === 'downloading' && !downloadingFallback) {
            downloadingFallback = { torrentId: res.torrentId, release: rel }
          }
          console.warn(`Real-Debrid release not playable (${res.status}), trying another:`, rel.name)
        } catch (err: unknown) {
          if (isUpgradeError(err)) {
            return { kind: 'stop', status: 'upgrade-required', message: err instanceof Error ? err.message : 'Premium required' }
          }
          if (isDebridUnavailable(err)) return { kind: 'stop', status: 'error', message: err.message }
          console.warn('Real-Debrid release could not start, trying another:', rel.name, err)
        }
        return { kind: 'skipped' }
      }

      /** Each release is asked about once per run: one asked ahead (speculatively) is reused when its turn comes. */
      const answers = new Map<string, Promise<Attempt>>()
      const ask = (rel: DebridRelease): Promise<Attempt> => {
        let answer = answers.get(rel.info_hash)
        if (!answer) {
          answer = attempt(rel)
          answers.set(rel.info_hash, answer)
        }
        return answer
      }
      /** Releases whose answer this loop has acted on. */
      const settled = new Set<string>()
      /** Not acted on yet, and either already asked about or still untried. */
      const open = (r: DebridRelease) =>
        !settled.has(r.info_hash) && (answers.has(r.info_hash) || !triedReleasesRef.current.has(r.info_hash))

      let current: DebridRelease | null = release
      let speculated = !opts.preferDirect
      while (current) {
        const playing: DebridRelease = current
        setStatus('loading-stream')
        setStatusMessage(
          autoAttemptsRef.current > 0
            ? `Trying another release (${parseTorrentQuality(playing.name)})…`
            : `Starting the ${parseTorrentQuality(playing.name)} stream…`
        )
        setPlaybackFailed(false)
        setActiveRelease(playing)

        const answer = ask(playing)
        if (!speculated) {
          speculated = true
          // A name that promises browser-safe audio usually plays directly;
          // any other may well need the transcode, so ask about the next
          // likely-direct release at the same time.
          if (!(declaresBrowserAudio(playing.name) && isLikelyDirectPlayable(playing.name, support))) {
            releaseQueueRef.current
              .filter((r) => r.info_hash !== playing.info_hash && open(r) && isLikelyDirectPlayable(r.name, support))
              .slice(0, Math.max(0, Math.min(SPECULATIVE_DIRECT_PLAY_PROBES, MAX_AUTO_RELEASE_ATTEMPTS - autoAttemptsRef.current)))
              .forEach((r) => void ask(r))
          }
        }

        const result = await answer
        settled.add(playing.info_hash)
        if (generationRef.current !== generation) return
        if (result.kind === 'stop') {
          setStatus(result.status)
          setStatusMessage(result.message)
          return
        }
        if (result.kind === 'ready') {
          if (result.direct || !opts.preferDirect) {
            showPlayback(playing, result.playback)
            return
          }
          // Those already asked about first, then fresh ones while the attempt budget lasts.
          let fresh = Math.max(0, MAX_AUTO_RELEASE_ATTEMPTS - autoAttemptsRef.current)
          const candidates: DebridRelease[] = []
          for (const r of releaseQueueRef.current) {
            if (candidates.length >= MAX_DIRECT_PLAY_PROBES) break
            if (r.info_hash === playing.info_hash || !open(r) || !isLikelyDirectPlayable(r.name, support)) continue
            if (answers.has(r.info_hash)) candidates.push(r)
            else if (fresh > 0) {
              fresh--
              candidates.push(r)
            }
          }
          if (candidates.length > 0) {
            setStatusMessage('Looking for a release your browser can play directly…')
            // Whatever turns up, the transcode is still the likeliest outcome: have its player ready.
            void import('hls.js').catch(() => {})
            const pending = candidates.map(ask)
            // Best-ranked first, even if a later one answers sooner.
            for (let i = 0; i < candidates.length; i++) {
              const candidate = await pending[i]
              settled.add(candidates[i].info_hash)
              if (generationRef.current !== generation) return
              if (candidate.kind === 'ready' && candidate.direct) {
                showPlayback(candidates[i], candidate.playback)
                return
              }
            }
          }
          showPlayback(playing, result.playback)
          return
        }

        current =
          releaseQueueRef.current.find(
            (r) => open(r) && (answers.has(r.info_hash) || autoAttemptsRef.current < MAX_AUTO_RELEASE_ATTEMPTS)
          ) ?? null
      }

      // TS can't see the assignment inside `attempt`.
      const stillDownloading = downloadingFallback as { torrentId: string; release: DebridRelease } | null
      if (stillDownloading) {
        setStatus('downloading')
        setActiveRelease(stillDownloading.release)
        await pollUntilReady(stillDownloading.torrentId, stillDownloading.release, token, generation)
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

  /** `fresh`: search again rather than reuse the title page's search (Try again). */
  const searchAndPlay = useCallback(async ({ fresh = false }: { fresh?: boolean } = {}) => {
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
      const releases = await findPremiumReleases({ title, year, imdbId, mediaType, season, episode }, token, { fresh })
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
      <PremiumLoading
        backdropUrl={backdropUrl}
        testId="debrid-loading"
        onSwitchServer={onSwitchServer}
        title={title}
        episodeLine={episodeLine}
        step={status === 'searching' ? 'find' : 'prepare'}
        percent={downloading ? pct : null}
        message={
          status === 'downloading' && activeRelease
            ? `Downloading the ${parseTorrentQuality(activeRelease.name)} release${downloading ? ` · ${pct}%` : '…'}`
            : statusMessage
        }
        detail={downloading ? `${formatBytes(downloadProgress.speed)}/s · ${downloadProgress.seeders} peers` : undefined}
      />
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
          <button onClick={() => void searchAndPlay({ fresh: true })} className={secondaryAction}>
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

  // --- Ready, but asking for a star or a coffee first ---
  if (supportPrompt) {
    return (
      <PaneBackdrop backdropUrl={backdropUrl}>
        <SupportPrompt onDismiss={() => setSupportPrompt(false)} />
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
        subtitles={subtitles}
        onStarted={() => setVideoStarted(true)}
        edge={edge}
        loadingScreen={(message) => (
          <PremiumLoading
            backdropUrl={backdropUrl}
            testId="debrid-starting"
            onSwitchServer={onSwitchServer}
            title={title}
            episodeLine={episodeLine}
            step="start"
            message={message}
          />
        )}
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
