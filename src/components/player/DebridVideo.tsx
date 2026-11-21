/**
 * DebridVideo — plays one Real-Debrid file in a <video> element, with our
 * own controls (PlayerControls).
 *
 * Works down the file's playback modes (see planPlaybackModes): the direct
 * download link when the browser can decode it (instant seeking), otherwise
 * Real-Debrid's own HLS transcode (H.264 + AAC).
 * Real-Debrid does all the streaming/transcoding — nothing passes through our
 * backend.
 *
 * Recovery, cheapest first (the policy is lib/streamRecovery):
 *   - A film that has played and loses its connection — a network error, or
 *     a stall with no bytes arriving — is reconnected in place, at the same
 *     position, with a growing wait in between; while the browser is
 *     offline it simply waits for the connection. A stall with bytes still
 *     arriving is a slow connection, not a dead one: it's left to load.
 *     Dropping to the transcode instead would cost the original quality and
 *     instant seeking, and wouldn't load any faster.
 *
 * Real-Debrid's transcode only converts forward from where it starts, so a
 * jump outside what it has loaded restarts it at the new spot (see
 * convertedStreamUrl); the element then holds the file from that spot on,
 * and the controls get a timeline that maps its clock back to the file's.
 *   - A mode that can't show a picture with sound — element error, fatal
 *     hls.js error, no decodable video track, silent audio, nothing loaded
 *     before a timeout — is abandoned for the next one. The viewer's position
 *     carries over.
 *   - Only when every mode has failed does `onExhausted` fire, so the caller
 *     can move on to another release — or, when it was the connection that
 *     failed, wait for it and pick the film up again.
 *
 * While the direct link plays, hidden helpers keep the film loaded further
 * ahead than the browser does by itself (lib/readAhead), so a Real-Debrid
 * server going quiet for a while doesn't stop it.
 *
 * In the StreamVault app the file goes through the app's own server first
 * (lib/localStream): relayed — loaded minutes ahead — or, when its audio is
 * Dolby/DTS, converted there to AAC with the picture untouched, and fed to
 * the element through Media Source Extensions (ConvertedFeed).
 *
 * A film that keeps stalling, or drops frames because the device can't
 * decode it in time, is reported through `onStruggle`, so the caller can
 * move to a release that plays smoothly.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { knownThroughput, noteThroughput } from '@/lib/connection'
import { formatBytes, type DebridReadyPlayback } from '@/lib/debridApi'
import { forgetEdge, nearestDirectUrl, type EdgeChoice } from '@/lib/debridHost'
import { ReadAhead, sharesMediaCache } from '@/lib/readAhead'
import { ConvertedFeed, canFeedConverted, localStreamProvider, type LocalStream } from '@/lib/localStream'
import {
  convertedStreamUrl,
  detectBrowserVideoSupport,
  planConvertedSeek,
  planPlaybackModes,
  previewStreamUrl,
  type PlaybackMode,
  type StruggleCause,
} from '@/lib/releasePlayback'
import { FrameMeter, reconnectDelayMs, shouldHedge, StallMeter, stallThroughputKbps, startupPatience } from '@/lib/streamRecovery'
import { cn } from '@/lib/utils'
import { PlayerControls, type PlayerControlsProps, type PlayerTimeline } from './PlayerControls'

/** What the caller can put in the controls: title, release picker, next episode, ... */
type ChromeProps = Pick<
  PlayerControlsProps,
  | 'title'
  | 'subtitle'
  | 'onBack'
  | 'sources'
  | 'activeSourceId'
  | 'onSourceChange'
  | 'onNext'
  | 'nextLabel'
  | 'overlay'
  | 'episodes'
  | 'subtitles'
  | 'topActions'
>

/** Why a file isn't playing smoothly (see `onStruggle`). */
export interface Struggle {
  cause: StruggleCause
  /** What the connection delivered while the film stalled, in kbit/s, when that could be told. */
  kbps: number | null
  /** It was Real-Debrid's converted stream that struggled, not the file itself. */
  converted: boolean
}

/**
 * Mount one per file — give it a `key` that changes with `playback` — so a
 * new file starts fresh from its first mode and its own `startAt`.
 */
interface DebridVideoProps extends ChromeProps {
  playback: DebridReadyPlayback
  /**
   * Every mode failed. `position` is how far the viewer had got, in seconds;
   * `network` says it was the connection that failed, not the file.
   */
  onExhausted: (reason: string, position: number, network: boolean) => void
  /**
   * The film isn't playing smoothly: it keeps stalling (the connection, or
   * Real-Debrid's converter, isn't keeping up with this file), or the device
   * drops frames decoding it. Reported once per file.
   */
  onStruggle?: (struggle: Struggle) => void
  /** The mode now playing — e.g. to label it in the UI. */
  onModeChange?: (mode: PlaybackMode) => void
  /** Where to start, in seconds (a resume point). */
  startAt?: number
  /** Position/duration, every few seconds while playing and on pause, end and unmount. */
  onProgress?: (position: number, duration: number) => void
  /** Artwork shown until the first frame (when there's no `loadingScreen`). */
  poster?: string | null
  /**
   * Drawn over the player until the first frame, in place of the artwork and
   * the controls' spinner — given what's happening, e.g. "Starting
   * playback…". Without it, the artwork and a spinner.
   */
  loadingScreen?: (message: string) => ReactNode
  /** The first frame is on screen. */
  onStarted?: () => void
  /**
   * Real-Debrid's download server nearest the viewer (lib/debridHost), as
   * known when the file mounts — the direct link plays from there, with the
   * link as given right behind it.
   */
  edge?: EdgeChoice
  /**
   * Offer the file itself — to save, or open in VLC. Off unless the viewer
   * is the admin or an account the admin allowed downloads; the stream plays
   * either way.
   */
  allowDownload?: boolean
  className?: string
}

/** Past this, the loading screen says it's taking a while (and why). */
const SLOW_START_MS = 8_000

/**
 * How long a mode may take to show its first frame. Real-Debrid's
 * transcoder takes a few seconds to spin up; a direct link can need three
 * slow requests in a row (below).
 */
const DIRECT_STARTUP_TIMEOUT_MS = 35_000
const HLS_STARTUP_TIMEOUT_MS = 45_000
/**
 * A direct link with no metadata by now gets a second connection racing the
 * first (see the startup effect), for the host that sits on a connection —
 * seen 2026-10-18 (25s of nothing, then the same link loaded in 2s) and
 * again 2026-11-08 (nothing for 15s, playing 3.6s after reconnecting).
 *
 * Racing, not reconnecting: a healthy host can also take 0.5-11s to answer
 * *each* range request (measured 2026-11-08), and metadata takes three in a
 * row — the start, the index at the end of the file, then the data. A plain
 * reconnect at 8s fired in every one of three traced slow-but-healthy
 * starts, each time killing a request that had just begun to answer and
 * paying for a fresh one (22s to the first frame instead of ~14s). The
 * browser gives no sign of bytes arriving before metadata (no `progress`
 * event), so the two can't be told apart — only raced.
 */
const DIRECT_STARTUP_HEDGE_MS = 6_000

/** Fatal hls.js errors to recover from in a row (no segment loading in between) before giving up on the mode. */
const MAX_HLS_RECOVERIES = 5

/** In-place reloads of a direct link after a decode error before giving up on it. */
const MAX_DECODE_RELOADS = 3
/** Smooth playback after which that budget refills. */
const DECODE_RELOAD_BUDGET_RESET_MS = 60_000
/**
 * A direct stream waiting this long with no bytes arriving, though not
 * paused, is reconnected at the same spot. Bytes arriving, however slowly,
 * start the count again: a slow connection is left to load.
 */
const DIRECT_STALL_RELOAD_MS = 15_000
/**
 * Reconnects in a row, with nothing playing in between, before a mode is
 * given up on (with the waits in between, about half a minute). Not counted
 * while the browser is offline: then the player just waits.
 */
const MAX_RECONNECTS = 4
/** While offline, how often to look whether the browser is wrong about that. */
const OFFLINE_RETRY_MS = 15_000
/** A file that has never played gets this many of those looks before it's treated as failing. */
const MAX_OFFLINE_RETRIES_UNSTARTED = 4
/** A stall this long is explained under the spinner. */
const SLOW_NOTICE_MS = 4000
/** Bytes arrived this recently: the connection is slow, not gone (browsers say so every ~350ms while loading). */
const BYTES_FLOWING_MS = 3000
/** A wait that starts this soon after a jump is the jump's, not the connection's. */
const SEEK_SETTLE_MS = 3000
/**
 * A start that has run out of time but saw bytes arrive this recently is
 * given this much longer, up to MAX_STARTUP_EXTENSIONS times.
 */
const STARTUP_LIFE_SIGN_MS = 10_000
const MAX_STARTUP_EXTENSIONS = 6

/**
 * A converted stream asked to start closer to the beginning than this just
 * starts there: too little to tell from the playlist's length whether
 * Real-Debrid honoured the offset.
 */
const MIN_CONVERTED_START_S = 10

const PROGRESS_INTERVAL_MS = 5000

/**
 * Loading further ahead (lib/readAhead) only on a connection that carries at
 * least this many times what the file needs: on a tighter one the helpers
 * would take bandwidth the film itself needs.
 */
const READ_AHEAD_MIN_HEADROOM = 1.5

/** How often the dropped-frame count is read while the film plays (see FrameMeter). */
const FRAME_CHECK_MS = 2000

/** Where the loaded media ends, in the element's time (0 when nothing is loaded). */
function bufferedEnd(video: HTMLVideoElement): number {
  return video.buffered.length ? video.buffered.end(video.buffered.length - 1) : 0
}

/** Seconds loaded ahead of where the element is playing. */
function bufferedAhead(video: HTMLVideoElement): number {
  const at = video.currentTime
  for (let i = 0; i < video.buffered.length; i++) {
    if (video.buffered.start(i) <= at + 0.1 && video.buffered.end(i) >= at) return video.buffered.end(i) - at
  }
  return 0
}

function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}

/**
 * What's holding the film up: the browser is offline, the connection
 * dropped and the player is reconnecting, or it's just slow.
 */
type Trouble = 'offline' | 'reconnecting' | 'slow'

const TROUBLE_STATUS: Record<Trouble, string> = {
  offline: 'You’re offline — the film continues when your connection is back',
  reconnecting: 'Connection lost — reconnecting…',
  slow: 'Slow connection — buffering…',
}

/** What the loading screen says while the first frame is on its way. */
function startingMessage(kind: PlaybackMode['kind'], slow: boolean, offline: boolean): string {
  if (offline) return 'You’re offline — playback starts when your connection is back…'
  if (kind === 'hls') {
    return slow ? 'Still converting — Real-Debrid takes a little longer with some files…' : 'Real-Debrid is converting this file for your browser…'
  }
  if (!slow) return 'Starting playback…'
  // Measured slow: it's the line, not Real-Debrid's server.
  return startupPatience(knownThroughput()) > 1
    ? 'Your connection is slow — the film takes a little longer to start…'
    : 'Still connecting — Real-Debrid’s server is slow to answer…'
}

export function DebridVideo({
  playback,
  onExhausted,
  onStruggle,
  onModeChange,
  startAt,
  onProgress,
  poster,
  loadingScreen,
  onStarted,
  edge,
  allowDownload = false,
  className,
  ...chrome
}: DebridVideoProps) {
  // The server is settled for the life of the file: a measurement landing
  // mid-film mustn't swap the link under the viewer.
  const [nearUrl] = useState(() => nearestDirectUrl(playback, edge))
  /**
   * The StreamVault app's own server for this file (lib/localStream):
   * undefined while it's being asked, null on the website or when it can't.
   */
  const [appStreams, setAppStreams] = useState<LocalStream | null | undefined>(() => (localStreamProvider() ? undefined : null))
  useEffect(() => {
    const provider = localStreamProvider()
    if (!provider) return
    let live = true
    let opened: LocalStream | null = null
    const media = playback.media
    const audioIndex = media ? Math.max(0, media.audioTracks.findIndex((t) => t.id === media.selectedAudio)) : 0
    const videoCodec = media?.videoCodec ?? null
    provider
      .open({
        urls: [...new Set([nearUrl, playback.directUrl].filter((u): u is string => !!u))],
        size: playback.fileSize,
        duration: media?.duration ?? null,
        audioIndex,
        videoCodec,
      })
      .then((stream) => {
        opened = stream
        if (!live) return stream?.close()
        // The conversion only helps where this browser can take the stream it makes.
        setAppStreams(stream && stream.convertUrl && !canFeedConverted(videoCodec) ? { ...stream, convertUrl: null } : stream)
      })
      .catch((err: unknown) => {
        console.warn('The app could not open this file — playing it from Real-Debrid', err)
        if (live) setAppStreams(null)
      })
    return () => {
      live = false
      opened?.close()
    }
  }, [playback, nearUrl])
  const modes = useMemo(
    () => (appStreams === undefined ? [] : planPlaybackModes(playback, detectBrowserVideoSupport(), nearUrl, appStreams)),
    [playback, nearUrl, appStreams]
  )
  const [modeIndex, setModeIndex] = useState(0)
  const mode = modes[modeIndex] as PlaybackMode | undefined
  const videoRef = useRef<HTMLVideoElement | null>(null)
  /** The element itself, as state, so the controls re-attach when a mode switch remounts it. */
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null)
  const [container, setContainer] = useState<HTMLDivElement | null>(null)
  /** Last position actually played, in seconds — survives mode switches and reloads. */
  const positionRef = useRef(startAt ?? 0)
  /** Position to jump to once the next source has loaded (resume, reload, mode switch). */
  const pendingSeekRef = useRef<number | null>(startAt && startAt > 0 ? startAt : null)
  const exhaustedRef = useRef(false)
  /**
   * True once the current mode has shown a frame. Startup checks stop there:
   * after that a stall is a dropped connection or a seek into Real-Debrid's
   * HLS, not a stream that won't start.
   */
  const startedRef = useRef(false)
  const decodeReloadsLeftRef = useRef(MAX_DECODE_RELOADS)
  const lastDecodeReloadAtRef = useRef(0)
  /** What's holding the film up, if anything — said under the spinner. */
  const [trouble, setTrouble] = useState<Trouble | null>(null)
  const troubleRef = useRef<Trouble | null>(null)
  const showTrouble = useCallback((next: Trouble | null) => {
    troubleRef.current = next
    setTrouble(next)
  }, [])
  /** Where the film stood when the connection went — shown while the element reconnects. */
  const [heldAt, setHeldAt] = useState(0)
  /** Reconnects since something last played. */
  const reconnectsRef = useRef(0)
  /** Looks at the connection while the browser says it's offline. */
  const offlineRetriesRef = useRef(0)
  /** The reconnect that's waiting its turn. */
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** Whether the film should play once it's back (the viewer hadn't paused it). */
  const wantPlayingRef = useRef(true)
  /** Bumped by every reconnect, so the startup watch starts over. */
  const [retryRun, setRetryRun] = useState(0)
  /** The file's length as the element last reported it, for when it's reloading. */
  const [knownDuration, setKnownDuration] = useState(0)
  /** When bytes last arrived (a `progress` event) — 0 when none have for this mode. */
  const lastBytesAtRef = useRef(0)
  /** The film's stalls, to tell when the connection isn't keeping up with this file. */
  const [stallMeter] = useState(() => new StallMeter())
  /** `onStruggle` has fired for this file. */
  const struggleReportedRef = useRef(false)
  /** Seconds into the file at the element's time 0 — non-zero once the converted stream starts mid-way. */
  const [offset, setOffset] = useState(0)
  const offsetRef = useRef(0)
  /** Where the converted stream (re)starts, in seconds into the file. */
  const convertedAtRef = useRef(startAt && startAt > 0 ? startAt : 0)
  /** The app's converted stream, while that mode plays (lib/localStream). */
  const feedRef = useRef<ConvertedFeed | null>(null)
  /** Bumped to restart the converted stream at `convertedAtRef`. */
  const [convertedRun, setConvertedRun] = useState(0)
  /** A jump is restarting the converted stream; true until it can play. */
  const [restarting, setRestarting] = useState(false)
  /** `restarting`, for the stall watch: that wait is the restart's, not the connection's. */
  const restartingRef = useRef(false)
  useEffect(() => {
    restartingRef.current = restarting
  }, [restarting])
  /** The viewer jumped while paused — stay paused once the restarted stream is ready. */
  const pauseAfterRestartRef = useRef(false)
  /**
   * No frame shown yet — the artwork (or the loading screen) stays up until
   * one is. A reload or a restart later goes to black, not back to it.
   */
  const [starting, setStarting] = useState(true)
  /** Starting is taking longer than it should. */
  const [slowStart, setSlowStart] = useState(false)
  const fullDuration = playback.media?.duration ?? 0
  // Previews come from the direct link playing — or, while the transcode
  // plays, the one that would — so they use the same, nearest, server.
  const previewUrl = useMemo(() => {
    if (!previewStreamUrl(playback, detectBrowserVideoSupport())) return null
    return mode?.kind === 'direct' ? mode.url : (modes.find((m) => m.kind === 'direct')?.url ?? null)
  }, [playback, mode, modes])
  const onStartedRef = useRef(onStarted)
  onStartedRef.current = onStarted
  /** The file has shown a frame, in any mode. */
  const firstFrameRef = useRef(false)

  useEffect(() => {
    if (!starting) return
    setSlowStart(false)
    const timer = setTimeout(() => setSlowStart(true), SLOW_START_MS)
    return () => clearTimeout(timer)
  }, [starting, mode])

  const setVideoRef = useCallback((el: HTMLVideoElement | null) => {
    videoRef.current = el
    setVideoEl(el)
  }, [])

  useEffect(() => {
    if (mode) onModeChange?.(mode)
  }, [mode, onModeChange])

  const onExhaustedRef = useRef(onExhausted)
  const onProgressRef = useRef(onProgress)
  const onStruggleRef = useRef(onStruggle)
  useEffect(() => {
    onExhaustedRef.current = onExhausted
    onProgressRef.current = onProgress
    onStruggleRef.current = onStruggle
  }, [onExhausted, onProgress, onStruggle])

  /**
   * Give up on the current mode; move to the next, or report the file as
   * unplayable. `kind` says whether the connection failed or the file did.
   */
  const advance = useCallback(
    (reason: string, kind: 'media' | 'network' = 'media') => {
      pendingSeekRef.current = positionRef.current > 0 ? positionRef.current : pendingSeekRef.current
      convertedAtRef.current = pendingSeekRef.current ?? 0
      // The nearest server let this viewer down: measure again next time.
      if (nearUrl && modes[modeIndex]?.url === nearUrl) forgetEdge()
      // Offline, every other mode would fail the same way: report it now.
      const offline = kind === 'network' && isOffline()
      if (!offline && modeIndex + 1 < modes.length) {
        console.warn(`Debrid ${modes[modeIndex]?.label} failed (${reason}), trying ${modes[modeIndex + 1].label}`)
        setModeIndex(modeIndex + 1)
        return
      }
      if (exhaustedRef.current) return
      exhaustedRef.current = true
      console.error(`Debrid playback failed (${reason})`)
      // A file that never played may be at fault itself — unless the browser says it's offline.
      onExhaustedRef.current(reason, positionRef.current, kind === 'network' && (firstFrameRef.current || isOffline()))
    },
    [modeIndex, modes, nearUrl]
  )
  /** Latest `advance` for effects that shouldn't re-subscribe (and rebuild hls.js) when it changes. */
  const advanceRef = useRef(advance)
  useEffect(() => {
    advanceRef.current = advance
  }, [advance])

  /**
   * Load the current mode again where the viewer is: the direct link is
   * reloaded and jumps back to the spot, the converted stream restarts there.
   */
  const retryCurrentMode = useCallback(() => {
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current)
    retryTimerRef.current = null
    const video = videoRef.current
    if (!video || !mode) return
    const at = positionRef.current
    setRetryRun((n) => n + 1)
    if (mode.kind === 'local') {
      // The app's conversion picks up where the viewer is.
      pauseAfterRestartRef.current = !wantPlayingRef.current
      setRestarting(true)
      void feedRef.current?.start(at)
      return
    }
    if (mode.kind === 'hls') {
      convertedAtRef.current = at
      pauseAfterRestartRef.current = !wantPlayingRef.current
      setRestarting(true)
      setConvertedRun((n) => n + 1)
      return
    }
    if (at > 0) pendingSeekRef.current = at
    video.load()
    if (wantPlayingRef.current) void video.play().catch(() => {})
    else video.pause() // or the element's `autoplay` would start it
  }, [mode])

  /**
   * The connection failed the current mode — a network error, or nothing
   * arriving. Offline, wait for the browser to say otherwise (and look now
   * and then, in case it's wrong). A film that has played is reconnected
   * where it stopped, a few times, before the mode is given up on; one that
   * never played moves on at once, as the file itself may be at fault.
   */
  const networkFailure = useCallback(
    (reason: string) => {
      const video = videoRef.current
      if (!video || !mode || retryTimerRef.current) return
      if (troubleRef.current !== 'offline' && troubleRef.current !== 'reconnecting') {
        wantPlayingRef.current = startedRef.current ? !video.paused : true
      }
      const giveUp = () => {
        reconnectsRef.current = 0
        offlineRetriesRef.current = 0
        showTrouble(null)
        advance(reason, 'network')
      }
      const retryIn = (ms: number) => {
        retryTimerRef.current = setTimeout(() => {
          retryTimerRef.current = null
          retryCurrentMode()
        }, ms)
      }
      setHeldAt(positionRef.current)
      if (isOffline()) {
        if (!firstFrameRef.current && ++offlineRetriesRef.current > MAX_OFFLINE_RETRIES_UNSTARTED) return giveUp()
        console.warn(`Debrid ${mode.label} stream ${reason} — offline, waiting for the connection`)
        showTrouble('offline')
        retryIn(OFFLINE_RETRY_MS)
        return
      }
      if (!firstFrameRef.current || ++reconnectsRef.current > MAX_RECONNECTS) return giveUp()
      console.warn(`Debrid ${mode.label} stream ${reason} — reconnecting at ${Math.round(positionRef.current)}s`)
      showTrouble('reconnecting')
      retryIn(reconnectDelayMs(reconnectsRef.current))
    },
    [mode, advance, retryCurrentMode, showTrouble]
  )
  const networkFailureRef = useRef(networkFailure)
  useEffect(() => {
    networkFailureRef.current = networkFailure
  }, [networkFailure])

  // The browser found its connection again (or lost it): don't sit out the wait.
  useEffect(() => {
    const onOnline = () => {
      if (troubleRef.current !== 'offline' && troubleRef.current !== 'reconnecting') return
      offlineRetriesRef.current = 0
      retryCurrentMode()
    }
    const onOffline = () => {
      if (troubleRef.current === 'reconnecting') showTrouble('offline')
    }
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [retryCurrentMode, showTrouble])

  // A reconnect still waiting when the file goes away has nothing to reconnect.
  useEffect(
    () => () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current)
      retryTimerRef.current = null
    },
    []
  )

  /**
   * A corrupt chunk mid-film: reload the direct link where the viewer is, a
   * few times, before giving up on it. False when this isn't a started
   * direct stream or the budget is spent.
   */
  const reloadAfterDecodeError = useCallback((): boolean => {
    const video = videoRef.current
    if (!video || mode?.kind !== 'direct' || !startedRef.current) return false
    if (Date.now() - lastDecodeReloadAtRef.current > DECODE_RELOAD_BUDGET_RESET_MS) decodeReloadsLeftRef.current = MAX_DECODE_RELOADS
    if (decodeReloadsLeftRef.current <= 0) return false
    decodeReloadsLeftRef.current--
    lastDecodeReloadAtRef.current = Date.now()
    console.warn(`Debrid direct stream hit a decode error — reloading at ${Math.round(positionRef.current)}s`)
    wantPlayingRef.current = !video.paused
    retryCurrentMode()
    return true
  }, [mode, retryCurrentMode])

  // Track whether this mode has started, keep the position, apply pending
  // seeks, report progress — and watch the stalls. A film waiting with no
  // bytes arriving has lost its connection and is reconnected; one with
  // bytes trickling in is on a slow connection and is left to load, with a
  // word under the spinner. Stalls that keep coming are reported
  // (onStruggle): the file needs more than the connection carries.
  useEffect(() => {
    startedRef.current = false
    setRestarting(false)
    pauseAfterRestartRef.current = false
    lastBytesAtRef.current = 0
    stallMeter.reset()
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current)
    retryTimerRef.current = null
    reconnectsRef.current = 0
    offlineRetriesRef.current = 0
    showTrouble(null)
    if (mode?.kind !== 'hls') {
      offsetRef.current = 0
      setOffset(0)
    }
    const video = videoRef.current
    if (!mode || !video) return

    let lastReportAt = 0
    /** The stall under way: when it began, how much was loaded ahead then, and whether it's the connection's doing. */
    let stall: { since: number; bufferedAtStart: number; counts: boolean } | null = null
    let stallTick: ReturnType<typeof setInterval> | null = null
    let lastSeekAt = 0

    const reconnecting = () => troubleRef.current === 'offline' || troubleRef.current === 'reconnecting'
    /** What this file needs to play in real time, in kbit/s — direct links only: the transcode's rate isn't known. */
    const fileKbps = (): number | null => {
      if (mode.kind !== 'direct' || !(playback.fileSize > 0)) return null
      const duration = fullDuration || (Number.isFinite(video.duration) ? video.duration : 0)
      return duration > 0 ? (playback.fileSize * 8) / duration / 1000 : null
    }
    const report = () => {
      const duration = Number.isFinite(video.duration) ? offsetRef.current + video.duration : 0
      if (positionRef.current > 0) onProgressRef.current?.(positionRef.current, duration)
      lastReportAt = Date.now()
    }
    /** Tell the caller, once per file, when the stalls say the connection can't keep up. */
    const checkStruggle = (now: number, ongoingMs: number, kbps: number | null) => {
      if (struggleReportedRef.current || !stallMeter.struggling(now, ongoingMs)) return
      struggleReportedRef.current = true
      const measured = kbps ?? knownThroughput()
      console.warn(
        `Debrid ${mode.label} stream keeps stalling${measured ? ` — the connection carries ~${(measured / 1000).toFixed(1)} Mbit/s` : ''}`
      )
      onStruggleRef.current?.({ cause: 'stalls', kbps: measured, converted: mode.kind === 'hls' })
    }
    /** The stall is over: count it (unless `counted` is false), and note what the connection delivered meanwhile. */
    const endStall = (counted = true) => {
      if (stallTick) clearInterval(stallTick)
      stallTick = null
      const s = stall
      stall = null
      if (troubleRef.current === 'slow') showTrouble(null)
      if (!s || !s.counts || !counted) return
      const now = Date.now()
      const ms = now - s.since
      const kbps = stallThroughputKbps(bufferedAhead(video) - s.bufferedAtStart, ms, fileKbps())
      if (kbps !== null) noteThroughput(kbps)
      stallMeter.note(now, ms)
      checkStruggle(now, 0, kbps)
    }
    const tick = () => {
      const s = stall
      if (!s) return
      const now = Date.now()
      // Playing again with no event to say so (a jump to a loaded spot), or paused.
      if (video.paused || (!video.seeking && video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA)) {
        endStall()
        return
      }
      // A hidden tab may simply be throttled — not a dead connection.
      if (document.hidden) {
        lastBytesAtRef.current = now
        return
      }
      const ms = now - s.since
      if (ms >= SLOW_NOTICE_MS && troubleRef.current === null && !restartingRef.current) showTrouble('slow')
      if (s.counts && now - lastBytesAtRef.current < BYTES_FLOWING_MS) {
        checkStruggle(now, ms, stallThroughputKbps(bufferedAhead(video) - s.bufferedAtStart, ms, fileKbps()))
      }
      // Nothing arriving at all: the connection is gone, not slow. (The
      // converted stream's loader has timeouts of its own for that.)
      if (mode.kind === 'direct' && now - lastBytesAtRef.current >= DIRECT_STALL_RELOAD_MS) {
        endStall(false)
        networkFailureRef.current('stalled with nothing arriving')
      }
    }
    const ready = () => {
      setRestarting(false)
      if (pauseAfterRestartRef.current) {
        pauseAfterRestartRef.current = false
        video.pause()
      }
    }

    const handleLoadedMetadata = () => {
      if (video.videoWidth === 0) {
        advanceRef.current('no decodable video track')
        return
      }
      if (Number.isFinite(video.duration) && video.duration > 0) setKnownDuration(offsetRef.current + video.duration)
      const seekTo = pendingSeekRef.current
      pendingSeekRef.current = null
      if (seekTo && seekTo > 0 && mode.kind === 'direct') video.currentTime = seekTo
      // `autoplay` doesn't say when the browser refuses it (iPhone Safari
      // wants a tap for sound): ask, so a refusal shows the play button
      // instead of an endless loading screen.
      if (!startedRef.current) {
        video.play().catch((err: unknown) => {
          if (err instanceof DOMException && err.name === 'NotAllowedError') setStarting(false)
        })
      }
    }
    const handlePlaying = () => {
      startedRef.current = true
      if (!firstFrameRef.current) {
        firstFrameRef.current = true
        setStarting(false)
        onStartedRef.current?.()
      }
      ready()
      endStall()
      // Playing again: whatever held the film up is over.
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current)
      retryTimerRef.current = null
      reconnectsRef.current = 0
      offlineRetriesRef.current = 0
      if (troubleRef.current) showTrouble(null)
    }
    const handleTimeUpdate = () => {
      // Ignore the 0 a freshly (re)loaded element reports before its seek.
      if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA || video.currentTime > 0) {
        positionRef.current = offsetRef.current + video.currentTime
      }
      if (!video.paused && Date.now() - lastReportAt >= PROGRESS_INTERVAL_MS) report()
    }
    const handleWaiting = (event: Event) => {
      if (event.type === 'seeking') lastSeekAt = Date.now()
      if (!startedRef.current || stall) return
      const now = Date.now()
      stall = {
        since: now,
        bufferedAtStart: bufferedAhead(video),
        // A jump's wait, a restart's or a reconnect's says nothing about the connection being too slow for the file.
        counts: now - lastSeekAt > SEEK_SETTLE_MS && !restartingRef.current && !reconnecting(),
      }
      // "Nothing arriving" is counted from here.
      lastBytesAtRef.current = now
      stallTick = setInterval(tick, 1000)
    }
    const handleCanPlay = () => {
      ready()
      endStall()
      // Reconnected while paused: no `playing` will come to say it's over.
      if (!wantPlayingRef.current && reconnecting()) {
        reconnectsRef.current = 0
        offlineRetriesRef.current = 0
        showTrouble(null)
      }
    }
    const handleProgress = () => {
      lastBytesAtRef.current = Date.now()
    }
    // A reload starts the element over: the stall before it was the connection dropping, not a slow one.
    const handleEmptied = () => endStall(false)
    // While reconnecting, the viewer's play/pause is what the film does once it's back.
    const handlePlay = () => {
      if (reconnecting()) wantPlayingRef.current = true
    }
    const handlePause = () => {
      if (reconnecting()) wantPlayingRef.current = false
      endStall()
      report()
    }

    video.addEventListener('loadedmetadata', handleLoadedMetadata)
    video.addEventListener('playing', handlePlaying)
    video.addEventListener('timeupdate', handleTimeUpdate)
    video.addEventListener('waiting', handleWaiting)
    video.addEventListener('seeking', handleWaiting)
    video.addEventListener('canplay', handleCanPlay)
    video.addEventListener('progress', handleProgress)
    video.addEventListener('emptied', handleEmptied)
    video.addEventListener('play', handlePlay)
    video.addEventListener('pause', handlePause)
    video.addEventListener('ended', report)
    return () => {
      endStall(false)
      report()
      video.removeEventListener('loadedmetadata', handleLoadedMetadata)
      video.removeEventListener('playing', handlePlaying)
      video.removeEventListener('timeupdate', handleTimeUpdate)
      video.removeEventListener('waiting', handleWaiting)
      video.removeEventListener('seeking', handleWaiting)
      video.removeEventListener('canplay', handleCanPlay)
      video.removeEventListener('progress', handleProgress)
      video.removeEventListener('emptied', handleEmptied)
      video.removeEventListener('play', handlePlay)
      video.removeEventListener('pause', handlePause)
      video.removeEventListener('ended', report)
    }
  }, [mode, playback.fileSize, fullDuration, stallMeter, showTrouble])

  // Attach Real-Debrid's HLS stream, converted from where the viewer is —
  // and again from wherever they jump to (convertedRun). No browser except
  // Safari understands .m3u8 natively, so everything else goes through
  // hls.js (MSE). hls.js is loaded only here: most files play from the
  // direct link, and it's the biggest library on the page.
  useEffect(() => {
    if (!mode || mode.kind !== 'hls') return
    const video = videoRef.current
    if (!video) return
    const requested = Math.floor(convertedAtRef.current)
    const at = requested >= MIN_CONVERTED_START_S ? requested : 0
    const url = convertedStreamUrl(mode.url, at)
    offsetRef.current = at
    setOffset(at)

    // The start offset is undocumented. Should Real-Debrid ever ignore it,
    // the playlist covers the whole file again: seek instead, rather than
    // show every time off by `at`.
    const checkOffset = () => {
      if (at === 0 || !fullDuration || !Number.isFinite(video.duration)) return
      if (Math.abs(video.duration - fullDuration) < Math.abs(video.duration - (fullDuration - at))) {
        console.warn('Real-Debrid ignored the converted stream start offset — seeking instead')
        offsetRef.current = 0
        setOffset(0)
        video.currentTime = at
      }
    }
    video.addEventListener('loadedmetadata', checkOffset)

    let cancelled = false
    let detach: (() => void) | null = null

    const playNatively = (): boolean => {
      if (!video.canPlayType('application/vnd.apple.mpegurl')) return false
      video.src = url
      detach = () => video.removeAttribute('src')
      return true
    }

    import('hls.js')
      .then(({ default: Hls }) => {
        if (cancelled) return
        if (!Hls.isSupported()) {
          if (!playNatively()) advanceRef.current('HLS not supported in this browser')
          return
        }
        // Real-Debrid transcodes on demand: the first segment after a
        // (re)start takes ~7s to arrive.
        const segmentLoadPolicy = {
          default: {
            maxTimeToFirstByteMs: 40_000,
            maxLoadTimeMs: 120_000,
            timeoutRetry: { maxNumRetry: 3, retryDelayMs: 0, maxRetryDelayMs: 0 },
            errorRetry: { maxNumRetry: 6, retryDelayMs: 1000, maxRetryDelayMs: 8000 },
          },
        }
        const hls = new Hls({
          startPosition: 0,
          maxBufferLength: 90,
          maxMaxBufferLength: 180,
          // What has played is let go of after half a minute (hls.js keeps
          // it all by default). Real-Debrid converts at the source's quality,
          // so a film fills Chrome's media memory (~150 MB) within minutes,
          // and hls.js clears room then by flushing — a stutter. A jump back
          // further than this loads those segments again.
          backBufferLength: 30,
          fragLoadPolicy: segmentLoadPolicy,
        })
        hls.loadSource(url)
        hls.attachMedia(video)

        // Recover the way hls.js documents instead of giving up on the first
        // fatal error: restart loading for network errors, rebuild the
        // MediaSource for media errors. The budget refills whenever a segment
        // lands, so only a stream that's genuinely stuck moves on.
        let recoveriesLeft = MAX_HLS_RECOVERIES
        let retryTimer: ReturnType<typeof setTimeout> | null = null
        hls.on(Hls.Events.FRAG_BUFFERED, () => {
          recoveriesLeft = MAX_HLS_RECOVERIES
        })
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (!data.fatal) return
          if (
            data.details === Hls.ErrorDetails.BUFFER_ADD_CODEC_ERROR ||
            data.details === Hls.ErrorDetails.BUFFER_INCOMPATIBLE_CODECS_ERROR
          ) {
            advanceRef.current(`hls ${data.details}`)
            return
          }
          const network = data.type === Hls.ErrorTypes.NETWORK_ERROR
          // Offline, retrying now only spends the budget: wait for the
          // connection, then restart the stream where the viewer is.
          if (network && isOffline()) {
            networkFailureRef.current(`hls ${data.details}`)
            return
          }
          if (recoveriesLeft > 0 && network) {
            recoveriesLeft--
            retryTimer = setTimeout(() => hls.startLoad(video.currentTime), 2000)
            return
          }
          if (recoveriesLeft > 0 && data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            recoveriesLeft--
            hls.recoverMediaError()
            return
          }
          // The connection, not the file: a film that has played reconnects where it stopped.
          if (network) networkFailureRef.current(`hls ${data.details}`)
          else advanceRef.current(`hls ${data.details}`)
        })
        detach = () => {
          if (retryTimer) clearTimeout(retryTimer)
          hls.destroy()
        }
      })
      .catch(() => {
        // The chunk didn't load (offline, or a deploy replaced it): Safari
        // can still play the stream itself.
        if (!cancelled && !playNatively()) advanceRef.current('hls.js failed to load')
      })

    return () => {
      cancelled = true
      video.removeEventListener('loadedmetadata', checkOffset)
      detach?.()
    }
  }, [mode, convertedRun, fullDuration])

  // Catch a mode that will never show a picture: nothing loaded in time. A
  // paused player that already has metadata is just waiting on autoplay
  // permission, not stuck. Doesn't apply once a frame has played.
  //
  // Only visible time counts: Chrome doesn't load media in a background tab,
  // so a viewer who starts an episode and switches tabs would otherwise come
  // back to the direct stream abandoned for the transcode (or to an error).
  //
  // A slow connection gets longer (startupPatience), no second connection
  // competing with the first (shouldHedge), and more time again whenever
  // bytes are still arriving at the deadline. Offline, the wait is for the
  // connection (networkFailure), not the next mode. Starts over with every
  // reconnect (retryRun).
  useEffect(() => {
    if (!mode || startedRef.current) return
    const video = videoRef.current
    if (!video) return
    const kbps = knownThroughput()
    const timeoutMs = (mode.kind === 'hls' ? HLS_STARTUP_TIMEOUT_MS : DIRECT_STARTUP_TIMEOUT_MS) * startupPatience(kbps)
    const mayHedge = shouldHedge(kbps)
    let extensions = 0
    let timer: ReturnType<typeof setTimeout> | null = null
    let hedgeTimer: ReturnType<typeof setTimeout> | null = null
    let hedged = false
    /** A hidden element loading the link's metadata over a connection of its own. */
    let racer: HTMLVideoElement | null = null
    /**
     * The same file on another server — the next mode, when that's direct
     * too (the link as Real-Debrid gave it, behind the nearest server's). A
     * server that sits on a connection usually sits on the next one as well,
     * so the race goes there; with nothing else, to the same link.
     */
    const next = modes[modeIndex + 1]
    const alternate = mode.kind === 'direct' && next?.kind === 'direct' && !next.viaApp ? next : null

    const check = () => {
      timer = null
      if (startedRef.current) return
      if (document.hidden) return // re-armed in full when the tab is visible again
      const stuck =
        video.readyState < HTMLMediaElement.HAVE_METADATA ||
        (!video.paused && video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA)
      if (!stuck) return
      // Still loading, just slowly: a slow start, not a dead one.
      if (Date.now() - lastBytesAtRef.current < STARTUP_LIFE_SIGN_MS && extensions < MAX_STARTUP_EXTENSIONS) {
        extensions++
        timer = setTimeout(check, STARTUP_LIFE_SIGN_MS)
        return
      }
      if (isOffline()) networkFailureRef.current('nothing loaded — offline')
      else advanceRef.current('nothing loaded before the startup timeout')
    }
    const dropRacer = () => {
      if (!racer) return
      racer.removeAttribute('src')
      racer.load()
      racer = null
    }
    // The player's own connection keeps going; whichever answers first wins.
    // Should the racer win, the player reloads — from the racer's link — and
    // reads what the racer fetched from the browser's media cache, which
    // elements share for one URL.
    const hedge = () => {
      hedgeTimer = null
      if (startedRef.current || document.hidden || hedged) return
      if (video.readyState >= HTMLMediaElement.HAVE_METADATA) return
      hedged = true
      const r = document.createElement('video')
      r.muted = true
      r.preload = 'metadata'
      r.addEventListener(
        'loadedmetadata',
        () => {
          if (racer !== r || startedRef.current || video.readyState >= HTMLMediaElement.HAVE_METADATA) return
          if (alternate) {
            console.warn('Debrid direct link: the other server answered first — switching to it')
            // Kept alive a moment, so the switched-to element finds the racer's bytes in the cache.
            racer = null
            setTimeout(() => {
              r.removeAttribute('src')
              r.load()
            }, 5000)
            advanceRef.current('slower to answer than the other server')
            return
          }
          console.warn('Debrid direct link: a second connection answered first — reloading from it')
          // A pending resume point survives: it's applied on loadedmetadata.
          video.load()
        },
        { once: true }
      )
      r.src = alternate?.url ?? mode.url
      racer = r
    }
    video.addEventListener('loadedmetadata', dropRacer)
    const clearTimers = () => {
      if (timer) clearTimeout(timer)
      if (hedgeTimer) clearTimeout(hedgeTimer)
      timer = hedgeTimer = null
    }
    const arm = () => {
      clearTimers()
      if (document.hidden) return
      timer = setTimeout(check, timeoutMs)
      // Through the app, the app races its own connections to Real-Debrid.
      if (mode.kind === 'direct' && !mode.viaApp && !hedged && mayHedge) hedgeTimer = setTimeout(hedge, DIRECT_STARTUP_HEDGE_MS)
    }
    const onVisibility = () => {
      if (startedRef.current) return
      if (document.hidden) clearTimers()
      else arm()
    }

    arm()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      clearTimers()
      dropRacer()
      video.removeEventListener('loadedmetadata', dropRacer)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [mode, modes, modeIndex, retryRun])

  // "Plays fine, no sound" — an audio codec the browser can't decode doesn't
  // fire `error`; the track is just dropped. `webkitAudioDecodedByteCount`
  // (Chromium/WebKit) staying at 0 while the video advances catches it.
  // Real-Debrid's media info should already have routed such files to the
  // transcode, but it can be missing or wrong.
  useEffect(() => {
    if (!mode) return
    const video = videoRef.current
    if (!video) return
    const el = video as HTMLVideoElement & { webkitAudioDecodedByteCount?: number }
    if (typeof el.webkitAudioDecodedByteCount !== 'number') return

    let timer: ReturnType<typeof setTimeout> | null = null
    const checkAudio = () => {
      if (video.paused || video.currentTime <= 0 || video.muted) return
      if (el.webkitAudioDecodedByteCount === 0) advanceRef.current('no audio decoded')
    }
    const handlePlaying = () => {
      if (timer) clearTimeout(timer)
      // Give decoding a few seconds to ramp up before judging it silent.
      timer = setTimeout(checkAudio, 4000)
    }

    video.addEventListener('playing', handlePlaying)
    if (!video.paused) handlePlaying()
    return () => {
      if (timer) clearTimeout(timer)
      video.removeEventListener('playing', handlePlaying)
    }
  }, [mode])

  // Keep the direct link loaded further ahead than the browser does by
  // itself (lib/readAhead) — once the film has started, and only on a
  // connection with room to spare for it.
  useEffect(() => {
    // Through the app, the app loads the film far ahead itself.
    if (starting || !videoEl || mode?.kind !== 'direct' || mode.viaApp || !sharesMediaCache()) return
    const kbps = knownThroughput()
    const duration = fullDuration || (Number.isFinite(videoEl.duration) ? videoEl.duration : 0)
    const fileKbps = playback.fileSize > 0 && duration > 0 ? (playback.fileSize * 8) / duration / 1000 : null
    if (!shouldHedge(kbps) || (kbps !== null && fileKbps !== null && kbps < fileKbps * READ_AHEAD_MIN_HEADROOM)) return
    const readAhead = new ReadAhead(mode.url, videoEl)
    return () => readAhead.destroy()
  }, [starting, videoEl, mode, fullDuration, playback.fileSize])

  // Frames the device decodes too late to show: the file plays on without a
  // stall, but judders — a 4K or high-bitrate file, or a codec this device
  // decodes in software (FrameMeter). Judged only over smooth, visible,
  // normal-speed playback; reported like stalls, once per file.
  useEffect(() => {
    if (!mode) return
    const video = videoRef.current
    if (!video || typeof video.getVideoPlaybackQuality !== 'function') return
    const meter = new FrameMeter()
    const interrupt = () => meter.reset(Date.now())
    // Scrolled out of view (the title page, reading on while it plays), the
    // browser may stop painting it: frames not shown, but not for want of time.
    let inView = true
    const observer =
      typeof IntersectionObserver === 'function'
        ? new IntersectionObserver(([entry]) => {
            inView = entry.isIntersecting
            interrupt()
          }, { threshold: 0.5 })
        : null
    observer?.observe(video)
    const timer = setInterval(() => {
      if (struggleReportedRef.current) return
      const now = Date.now()
      const smooth =
        inView &&
        !video.paused &&
        !video.seeking &&
        !document.hidden &&
        video.playbackRate === 1 &&
        video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA
      if (!smooth) {
        meter.reset(now)
        return
      }
      const quality = video.getVideoPlaybackQuality()
      meter.note(now, quality.totalVideoFrames, quality.droppedVideoFrames)
      if (!meter.struggling()) return
      struggleReportedRef.current = true
      console.warn(
        `Debrid ${mode.label} stream drops frames (${quality.droppedVideoFrames} of ${quality.totalVideoFrames}) — this device can't decode it smoothly`
      )
      onStruggleRef.current?.({ cause: 'frames', kbps: null, converted: mode.kind === 'hls' })
    }, FRAME_CHECK_MS)
    const events = ['waiting', 'seeking', 'pause', 'emptied', 'ratechange'] as const
    events.forEach((e) => video.addEventListener(e, interrupt))
    document.addEventListener('visibilitychange', interrupt)
    return () => {
      clearInterval(timer)
      observer?.disconnect()
      events.forEach((e) => video.removeEventListener(e, interrupt))
      document.removeEventListener('visibilitychange', interrupt)
    }
  }, [mode])

  // The app's conversion (lib/localStream), fed through Media Source
  // Extensions: from where the viewer is, and again from wherever they jump
  // to that isn't loaded yet. Its stream keeps the film's own clock, so the
  // controls need no offset.
  const feedCodec = playback.media?.videoCodec ?? null
  useEffect(() => {
    if (!mode || mode.kind !== 'local') return
    const video = videoRef.current
    if (!video) return
    const feed = new ConvertedFeed(video, {
      url: mode.url,
      duration: fullDuration,
      videoCodec: feedCodec,
      onFatal: (reason) => advanceRef.current(`the app's conversion failed: ${reason}`),
    })
    feedRef.current = feed
    const at = pendingSeekRef.current ?? 0
    pendingSeekRef.current = null
    void feed.start(at)
    return () => {
      feed.destroy()
      if (feedRef.current === feed) feedRef.current = null
    }
  }, [mode, fullDuration, feedCodec])

  /** A jump in the app's converted stream: instant within what's loaded, else it restarts there. */
  const seekLocal = useCallback((target: number) => {
    const feed = feedRef.current
    if (!feed) return
    const time = Math.max(0, target)
    positionRef.current = time
    if (!feed.covers(time)) {
      pauseAfterRestartRef.current = !!videoRef.current?.paused
      setRestarting(true)
    }
    feed.seek(time)
  }, [])

  /** Seek in the converted stream — restarting it when the spot isn't loaded (see planConvertedSeek). */
  const seekConverted = useCallback(
    (target: number) => {
      const video = videoRef.current
      if (!video) return
      const time = Math.min(Math.max(target, 0), fullDuration > 1 ? fullDuration - 1 : Infinity)
      const loadedUntil = video.readyState >= HTMLMediaElement.HAVE_METADATA ? bufferedEnd(video) : null
      const plan = planConvertedSeek(time, offsetRef.current, loadedUntil)
      if (plan.kind === 'local') {
        video.currentTime = plan.time
        return
      }
      convertedAtRef.current = plan.at
      positionRef.current = plan.at
      pauseAfterRestartRef.current = video.paused
      setRestarting(true)
      setConvertedRun((n) => n + 1)
    },
    [fullDuration]
  )

  /** A jump while the direct link reconnects: taken once it has loaded, from where the viewer let go. */
  const seekWhileReconnecting = useCallback((target: number) => {
    const video = videoRef.current
    const time = Math.max(0, target)
    positionRef.current = time
    setHeldAt(time)
    if (video && video.readyState >= HTMLMediaElement.HAVE_METADATA) video.currentTime = time
    else pendingSeekRef.current = time
  }, [])

  /** The element is reloading, not showing the film: the controls hold where it stood. */
  const reconnecting = trouble === 'offline' || trouble === 'reconnecting'
  const timeline = useMemo<PlayerTimeline | null>(() => {
    const frozenAt = reconnecting ? heldAt : undefined
    if (mode?.kind === 'hls') return { offset, duration: fullDuration, seek: seekConverted, restarting, frozenAt }
    if (mode?.kind === 'local') return { offset: 0, duration: fullDuration || knownDuration, seek: seekLocal, restarting, frozenAt }
    if (reconnecting) {
      return { offset: 0, duration: fullDuration || knownDuration, seek: seekWhileReconnecting, restarting: false, frozenAt }
    }
    return null
  }, [mode?.kind, offset, fullDuration, knownDuration, seekConverted, seekLocal, seekWhileReconnecting, restarting, reconnecting, heldAt])

  const handleError = () => {
    const video = videoRef.current
    const code = video?.error?.code
    // The connection, not the file: a network error, anything while the
    // browser is offline, or a reload failing for a file that has played
    // here — reconnect where the viewer is.
    if (code === MediaError.MEDIA_ERR_NETWORK || isOffline() || (startedRef.current && reconnecting)) {
      networkFailure(code === MediaError.MEDIA_ERR_NETWORK ? 'lost its connection' : `failed to reload (error ${code ?? '?'})`)
      return
    }
    // A corrupt chunk mid-film: reload where we are before giving up on the direct link.
    if (code === MediaError.MEDIA_ERR_DECODE && reloadAfterDecodeError()) return
    advance(`video element error${code ? ` ${code}` : ''}`)
  }

  if (!mode) {
    // Asking the app about the file: a moment, under the same loading screen.
    return appStreams === undefined && loadingScreen ? (
      <div className={cn('relative overflow-hidden bg-black', className)}>
        <div className="absolute inset-0 z-10">{loadingScreen(startingMessage('direct', false, false))}</div>
      </div>
    ) : null
  }

  return (
    <div ref={setContainer} className={cn('relative overflow-hidden bg-black', className)}>
      <video
        ref={setVideoRef}
        key={mode.url}
        data-testid="debrid-video"
        src={mode.kind === 'direct' ? mode.url : undefined}
        autoPlay
        playsInline
        preload="auto"
        poster={starting && !loadingScreen ? (poster ?? undefined) : undefined}
        className="absolute inset-0 h-full w-full bg-black object-contain"
        onError={handleError}
        // No browser "Save video as… / Copy video address" for the file —
        // saving it is for the admin and accounts allowed to download.
        controlsList={allowDownload ? undefined : 'nodownload'}
        onContextMenu={allowDownload ? undefined : (e) => e.preventDefault()}
      />
      <PlayerControls
        video={videoEl}
        container={container}
        // The file's own Real-Debrid link, for VLC/mpv or saving it — unless
        // the admin paused downloads for this account.
        externalUrl={allowDownload ? playback.directUrl : null}
        download={
          allowDownload
            ? {
                url: playback.directUrl,
                fileName: playback.fileName,
                size: playback.fileSize > 0 ? formatBytes(playback.fileSize) : null,
              }
            : null
        }
        streamNote={mode.kind === 'hls' ? 'Real-Debrid converts this file as it plays, so a jump takes a few seconds to start.' : null}
        timeline={timeline}
        previewUrl={previewUrl}
        starting={starting && !!loadingScreen}
        status={trouble ? TROUBLE_STATUS[trouble] : null}
        {...chrome}
      />
      {starting && loadingScreen && (
        // Under the controls, so their back button (a phone turned sideways, fullscreen) stays usable
        <div className="absolute inset-0 z-10">
          {loadingScreen(startingMessage(mode.kind, slowStart, trouble === 'offline'))}
        </div>
      )}
    </div>
  )
}
