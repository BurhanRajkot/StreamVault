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
 * Recovery, cheapest first:
 *   - A direct link that drops (network error) or stalls mid-film is reloaded
 *     in place, at the same position, a few times. Dropping to the transcode
 *     instead would cost the original quality and instant seeking.
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
 *     can move on to another release.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { formatBytes, type DebridReadyPlayback } from '@/lib/debridApi'
import {
  convertedStreamUrl,
  detectBrowserVideoSupport,
  planConvertedSeek,
  planPlaybackModes,
  type PlaybackMode,
} from '@/lib/releasePlayback'
import { cn } from '@/lib/utils'
import { PlayerControls, type PlayerControlsProps, type PlayerTimeline } from './PlayerControls'

/** What the caller can put in the controls: title, release picker, next episode, ... */
type ChromeProps = Pick<
  PlayerControlsProps,
  'title' | 'subtitle' | 'onBack' | 'sources' | 'activeSourceId' | 'onSourceChange' | 'onNext' | 'nextLabel' | 'overlay' | 'episodes'
>

/**
 * Mount one per file — give it a `key` that changes with `playback` — so a
 * new file starts fresh from its first mode and its own `startAt`.
 */
interface DebridVideoProps extends ChromeProps {
  playback: DebridReadyPlayback
  /** Every mode failed. `position` is how far the viewer had got, in seconds. */
  onExhausted: (reason: string, position: number) => void
  /** The mode now playing — e.g. to label it in the UI. */
  onModeChange?: (mode: PlaybackMode) => void
  /** Where to start, in seconds (a resume point). */
  startAt?: number
  /** Position/duration, every few seconds while playing and on pause, end and unmount. */
  onProgress?: (position: number, duration: number) => void
  /** Artwork shown until the first frame. */
  poster?: string | null
  className?: string
}

/** How long a mode may take to show its first frame. Real-Debrid's transcoder takes a few seconds to spin up. */
const DIRECT_STARTUP_TIMEOUT_MS = 25_000
const HLS_STARTUP_TIMEOUT_MS = 45_000
/**
 * A direct link that has sent nothing by now is reconnected once. Real-
 * Debrid's download servers answer in well under a second; one that hasn't
 * is usually a hung connection (seen 2026-10-18: 25s of nothing, then the
 * same link loaded in 2s), and waiting out the full timeout before falling
 * back to the slower transcode left the viewer on a spinner for ~45s.
 */
const DIRECT_STARTUP_RECONNECT_MS = 8_000

/** Fatal hls.js errors to recover from in a row (no segment loading in between) before giving up on the mode. */
const MAX_HLS_RECOVERIES = 5

/** In-place reloads of a direct link (dropped connection, stall) before giving up on it. */
const MAX_DIRECT_RELOADS = 3
/** Smooth playback after which the reload budget refills. */
const DIRECT_RELOAD_BUDGET_RESET_MS = 60_000
/** A direct stream waiting this long without moving, though not paused, is reloaded at the same spot. */
const DIRECT_STALL_RELOAD_MS = 15_000

/**
 * A converted stream asked to start closer to the beginning than this just
 * starts there: too little to tell from the playlist's length whether
 * Real-Debrid honoured the offset.
 */
const MIN_CONVERTED_START_S = 10

const PROGRESS_INTERVAL_MS = 5000

/** Where the loaded media ends, in the element's time (0 when nothing is loaded). */
function bufferedEnd(video: HTMLVideoElement): number {
  return video.buffered.length ? video.buffered.end(video.buffered.length - 1) : 0
}

export function DebridVideo({
  playback,
  onExhausted,
  onModeChange,
  startAt,
  onProgress,
  poster,
  className,
  ...chrome
}: DebridVideoProps) {
  const modes = useMemo(() => planPlaybackModes(playback, detectBrowserVideoSupport()), [playback])
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
  const reloadsLeftRef = useRef(MAX_DIRECT_RELOADS)
  const lastReloadAtRef = useRef(0)
  /** Seconds into the file at the element's time 0 — non-zero once the converted stream starts mid-way. */
  const [offset, setOffset] = useState(0)
  const offsetRef = useRef(0)
  /** Where the converted stream (re)starts, in seconds into the file. */
  const convertedAtRef = useRef(startAt && startAt > 0 ? startAt : 0)
  /** Bumped to restart the converted stream at `convertedAtRef`. */
  const [convertedRun, setConvertedRun] = useState(0)
  /** A jump is restarting the converted stream; true until it can play. */
  const [restarting, setRestarting] = useState(false)
  /** The viewer jumped while paused — stay paused once the restarted stream is ready. */
  const pauseAfterRestartRef = useRef(false)
  /** Artwork only until the first frame: a reload or a restart goes to black, not back to the poster. */
  const [showPoster, setShowPoster] = useState(true)
  const fullDuration = playback.media?.duration ?? 0

  const setVideoRef = useCallback((el: HTMLVideoElement | null) => {
    videoRef.current = el
    setVideoEl(el)
  }, [])

  useEffect(() => {
    if (mode) onModeChange?.(mode)
  }, [mode, onModeChange])

  const onExhaustedRef = useRef(onExhausted)
  const onProgressRef = useRef(onProgress)
  useEffect(() => {
    onExhaustedRef.current = onExhausted
    onProgressRef.current = onProgress
  }, [onExhausted, onProgress])

  /** Give up on the current mode; move to the next, or report the file as unplayable. */
  const advance = useCallback(
    (reason: string) => {
      pendingSeekRef.current = positionRef.current > 0 ? positionRef.current : pendingSeekRef.current
      convertedAtRef.current = pendingSeekRef.current ?? 0
      if (modeIndex + 1 < modes.length) {
        console.warn(`Debrid ${modes[modeIndex]?.label} failed (${reason}), trying ${modes[modeIndex + 1].label}`)
        setModeIndex(modeIndex + 1)
        return
      }
      if (exhaustedRef.current) return
      exhaustedRef.current = true
      console.error(`Debrid playback failed (${reason})`)
      onExhaustedRef.current(reason, positionRef.current)
    },
    [modeIndex, modes]
  )
  /** Latest `advance` for effects that shouldn't re-subscribe (and rebuild hls.js) when it changes. */
  const advanceRef = useRef(advance)
  useEffect(() => {
    advanceRef.current = advance
  }, [advance])

  /**
   * Reload the direct link where the viewer is. False when this isn't a
   * started direct stream or the reload budget is spent.
   */
  const reloadDirect = useCallback(
    (reason: string): boolean => {
      const video = videoRef.current
      if (!video || mode?.kind !== 'direct' || !startedRef.current) return false
      if (Date.now() - lastReloadAtRef.current > DIRECT_RELOAD_BUDGET_RESET_MS) reloadsLeftRef.current = MAX_DIRECT_RELOADS
      if (reloadsLeftRef.current <= 0) return false
      reloadsLeftRef.current--
      lastReloadAtRef.current = Date.now()
      const at = video.currentTime > 0 ? video.currentTime : positionRef.current
      console.warn(`Debrid direct stream ${reason} — reloading at ${Math.round(at)}s`)
      pendingSeekRef.current = at
      const wasPaused = video.paused
      video.load()
      if (!wasPaused) void video.play().catch(() => {})
      return true
    },
    [mode]
  )
  const reloadDirectRef = useRef(reloadDirect)
  useEffect(() => {
    reloadDirectRef.current = reloadDirect
  }, [reloadDirect])

  // Track whether this mode has started, keep the position, apply pending
  // seeks, and report progress.
  useEffect(() => {
    startedRef.current = false
    setRestarting(false)
    pauseAfterRestartRef.current = false
    if (mode?.kind !== 'hls') {
      offsetRef.current = 0
      setOffset(0)
    }
    const video = videoRef.current
    if (!mode || !video) return

    let stallTimer: ReturnType<typeof setTimeout> | null = null
    let lastReportAt = 0

    const report = () => {
      const duration = Number.isFinite(video.duration) ? offsetRef.current + video.duration : 0
      if (positionRef.current > 0) onProgressRef.current?.(positionRef.current, duration)
      lastReportAt = Date.now()
    }
    const clearStall = () => {
      if (stallTimer) clearTimeout(stallTimer)
      stallTimer = null
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
      const seekTo = pendingSeekRef.current
      pendingSeekRef.current = null
      if (seekTo && seekTo > 0 && mode.kind === 'direct') video.currentTime = seekTo
    }
    const handlePlaying = () => {
      startedRef.current = true
      setShowPoster(false)
      ready()
      clearStall()
    }
    const handleTimeUpdate = () => {
      // Ignore the 0 a freshly (re)loaded element reports before its seek.
      if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA || video.currentTime > 0) {
        positionRef.current = offsetRef.current + video.currentTime
      }
      if (!video.paused && Date.now() - lastReportAt >= PROGRESS_INTERVAL_MS) report()
    }
    const handleWaiting = () => {
      if (!startedRef.current) return
      if (mode.kind === 'direct' && !stallTimer) {
        const stuckAt = video.currentTime
        stallTimer = setTimeout(() => {
          stallTimer = null
          // A hidden tab may simply be throttled — not a dead connection.
          if (video.paused || document.hidden || video.currentTime !== stuckAt) return
          if (!reloadDirectRef.current('stalled')) advanceRef.current('stalled')
        }, DIRECT_STALL_RELOAD_MS)
      }
    }
    const handleCanPlay = () => {
      ready()
      clearStall()
    }

    video.addEventListener('loadedmetadata', handleLoadedMetadata)
    video.addEventListener('playing', handlePlaying)
    video.addEventListener('timeupdate', handleTimeUpdate)
    video.addEventListener('waiting', handleWaiting)
    video.addEventListener('seeking', handleWaiting)
    video.addEventListener('canplay', handleCanPlay)
    video.addEventListener('pause', report)
    video.addEventListener('ended', report)
    return () => {
      clearStall()
      report()
      video.removeEventListener('loadedmetadata', handleLoadedMetadata)
      video.removeEventListener('playing', handlePlaying)
      video.removeEventListener('timeupdate', handleTimeUpdate)
      video.removeEventListener('waiting', handleWaiting)
      video.removeEventListener('seeking', handleWaiting)
      video.removeEventListener('canplay', handleCanPlay)
      video.removeEventListener('pause', report)
      video.removeEventListener('ended', report)
    }
  }, [mode])

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
          if (recoveriesLeft > 0 && data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            recoveriesLeft--
            retryTimer = setTimeout(() => hls.startLoad(video.currentTime), 2000)
            return
          }
          if (recoveriesLeft > 0 && data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            recoveriesLeft--
            hls.recoverMediaError()
            return
          }
          advanceRef.current(`hls ${data.details}`)
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
  useEffect(() => {
    if (!mode) return
    const video = videoRef.current
    if (!video) return
    const timeoutMs = mode.kind === 'hls' ? HLS_STARTUP_TIMEOUT_MS : DIRECT_STARTUP_TIMEOUT_MS
    let timer: ReturnType<typeof setTimeout> | null = null
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    let reconnected = false

    const check = () => {
      timer = null
      if (startedRef.current) return
      if (document.hidden) return // re-armed in full when the tab is visible again
      const stuck =
        video.readyState < HTMLMediaElement.HAVE_METADATA ||
        (!video.paused && video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA)
      if (stuck) advanceRef.current('nothing loaded before the startup timeout')
    }
    const reconnect = () => {
      reconnectTimer = null
      if (startedRef.current || document.hidden || reconnected) return
      if (video.readyState >= HTMLMediaElement.HAVE_METADATA) return
      reconnected = true
      console.warn('Debrid direct link has sent nothing yet — reconnecting')
      // A pending resume point survives: it's applied on loadedmetadata.
      video.load()
    }
    const clearTimers = () => {
      if (timer) clearTimeout(timer)
      if (reconnectTimer) clearTimeout(reconnectTimer)
      timer = reconnectTimer = null
    }
    const arm = () => {
      clearTimers()
      if (document.hidden) return
      timer = setTimeout(check, timeoutMs)
      if (mode.kind === 'direct' && !reconnected) reconnectTimer = setTimeout(reconnect, DIRECT_STARTUP_RECONNECT_MS)
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
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [mode])

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

  const timeline = useMemo<PlayerTimeline | null>(
    () => (mode?.kind === 'hls' ? { offset, duration: fullDuration, seek: seekConverted, restarting } : null),
    [mode?.kind, offset, fullDuration, seekConverted, restarting]
  )

  const handleError = () => {
    const video = videoRef.current
    const code = video?.error?.code
    // A dropped connection or a corrupt chunk mid-film: reload where we are
    // before giving up on the direct link.
    if (code === MediaError.MEDIA_ERR_NETWORK || code === MediaError.MEDIA_ERR_DECODE) {
      if (reloadDirect(code === MediaError.MEDIA_ERR_NETWORK ? 'lost its connection' : 'hit a decode error')) return
    }
    advance(`video element error${code ? ` ${code}` : ''}`)
  }

  if (!mode) return null

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
        poster={showPoster ? (poster ?? undefined) : undefined}
        className="absolute inset-0 h-full w-full bg-black object-contain"
        onError={handleError}
      />
      <PlayerControls
        video={videoEl}
        container={container}
        externalUrl={playback.directUrl}
        download={{
          url: playback.directUrl,
          fileName: playback.fileName,
          size: playback.fileSize > 0 ? formatBytes(playback.fileSize) : null,
        }}
        streamNote={mode.kind === 'hls' ? 'Real-Debrid converts this file as it plays, so a jump takes a few seconds to start.' : null}
        timeline={timeline}
        {...chrome}
      />
    </div>
  )
}
