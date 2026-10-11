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
 *     instead would lose seeking for the rest of the film.
 *   - A mode that can't show a picture with sound — element error, fatal
 *     hls.js error, no decodable video track, silent audio, nothing loaded
 *     before a timeout — is abandoned for the next one. The viewer's position
 *     carries over.
 *   - Only when every mode has failed does `onExhausted` fire, so the caller
 *     can move on to another release.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import Hls from 'hls.js'
import type { DebridReadyPlayback } from '@/lib/debridApi'
import { detectBrowserVideoSupport, planPlaybackModes, type PlaybackMode } from '@/lib/releasePlayback'
import { cn } from '@/lib/utils'
import { PlayerControls } from './PlayerControls'

/**
 * Mount one per file — give it a `key` that changes with `playback` — so a
 * new file starts fresh from its first mode and its own `startAt`.
 */
interface DebridVideoProps {
  playback: DebridReadyPlayback
  /** Every mode failed. `position` is how far the viewer had got, in seconds. */
  onExhausted: (reason: string, position: number) => void
  /** The mode now playing — e.g. to label it in the UI. */
  onModeChange?: (mode: PlaybackMode) => void
  /** Where to start, in seconds (a resume point). */
  startAt?: number
  /** Position/duration, every few seconds while playing and on pause, end and unmount. */
  onProgress?: (position: number, duration: number) => void
  /** Next episode, when there is one — offered in the controls and when this one ends. */
  onNext?: () => void
  title?: string
  subtitle?: string
  /** Extra controls for the player's top bar (release picker, open externally). */
  topBarActions?: ReactNode
  className?: string
}

/** How long a mode may take to show its first frame. Real-Debrid's transcoder takes a few seconds to spin up. */
const DIRECT_STARTUP_TIMEOUT_MS = 25_000
const HLS_STARTUP_TIMEOUT_MS = 45_000

/** Fatal hls.js errors to recover from in a row (no segment loading in between) before giving up on the mode. */
const MAX_HLS_RECOVERIES = 5

/** In-place reloads of a direct link (dropped connection, stall) before giving up on it. */
const MAX_DIRECT_RELOADS = 3
/** Smooth playback after which the reload budget refills. */
const DIRECT_RELOAD_BUDGET_RESET_MS = 60_000
/** A direct stream waiting this long without moving, though not paused, is reloaded at the same spot. */
const DIRECT_STALL_RELOAD_MS = 15_000

/**
 * Furthest into a file Real-Debrid's HLS transcode can start. It transcodes
 * from the beginning at about real time, so a jump well past that point
 * never arrives — RD answers 503 after ~2 min (measured 2026-10-05).
 */
const HLS_MAX_START_S = 60

/** How long the stream may wait for data before the "preparing" hint shows (only for the HLS transcode). */
const BUFFERING_HINT_DELAY_MS = 2500

const PROGRESS_INTERVAL_MS = 5000

export function DebridVideo({
  playback,
  onExhausted,
  onModeChange,
  startAt,
  onProgress,
  onNext,
  title,
  subtitle,
  topBarActions,
  className,
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
  const [hlsHint, setHlsHint] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

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
    setHlsHint(false)
    const video = videoRef.current
    if (!mode || !video) return

    let hintTimer: ReturnType<typeof setTimeout> | null = null
    let stallTimer: ReturnType<typeof setTimeout> | null = null
    let lastReportAt = 0

    const report = () => {
      const duration = Number.isFinite(video.duration) ? video.duration : 0
      if (positionRef.current > 0) onProgressRef.current?.(positionRef.current, duration)
      lastReportAt = Date.now()
    }
    const clearStall = () => {
      if (stallTimer) clearTimeout(stallTimer)
      stallTimer = null
    }
    const clearHint = () => {
      if (hintTimer) clearTimeout(hintTimer)
      hintTimer = null
      setHlsHint(false)
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
      clearHint()
      clearStall()
    }
    const handleTimeUpdate = () => {
      // Ignore the 0 a freshly (re)loaded element reports before its seek.
      if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA || video.currentTime > 0) {
        positionRef.current = video.currentTime
      }
      if (!video.paused && Date.now() - lastReportAt >= PROGRESS_INTERVAL_MS) report()
    }
    const handleWaiting = () => {
      if (!startedRef.current) return
      if (mode.kind === 'hls' && !hintTimer) {
        hintTimer = setTimeout(() => setHlsHint(true), BUFFERING_HINT_DELAY_MS)
      }
      if (mode.kind === 'direct' && !stallTimer) {
        const stuckAt = video.currentTime
        stallTimer = setTimeout(() => {
          stallTimer = null
          if (video.paused || video.currentTime !== stuckAt) return
          if (!reloadDirectRef.current('stalled')) advanceRef.current('stalled')
        }, DIRECT_STALL_RELOAD_MS)
      }
    }
    const handleCanPlay = () => {
      clearHint()
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
      clearHint()
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

  // Attach Real-Debrid's HLS stream. No browser except Safari understands
  // .m3u8 natively, so everything else goes through hls.js (MSE).
  useEffect(() => {
    if (!mode || mode.kind !== 'hls') return
    const video = videoRef.current
    if (!video) return

    let startPosition = pendingSeekRef.current ?? 0
    pendingSeekRef.current = null
    if (startPosition > HLS_MAX_START_S) {
      // A resume point (or a direct stream that died mid-film) that the
      // transcode can't reach — start over rather than hang.
      startPosition = 0
      setNotice("Real-Debrid's converted stream can't start mid-way, so this is playing from the beginning. Another release may play directly and resume.")
    }

    if (Hls.isSupported()) {
      // Real-Debrid transcodes on demand: the first segment, and the first
      // one after a long seek, can take a while to arrive.
      const segmentLoadPolicy = {
        default: {
          maxTimeToFirstByteMs: 40_000,
          maxLoadTimeMs: 120_000,
          timeoutRetry: { maxNumRetry: 3, retryDelayMs: 0, maxRetryDelayMs: 0 },
          errorRetry: { maxNumRetry: 6, retryDelayMs: 1000, maxRetryDelayMs: 8000 },
        },
      }
      const hls = new Hls({
        startPosition,
        maxBufferLength: 90,
        maxMaxBufferLength: 180,
        fragLoadPolicy: segmentLoadPolicy,
      })
      hls.loadSource(mode.url)
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
      return () => {
        if (retryTimer) clearTimeout(retryTimer)
        hls.destroy()
      }
    }

    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = mode.url
      if (startPosition > 0) {
        const seek = () => {
          video.currentTime = startPosition
        }
        video.addEventListener('loadedmetadata', seek, { once: true })
      }
      return () => {
        video.removeAttribute('src')
      }
    }

    advanceRef.current('HLS not supported in this browser')
  }, [mode])

  // Catch a mode that will never show a picture: nothing loaded in time. A
  // paused player that already has metadata is just waiting on autoplay
  // permission, not stuck. Doesn't apply once a frame has played.
  useEffect(() => {
    if (!mode) return
    const video = videoRef.current
    if (!video) return
    const timer = setTimeout(
      () => {
        if (startedRef.current) return
        const stuck =
          video.readyState < HTMLMediaElement.HAVE_METADATA ||
          (!video.paused && video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA)
        if (stuck) advanceRef.current('nothing loaded before the startup timeout')
      },
      mode.kind === 'hls' ? HLS_STARTUP_TIMEOUT_MS : DIRECT_STARTUP_TIMEOUT_MS
    )
    return () => clearTimeout(timer)
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
        className="absolute inset-0 h-full w-full bg-black object-contain"
        onError={handleError}
      />
      <PlayerControls
        video={videoEl}
        container={container}
        title={title}
        subtitle={subtitle}
        topBarActions={topBarActions}
        bufferingHint={
          hlsHint
            ? "Real-Debrid converts this stream as it plays and can't skip far ahead — go back a bit, or pick another release."
            : null
        }
        notice={notice}
        onNext={onNext}
      />
    </div>
  )
}
