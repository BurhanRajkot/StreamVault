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
 *   8. On a slow connection (measured while the release is found, see
 *      lib/connection) the first pick is a release the line can carry, and
 *      a heavy file (HEAVY_FILE_KBPS) never is when a lighter one of the
 *      same resolution is there. A connection that drops mid-film is
 *      reconnected in place (DebridVideo); one that stays down ends on
 *      "Connection lost", which picks the film up where it stopped once the
 *      browser is back online.
 *   9. A film that doesn't play smoothly — it keeps stalling, or the device
 *      drops frames — is moved to a release that should, the way a viewer
 *      would from the Quality menu: found in the background while the film
 *      plays on, started where the viewer is, with a notice that can undo
 *      it (see handleStruggle).
 */

import { useCallback, useEffect, useMemo, useState, useRef, type ReactNode } from 'react'
import { ExternalLink, RefreshCw, X } from 'lucide-react'
import {
  playDebridRelease,
  pollDebridPlayback,
  parseTorrentQuality,
  parseTorrentHDR,
  isImaxRelease,
  formatBytes,
  DebridRequestError,
  isNetworkFailure,
  type DebridRelease,
  type DebridReadyPlayback,
} from '@/lib/debridApi'
import {
  declaresBrowserAudio,
  detectBrowserVideoSupport,
  isLikelyDirectPlayable,
  playsWithoutRdTranscode,
  replacementReleases,
  type StruggleCause,
} from '@/lib/releasePlayback'
import { appConvertsAudio } from '@/lib/localStream'
import {
  DEFAULT_AUDIO_LANGUAGE,
  channelLabel,
  languageName,
  releaseHasLanguage,
  releaseLanguageRank,
  releaseLanguages,
  trackLanguage,
  withAudioLanguage,
  withAudioTrack,
  type AudioLanguage,
} from '@/lib/audioLanguage'
import { estimateConnection, knownThroughput } from '@/lib/connection'
import { knownEdge, nearestEdge, type EdgeChoice } from '@/lib/debridHost'
import { findPremiumReleases, type PremiumReleaseSource } from '@/lib/premiumSearch'
import { CONNECTION_WAIT_MS, MAX_AUTO_RELEASE_ATTEMPTS, planPlayback, preferWarmed, takeWarmPlayback } from '@/lib/premiumWarm'
import { useDebridToken } from '@/hooks/useDebridToken'
import { useSubtitles } from '@/hooks/useSubtitles'
import { formatPlayerTime, readResumePosition, resumeKey, saveResumePosition } from '@/lib/playbackPosition'
import { useQueryClient } from '@tanstack/react-query'
import { clearAdminToken } from '@/lib/api'
import { MY_ACCESS_QUERY_KEY, usePremiumAccess } from '@/hooks/usePremiumAccess'
import { DebridVideo, type Struggle } from './DebridVideo'
import { ActionRow, PaneBackdrop, PremiumLoading, StatusMessage, primaryAction, secondaryAction } from './PremiumLoading'
import type { PlayerAudio, PlayerAudioOption, PlayerSource } from './PlayerControls'

export interface DebridPlayerPaneProps {
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
  /** Extra buttons at the right of the player's top bar. */
  topActions?: ReactNode
  /**
   * How long the film (or episode) runs, in minutes, when known — with the
   * connection's speed it says which releases play without stalling.
   */
  runtimeMinutes?: number | null
  /**
   * Where the releases come from, when not the title search — the F1
   * archive's (lib/f1). Its key also keys the resume point.
   */
  releaseSource?: PremiumReleaseSource
  /** The line under the title when it isn't an episode's — "2025 · Round 24 · Race". */
  subtitle?: string
  /** What the way out is called — "Switch server" unless the page has no other servers. */
  exitLabel?: string
  /**
   * The audio language to play (lib/audioLanguage): releases in it go first,
   * and a file's track in it plays. English when not given.
   */
  audioLanguage?: AudioLanguage
  /** The viewer picked another language in the player — to keep for this title. */
  onAudioLanguageChange?: (lang: AudioLanguage) => void
}

/** What the page shows under the player: the releases to switch between, and the playing file to save. */
export interface ReleaseControls {
  /** The instant releases, as the player's Quality menu lists them — the playing one always included. */
  releases: PlayerSource[]
  activeId: string | null
  onSelect: (id: string) => void
  /** The playing file — null until a release is ready, or when downloads are paused. */
  download: { url: string; fileName: string; size: string | null } | null
  /** False when the admin paused this account's Premium downloads: no Download button at all. */
  canDownload: boolean
  /** A release is being found or started. */
  busy: boolean
}

/** "1080p · 4.2 GB" — how the notices name a release. */
function releaseLabel(rel: DebridRelease): string {
  const source = toPlayerSource(rel)
  return source.size ? `${source.label} · ${source.size}` : source.label
}

/** A release as the Quality menu and the release picker list it. */
function toPlayerSource(rel: DebridRelease): PlayerSource {
  const size = parseInt(rel.size, 10)
  const hdr = parseTorrentHDR(rel.name)
  return {
    id: rel.info_hash,
    label: parseTorrentQuality(rel.name),
    tags: [hdr, isImaxRelease(rel.name) ? 'IMAX' : null, languageTag(rel)].filter((t): t is string => !!t),
    size: Number.isFinite(size) && size > 0 ? formatBytes(size) : undefined,
    name: rel.name,
  }
}

/** "Hindi", "Hindi + English", "Multi-audio" — the languages a release says it has, when it says. */
function languageTag(rel: DebridRelease): string | null {
  const langs = releaseLanguages(rel)
  const named = [...langs].filter((l) => l.length === 2 && l !== 'in').map(languageName)
  if (named.length > 0) return named.length > 2 ? `${named.slice(0, 2).join(' + ')} +${named.length - 2}` : named.join(' + ')
  if (langs.has('multi')) return 'Multi-audio'
  if (langs.has('in')) return 'Indian audio'
  return null
}

/** Languages the player offers a whole other version in, when the playing file hasn't got them. */
const SWITCHABLE_LANGUAGES: AudioLanguage[] = ['hi', 'en']

type Status = 'searching' | 'loading-stream' | 'downloading' | 'ready' | 'not-found' | 'error' | 'access-refused'

/**
 * 401/403: the backend refused this viewer — an admin token that expired, or
 * an account whose Premium access was paused or taken away meanwhile.
 */
function isAccessRefused(err: unknown): boolean {
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
 * Releases asked about alongside the one being started, when nothing says
 * which are in Real-Debrid's cache (probing — an F1 archive's releases, or
 * when Torrentio is unreachable). One at a time, a run of releases that
 * aren't cached cost ~3 s each before one played; asked a few at once, the
 * best-ranked instant one starts as soon as its own answer is in.
 */
const PROBE_LOOKAHEAD = 2

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
  /** Refused for a reason every release shares (no access, account down, no connection) — stop trying. */
  | { kind: 'stop'; status: Status; message: string; offline?: boolean }

/** Past this much playback, a failure is shown rather than silently restarting the viewer on another release. */
const AUTO_SWITCH_MAX_POSITION_S = 30

/** How long an uncached release is polled before giving up on waiting for it here. */
const DOWNLOAD_POLL_TIMEOUT_MS = 15 * 60 * 1000
const DOWNLOAD_POLL_INTERVAL_MS = 5000

// How long the pick waits for the connection's measurement: CONNECTION_WAIT_MS,
// shared with the title page's warm-up (lib/premiumWarm) so both pick alike.

/**
 * Automatic moves to a smoother release per title or episode. Past that —
 * or once the viewer has undone one — a film that struggles gets an offer
 * instead, and the choice is theirs.
 */
const MAX_AUTO_SWITCHES = 2

/** How long the notice of an automatic switch stays up once the new file plays. */
const SWITCH_NOTICE_MS = 12_000

/** What the notice and the offer say about the file being left. */
const STRUGGLE_REASON: Record<StruggleCause, string> = {
  stalls: 'the last copy kept stalling',
  frames: 'the last copy wasn’t playing smoothly on this device',
}

/** A running time to size releases by when the title's isn't known, in minutes. */
const TYPICAL_RUNTIME_MIN = { movie: 120, tv: 45 } as const

const NETWORK_ERROR_MESSAGE = 'Couldn’t reach Premium — check your connection, then try again.'

/** `promise`'s value if it settles within `ms`, else null. Never rejects. */
function within<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      () => {
        clearTimeout(timer)
        resolve(null)
      }
    )
  })
}

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
  topActions,
  runtimeMinutes,
  releaseSource,
  subtitle,
  exitLabel = 'Switch server',
  audioLanguage = DEFAULT_AUDIO_LANGUAGE,
  onAudioLanguageChange,
}: DebridPlayerPaneProps) {
  /**
   * Read when a search or a file starts, not watched: picking a language in
   * the player switches the track or the release itself, without searching
   * again.
   */
  const audioLangRef = useRef(audioLanguage)
  useEffect(() => {
    audioLangRef.current = audioLanguage
  }, [audioLanguage])
  const getToken = useDebridToken()
  /** The file itself may be offered (save, VLC) — the admin can pause that per account. */
  const { downloads: downloadsAllowed } = usePremiumAccess()
  const [status, setStatus] = useState<Status>('searching')
  // Refused: drop an admin token the backend no longer takes, and ask again
  // what this viewer may use — PremiumPane then shows the right notice.
  const queryClient = useQueryClient()
  useEffect(() => {
    if (status !== 'access-refused') return
    clearAdminToken()
    void queryClient.invalidateQueries({ queryKey: [MY_ACCESS_QUERY_KEY] })
  }, [status, queryClient])
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
  /**
   * Where the film stood when the connection went and stayed down, in
   * seconds — null while it hasn't. Playback resumes there once it's back.
   */
  const [lostAt, setLostAt] = useState<number | null>(null)
  const connectionLost = lostAt !== null
  /** The last search or start failed because the request didn't get through: try again once online. */
  const [failedOffline, setFailedOffline] = useState(false)
  /** A smoother release to offer, for a film that isn't playing smoothly (when it isn't switched automatically). */
  const [lighterOffer, setLighterOffer] = useState<{ release: DebridRelease; cause: StruggleCause } | null>(null)
  /** The release the player just moved to by itself, and the one it left — for the notice and its Undo. */
  const [autoSwitch, setAutoSwitch] = useState<{ from: DebridRelease; to: DebridRelease; cause: StruggleCause } | null>(null)
  /** Automatic switches so far for this title or episode. */
  const autoSwitchesRef = useRef(0)
  /** The viewer undid an automatic switch: for this title, offer rather than switch. */
  const autoSwitchOffRef = useRef(false)
  /** How long the film runs, in seconds — the title's own figure, or a typical one. */
  const expectedDurationS = (runtimeMinutes && runtimeMinutes > 0 ? runtimeMinutes : TYPICAL_RUNTIME_MIN[mediaType]) * 60
  /** Read by the search without being one of its inputs: details landing late mustn't search again. */
  const expectedDurationRef = useRef(expectedDurationS)
  expectedDurationRef.current = expectedDurationS
  /** The title's own running time, in seconds — undefined when only the typical one is to go by. */
  const knownDurationRef = useRef<number | undefined>(undefined)
  knownDurationRef.current = runtimeMinutes && runtimeMinutes > 0 ? runtimeMinutes * 60 : undefined

  /** Read by the search without being one of its inputs: only its key says it changed. */
  const releaseSourceRef = useRef(releaseSource)
  releaseSourceRef.current = releaseSource
  const releaseSourceKey = releaseSource?.key
  const releaseSession = releaseSource?.session

  const episodeOpts = useMemo(
    () => (mediaType === 'tv' ? { season, episode } : releaseSession ? { session: releaseSession } : {}),
    [mediaType, season, episode, releaseSession]
  )

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
    () =>
      resumeKey(
        releaseSourceKey || imdbId || `${title}:${year ?? ''}`,
        mediaType === 'tv' ? season : undefined,
        mediaType === 'tv' ? episode : undefined
      ),
    [releaseSourceKey, imdbId, title, year, mediaType, season, episode]
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

  /** `resumeToast: false` when the start position isn't a resume point (an automatic switch has its own notice). */
  const showPlayback = useCallback((release: DebridRelease, ready: DebridReadyPlayback, { resumeToast = true } = {}) => {
    const start = startPositionRef.current
    playingKeyRef.current = storageKeyRef.current
    setActiveRelease(release)
    setPlayback(withAudioLanguage(ready, audioLangRef.current))
    setStartAt(start)
    setResumeToast(resumeToast && !!start && start > 0)
    setAutoSwitch(null)
    setVideoStarted(false)
    setPlaybackFailed(false)
    setLostAt(null)
    setLighterOffer(null)
    setDownloadProgress(null)
    setStatus('ready')
  }, [])

  // Counted from the first frame: the toast isn't on screen before that.
  useEffect(() => {
    if (!resumeToast || !videoStarted) return
    const timer = setTimeout(() => setResumeToast(false), 8000)
    return () => clearTimeout(timer)
  }, [resumeToast, videoStarted])
  useEffect(() => {
    if (!autoSwitch || !videoStarted) return
    const timer = setTimeout(() => setAutoSwitch(null), SWITCH_NOTICE_MS)
    return () => clearTimeout(timer)
  }, [autoSwitch, videoStarted])

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
        setStatus(isAccessRefused(err) ? 'access-refused' : 'error')
        setFailedOffline(isNetworkFailure(err))
        setStatusMessage(
          isNetworkFailure(err) ? NETWORK_ERROR_MESSAGE : err instanceof Error ? err.message : 'Failed to download release'
        )
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
          const instantOnly = rel.cached || probingRef.current
          // Got ready while the viewer was still on the title's page (lib/premiumWarm)
          const warm = instantOnly ? takeWarmPlayback(rel, episodeOpts) : null
          const askNow = () => playDebridRelease(rel, token, { ...episodeOpts, instantOnly })
          const res = warm ? await warm.catch(askNow) : await askNow()
          const current = generationRef.current === generation
          if (res.status === 'ready') {
            const ready = withAudioLanguage(res, audioLangRef.current)
            if (probingRef.current && current) {
              // Proven instant — offer it in the picker.
              const proven: DebridRelease = { ...rel, cached: true }
              setInstantReleases((prev) => (prev.some((r) => r.info_hash === proven.info_hash) ? prev : [...prev, proven]))
            }
            return { kind: 'ready', playback: ready, direct: playsWithoutRdTranscode(ready, support, appConvertsAudio()) }
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
          if (isAccessRefused(err)) {
            return { kind: 'stop', status: 'access-refused', message: 'Premium access required' }
          }
          if (isDebridUnavailable(err)) return { kind: 'stop', status: 'error', message: err.message }
          // Didn't get through (already asked again): the next release wouldn't either.
          if (isNetworkFailure(err)) return { kind: 'stop', status: 'error', message: NETWORK_ERROR_MESSAGE, offline: true }
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
        if (probingRef.current) {
          // Nobody knows which are cached: ask about the next few at the same time
          releaseQueueRef.current
            .filter((r) => r.info_hash !== playing.info_hash && open(r) && !answers.has(r.info_hash))
            .slice(0, Math.max(0, Math.min(PROBE_LOOKAHEAD, MAX_AUTO_RELEASE_ATTEMPTS - autoAttemptsRef.current)))
            .forEach((r) => void ask(r))
        }
        if (!speculated) {
          speculated = true
          // A name that promises browser-safe audio usually plays directly;
          // any other may well need the transcode, so ask about the next
          // likely-direct release at the same time. (Not in the app, which
          // converts the audio itself.)
          if (!appConvertsAudio() && !(declaresBrowserAudio(playing.name) && isLikelyDirectPlayable(playing.name, support))) {
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
          setFailedOffline(!!result.offline)
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
   *
   * When it was the connection that failed, another release would fail the
   * same way: say the connection was lost, and pick the film up where it
   * stopped once it's back.
   */
  const handleExhausted = useCallback(
    (reason: string, position: number, network: boolean) => {
      if (network) {
        console.warn(`Real-Debrid stream lost its connection (${reason}) at ${Math.round(position)}s`)
        startPositionRef.current = position > 0 ? position : startPositionRef.current
        setLostAt(startPositionRef.current ?? 0)
        return
      }
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

  /** The same file again, from where the connection dropped it. */
  const resumeAfterConnectionLoss = useCallback(() => {
    setLostAt(null)
    setStartAt(startPositionRef.current)
    setResumeToast(false)
    setVideoStarted(false)
    setPlayNonce((n) => n + 1)
  }, [])

  /**
   * Move to `candidates[0]` — or the next, should Real-Debrid not have it
   * ready — without stopping the film: it plays on while the release is
   * resolved, and the new file starts where the viewer has got to by then.
   * When none of them can start, the film just carries on as it was.
   */
  const switchInBackground = useCallback(
    async (from: DebridRelease, candidates: DebridRelease[], struggle: Struggle) => {
      // Anything the viewer does meanwhile (another release, another episode) wins.
      const generation = ++generationRef.current
      const support = detectBrowserVideoSupport()
      const token = await getToken()
      for (const rel of candidates) {
        if (generationRef.current !== generation) return
        try {
          const res = await playDebridRelease(rel, token, { ...episodeOpts, instantOnly: true })
          if (generationRef.current !== generation) return
          if (res.status === 'not-cached') notInstantRef.current.add(rel.info_hash)
          if (res.status !== 'ready') continue
          // Out of a conversion that couldn't keep up: not into another one.
          if (struggle.converted && struggle.cause === 'stalls' && !playsWithoutRdTranscode(res, support, appConvertsAudio())) continue
          console.info(`Real-Debrid release ${STRUGGLE_REASON[struggle.cause]} — switched to ${rel.name}`)
          startPositionRef.current = positionRef.current > 0 ? positionRef.current : startPositionRef.current
          showPlayback(rel, res, { resumeToast: false })
          setAutoSwitch({ from, to: rel, cause: struggle.cause })
          return
        } catch (err: unknown) {
          // Refused, or no connection: the next one would be too.
          if (isAccessRefused(err) || isDebridUnavailable(err) || isNetworkFailure(err)) return
          console.warn('Real-Debrid release could not start, trying another:', rel.name, err)
        }
      }
      console.warn(`Real-Debrid release ${STRUGGLE_REASON[struggle.cause]}, but no smoother one could start`)
    },
    [getToken, episodeOpts, showPlayback]
  )

  /**
   * The film isn't playing smoothly: it keeps stalling — the connection, or
   * Real-Debrid's converter, doesn't keep up with this file — or the device
   * drops frames decoding it. Move to a release that should play smoothly
   * (replacementReleases), the way the viewer would from the Quality menu,
   * up to MAX_AUTO_SWITCHES times; after that, or once the viewer has undone
   * one, offer it instead. The next film or episode starts from what the
   * connection was measured to carry anyway (lib/connection).
   */
  const handleStruggle = useCallback(
    (struggle: Struggle) => {
      if (!activeRelease) return
      const candidates = replacementReleases(instantReleases, activeRelease, {
        cause: struggle.cause,
        converted: struggle.converted,
        kbps: struggle.kbps,
        durationS: playback?.media?.duration || expectedDurationS,
        support: detectBrowserVideoSupport(),
        exclude: notInstantRef.current,
      })
      if (candidates.length === 0) return
      if (autoSwitchOffRef.current || autoSwitchesRef.current >= MAX_AUTO_SWITCHES) {
        setLighterOffer({ release: candidates[0], cause: struggle.cause })
        return
      }
      autoSwitchesRef.current++
      void switchInBackground(activeRelease, candidates, struggle)
    },
    [activeRelease, instantReleases, playback, expectedDurationS, switchInBackground]
  )

  /** `fresh`: search again rather than reuse the title page's search (Try again). */
  const searchAndPlay = useCallback(async ({ fresh = false }: { fresh?: boolean } = {}) => {
    const generation = ++generationRef.current

    setStatus('searching')
    setStatusMessage('Finding the best stream…')
    setPlaybackFailed(false)
    setLostAt(null)
    setFailedOffline(false)
    setLighterOffer(null)
    setAutoSwitch(null)
    autoSwitchesRef.current = 0
    autoSwitchOffRef.current = false
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

    // Measured alongside the search, which takes longer (lib/connection).
    const connection = estimateConnection()
    const token = await getToken()

    try {
      const source = releaseSourceRef.current
      const releases = source
        ? await source.find({ fresh })
        : await findPremiumReleases({ title, year, imdbId, mediaType, season, episode, audioLang: audioLangRef.current }, token, { fresh })
      if (generationRef.current !== generation) return

      const kbps = (await within(connection, CONNECTION_WAIT_MS)) ?? knownThroughput()
      if (generationRef.current !== generation) return
      const plan = planPlayback(releases, {
        support: detectBrowserVideoSupport(),
        kbps,
        durationS: expectedDurationRef.current,
        knownDurationS: knownDurationRef.current,
        probeUnseeded: source?.probeUnseeded,
        appConvertsAudio: appConvertsAudio(),
        audioLang: audioLangRef.current,
      })
      uncachedFallbackRef.current = plan.uncachedFallback

      if (plan.queue.length > 0) {
        // The Quality menu keeps the best first; only the automatic pick follows the connection.
        setInstantReleases(plan.instant)
        if (!plan.probing && plan.queue[0] !== plan.instant[0]) {
          console.info(`Connection carries ~${((kbps ?? 0) / 1000).toFixed(1)} Mbit/s — starting with ${plan.queue[0].name}`)
        }
        probingRef.current = plan.probing
        // A release got ready while the viewer was on the title's page starts first (lib/premiumWarm)
        const queue = preferWarmed(plan.queue, episodeOpts)
        releaseQueueRef.current = queue
        await streamRelease(queue[0], token, { preferDirect: true })
        return
      }

      setStatus('not-found')
      setStatusMessage(
        source?.notFoundMessage ??
          `Premium has no copy of ${mediaType === 'tv' ? 'this episode' : title} yet. Another server may have it.`
      )
    } catch (err: unknown) {
      if (generationRef.current !== generation) return
      console.error('Real-Debrid search failed:', err)
      setStatus(isAccessRefused(err) ? 'access-refused' : 'error')
      setFailedOffline(isNetworkFailure(err))
      setStatusMessage(isNetworkFailure(err) ? NETWORK_ERROR_MESSAGE : err instanceof Error ? err.message : 'Search failed')
    }
    // A new release source searches again through storageKey, which is keyed by it
  }, [title, year, imdbId, mediaType, season, episode, episodeOpts, storageKey, getToken, streamRelease])

  // Back online: pick up whatever the connection interrupted — the film
  // where it stopped, or the search that didn't get through.
  const retryOnline = connectionLost || (status === 'error' && failedOffline)
  useEffect(() => {
    if (!retryOnline) return
    const onOnline = () => {
      if (connectionLost) resumeAfterConnectionLoss()
      else void searchAndPlay()
    }
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [retryOnline, connectionLost, resumeAfterConnectionLoss, searchAndPlay])

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

  /** The viewer chose a language: kept for the title (the next episode plays in it too). */
  const chooseLanguage = useCallback(
    (lang: AudioLanguage) => {
      audioLangRef.current = lang
      onAudioLanguageChange?.(lang)
    },
    [onAudioLanguageChange]
  )

  /**
   * Another version of the film in `lang`, best first: one that names it,
   * else — for English, which releases rarely name — one that names no
   * other language either.
   */
  const releaseInLanguage = useCallback(
    (lang: AudioLanguage): DebridRelease | null => {
      const others = instantReleases.filter((r) => r.info_hash !== activeRelease?.info_hash)
      return (
        others.find((r) => releaseHasLanguage(r, lang)) ??
        (lang === DEFAULT_AUDIO_LANGUAGE ? others.find((r) => releaseLanguageRank(r, 'hi') === 2) : undefined) ??
        null
      )
    },
    [instantReleases, activeRelease]
  )

  /** The Audio menu: the playing file's tracks, then other versions in a language the file hasn't got. */
  const audio = useMemo<PlayerAudio | null>(() => {
    if (!playback) return null
    const tracks = playback.media?.audioTracks ?? []
    const options: PlayerAudioOption[] = []
    const inFile = new Set<AudioLanguage>()
    tracks.forEach((track, i) => {
      const lang = trackLanguage(track)
      if (lang) inFile.add(lang)
      const twin = tracks.some((other) => other !== track && trackLanguage(other) === lang)
      const label = lang ? languageName(lang) : track.lang && track.lang.toLowerCase() !== 'und' ? track.lang : `Track ${i + 1}`
      const detail = [channelLabel(track.channels), twin ? `Track ${i + 1}` : null].filter(Boolean).join(' · ')
      options.push({ id: `track:${track.id}`, label, detail: detail || undefined })
    })
    if (tracks.length === 0 && activeRelease) {
      // No track list from Real-Debrid: the release's own word for its language
      const said = [...releaseLanguages(activeRelease)].find((l) => l.length === 2 && l !== 'in')
      if (said) inFile.add(said)
      options.push({ id: 'file', label: said ? languageName(said) : 'Default' })
    }
    for (const lang of SWITCHABLE_LANGUAGES) {
      if (inFile.has(lang)) continue
      const other = releaseInLanguage(lang)
      if (other) options.push({ id: `release:${lang}`, label: languageName(lang), detail: `${parseTorrentQuality(other.name)} version` })
    }
    // Nothing to switch to: the menu still says what's playing, when that's known
    if (options.length === 0 || (options.length === 1 && options[0].label === 'Default')) return null
    const selected = playback.media?.selectedAudio
    return {
      options,
      activeId: tracks.length > 0 ? `track:${selected ?? tracks[0].id}` : 'file',
      onSelect: (id: string) => {
        if (id.startsWith('track:')) {
          const trackId = id.slice('track:'.length)
          const track = tracks.find((t) => t.id === trackId)
          if (!track || trackId === selected) return
          const lang = trackLanguage(track)
          if (lang) chooseLanguage(lang)
          // The same file again, from here, with the other track
          startPositionRef.current = positionRef.current > 0 ? positionRef.current : startPositionRef.current
          setPlayback(withAudioTrack(playback, trackId))
          setStartAt(startPositionRef.current)
          setResumeToast(false)
          setVideoStarted(false)
          setPlayNonce((n) => n + 1)
          return
        }
        if (id.startsWith('release:')) {
          const lang = id.slice('release:'.length)
          const release = releaseInLanguage(lang)
          if (!release) return
          chooseLanguage(lang)
          switchRelease(release)
        }
      },
    }
  }, [playback, activeRelease, releaseInLanguage, chooseLanguage, switchRelease])

  const releaseControls = useMemo<ReleaseControls | null>(() => {
    if (sources.length === 0) return null
    const ready = status === 'ready' && playback
    return {
      releases: sources,
      activeId: activeRelease?.info_hash ?? null,
      onSelect: selectRelease,
      download:
        ready && downloadsAllowed
          ? { url: playback.directUrl, fileName: playback.fileName, size: playback.fileSize > 0 ? formatBytes(playback.fileSize) : null }
          : null,
      canDownload: downloadsAllowed,
      busy: status === 'searching' || status === 'loading-stream' || status === 'downloading',
    }
  }, [sources, status, playback, activeRelease, selectRelease, downloadsAllowed])

  useEffect(() => {
    onReleaseControls?.(releaseControls)
  }, [onReleaseControls, releaseControls])
  useEffect(() => () => onReleaseControls?.(null), [onReleaseControls])

  const episodeLine =
    mediaType === 'tv' && season !== undefined && episode !== undefined ? `Season ${season} · Episode ${episode}` : subtitle

  // --- Finding a release / resolving it / waiting on a download ---
  if (status === 'searching' || status === 'loading-stream' || status === 'downloading') {
    const pct = Math.min(100, Math.round(downloadProgress?.progress ?? 0))
    const downloading = status === 'downloading' && downloadProgress !== null
    return (
      <PremiumLoading
        backdropUrl={backdropUrl}
        onBack={onBack}
        testId="debrid-loading"
        onSwitchServer={onSwitchServer}
        switchLabel={exitLabel}
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

  // --- Refused: PremiumPane normally takes over with the notice saying why
  // once the access check reruns; until it does (or if it still says yes), say so here ---
  if (status === 'access-refused') {
    return (
      <PaneBackdrop backdropUrl={backdropUrl} onBack={onBack}>
        <StatusMessage heading="Premium isn't available to you right now" body="Your access may have changed. Every other server still works." />
        <ActionRow>
          <button onClick={onSwitchServer} className={primaryAction}>
            {exitLabel}
          </button>
        </ActionRow>
      </PaneBackdrop>
    )
  }

  // --- Not found / error ---
  if (status === 'not-found' || status === 'error') {
    return (
      <PaneBackdrop backdropUrl={backdropUrl} onBack={onBack}>
        <StatusMessage
          heading={status === 'not-found' ? 'No Premium stream available' : "Premium couldn't start this"}
          body={statusMessage}
        />
        <ActionRow>
          <button onClick={onSwitchServer} className={primaryAction}>
            {exitLabel}
          </button>
          <button onClick={() => void searchAndPlay({ fresh: true })} className={secondaryAction}>
            <RefreshCw className="h-4 w-4" />
            Try again
          </button>
        </ActionRow>
      </PaneBackdrop>
    )
  }

  // --- The connection dropped and stayed down: the film waits where it stopped ---
  if (lostAt !== null && playback) {
    return (
      <PaneBackdrop backdropUrl={backdropUrl} onBack={onBack}>
        <StatusMessage
          heading="Connection lost"
          body={
            lostAt > 0
              ? `Playback stopped at ${formatPlayerTime(lostAt)} when the connection dropped. It picks up there as soon as you’re back online.`
              : 'Premium couldn’t reach the file’s server. Playback starts as soon as you’re back online.'
          }
        />
        <ActionRow>
          <button onClick={resumeAfterConnectionLoss} className={primaryAction}>
            <RefreshCw className="h-4 w-4" />
            {lostAt > 0 ? 'Resume' : 'Try again'}
          </button>
          <button onClick={onSwitchServer} className={secondaryAction}>
            {exitLabel}
          </button>
        </ActionRow>
      </PaneBackdrop>
    )
  }

  // --- Every way of playing the file failed after the viewer started watching ---
  if (playbackFailed || !playback) {
    const nextRelease = instantReleases.find((r) => r.info_hash !== activeRelease?.info_hash)
    return (
      <PaneBackdrop backdropUrl={backdropUrl} onBack={onBack}>
        <StatusMessage
          heading="Playback stopped"
          body={
            downloadsAllowed
              ? "This release won't play in this browser. Try another one, or open the file in a player like VLC."
              : "This release won't play in this browser. Try another one, or switch server."
          }
        />
        <ActionRow>
          {nextRelease && (
            <button onClick={() => switchRelease(nextRelease)} className={primaryAction}>
              Try another release
            </button>
          )}
          {playback && downloadsAllowed && (
            <a href={playback.directUrl} target="_blank" rel="noopener noreferrer" className={secondaryAction}>
              <ExternalLink className="h-4 w-4" />
              Open in VLC
            </a>
          )}
          <button onClick={onSwitchServer} className={secondaryAction}>
            {exitLabel}
          </button>
        </ActionRow>
      </PaneBackdrop>
    )
  }

  // --- Ready ---
  const videoKey = `${activeRelease?.info_hash ?? ''}:${playback.directUrl}:${playNonce}`
  const toast = 'flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg bg-black/80 px-3.5 py-2.5 text-sm text-white/90 shadow-lg'
  const toastAction = 'font-semibold text-white underline-offset-4 hover:underline'
  const toastDismiss = '-m-1 p-1 text-white/60 hover:text-white'

  return (
    <div className="relative h-full w-full overflow-hidden bg-black">
      <DebridVideo
        key={videoKey}
        playback={playback}
        startAt={startAt}
        onExhausted={handleExhausted}
        onStruggle={handleStruggle}
        onProgress={handleProgress}
        poster={backdropUrl}
        onNext={onNext}
        nextLabel={nextLabel}
        onBack={onBack}
        title={title}
        subtitle={mediaType === 'tv' && season !== undefined && episode !== undefined ? `S${season} · E${episode}` : subtitle}
        sources={sources}
        activeSourceId={activeRelease?.info_hash ?? null}
        onSourceChange={selectRelease}
        audio={audio}
        episodes={episodes}
        topActions={topActions}
        subtitles={subtitles}
        onStarted={() => setVideoStarted(true)}
        edge={edge}
        allowDownload={downloadsAllowed}
        loadingScreen={(message) => (
          <PremiumLoading
            backdropUrl={backdropUrl}
            testId="debrid-starting"
            onSwitchServer={onSwitchServer}
            switchLabel={exitLabel}
            title={title}
            episodeLine={episodeLine}
            step="start"
            message={message}
          />
        )}
        overlay={
          (resumeToast && startAt !== undefined) || lighterOffer || autoSwitch ? (
            <div className="flex flex-col items-start gap-2">
              {autoSwitch && (
                <div role="status" className={toast}>
                  <span>
                    Switched to {releaseLabel(autoSwitch.to)} — {STRUGGLE_REASON[autoSwitch.cause]}.
                  </span>
                  <button
                    onClick={() => {
                      // The viewer prefers the one they had: leave the choice to them from here on.
                      autoSwitchOffRef.current = true
                      setAutoSwitch(null)
                      switchRelease(autoSwitch.from)
                    }}
                    className={toastAction}
                  >
                    Undo
                  </button>
                  <button onClick={() => setAutoSwitch(null)} aria-label="Dismiss" className={toastDismiss}>
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}
              {lighterOffer && (
                <div role="status" className={toast}>
                  <span>
                    {lighterOffer.cause === 'frames'
                      ? 'This file isn’t playing smoothly on this device.'
                      : 'Your connection can’t keep up with this file.'}
                  </span>
                  <button
                    onClick={() => {
                      setLighterOffer(null)
                      switchRelease(lighterOffer.release)
                    }}
                    className={toastAction}
                  >
                    Switch to {releaseLabel(lighterOffer.release)}
                  </button>
                  <button onClick={() => setLighterOffer(null)} aria-label="Keep this release" className={toastDismiss}>
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}
              {resumeToast && startAt !== undefined && (
                <div className="flex items-center gap-3 rounded-lg bg-black/80 px-3.5 py-2.5 text-sm text-white/90 shadow-lg">
                  <span>Resumed from {formatPlayerTime(startAt)}</span>
                  <button onClick={startOver} className={toastAction}>
                    Start over
                  </button>
                </div>
              )}
            </div>
          ) : null
        }
        className="absolute inset-0 h-full w-full"
      />
    </div>
  )
}
