/**
 * DebridVideo — plays one Real-Debrid file in a native <video> element.
 *
 * Works down the file's playback modes (see planPlaybackModes): the direct
 * download link when the browser can decode it (instant seeking), otherwise
 * Real-Debrid's own HLS transcode (H.264 + AAC).
 * Real-Debrid does all the streaming/transcoding — nothing passes through our
 * backend.
 *
 * A mode is abandoned for the next one when it can't show a picture with
 * sound: element error, fatal hls.js error, no decodable video track, silent
 * audio, or nothing loaded before a timeout. The viewer's position carries
 * over. Only when every mode has failed does `onExhausted` fire, so the
 * caller can move on to another release.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Hls from 'hls.js'
import { Loader2 } from 'lucide-react'
import type { DebridReadyPlayback } from '@/lib/debridApi'
import { detectBrowserVideoSupport, planPlaybackModes, type PlaybackMode } from '@/lib/releasePlayback'
import { cn } from '@/lib/utils'

interface DebridVideoProps {
  playback: DebridReadyPlayback
  /** Every mode failed. `position` is how far the viewer had got, in seconds. */
  onExhausted: (reason: string, position: number) => void
  /** The mode now playing — e.g. to label it in the UI. */
  onModeChange?: (mode: PlaybackMode) => void
  className?: string
}

/** How long a mode may take to show its first frame. Real-Debrid's transcoder takes a few seconds to spin up. */
const DIRECT_STARTUP_TIMEOUT_MS = 25_000
const HLS_STARTUP_TIMEOUT_MS = 45_000

/** Fatal hls.js errors to recover from in a row (no segment loading in between) before giving up on the mode. */
const MAX_HLS_RECOVERIES = 5

/** How long the stream may wait for data before the "preparing" hint shows (only for the HLS transcode). */
const BUFFERING_HINT_DELAY_MS = 2500

export function DebridVideo({ playback, onExhausted, onModeChange, className }: DebridVideoProps) {
  const modes = useMemo(() => planPlaybackModes(playback, detectBrowserVideoSupport()), [playback])
  const [modeIndex, setModeIndex] = useState(0)
  const mode = modes[modeIndex] as PlaybackMode | undefined
  const videoRef = useRef<HTMLVideoElement>(null)
  /** Position to restore after switching modes mid-playback. */
  const resumeAtRef = useRef(0)
  const exhaustedRef = useRef(false)
  /**
   * True once the current mode has shown a frame. Startup checks stop there:
   * after that a stall is a seek into Real-Debrid's HLS, not a stream that
   * won't start. (Its transcoder runs from the start at about real time, so
   * a jump well past that point never arrives — RD answers 503 after ~2 min,
   * measured 2026-10-05.)
   */
  const startedRef = useRef(false)
  const [buffering, setBuffering] = useState(false)

  // A new file starts from its first mode.
  useEffect(() => {
    setModeIndex(0)
    resumeAtRef.current = 0
    exhaustedRef.current = false
  }, [playback])

  useEffect(() => {
    if (mode) onModeChange?.(mode)
  }, [mode, onModeChange])

  // Track whether this mode has started, and show a hint while the HLS
  // transcode catches up after a seek — otherwise it looks frozen.
  useEffect(() => {
    startedRef.current = false
    setBuffering(false)
    const video = videoRef.current
    if (!mode || !video) return
    let hintTimer: ReturnType<typeof setTimeout> | null = null
    const clearHint = () => {
      if (hintTimer) clearTimeout(hintTimer)
      hintTimer = null
      setBuffering(false)
    }
    const handlePlaying = () => {
      startedRef.current = true
      clearHint()
    }
    const handleWaiting = () => {
      if (mode.kind !== 'hls' || !startedRef.current || hintTimer) return
      hintTimer = setTimeout(() => setBuffering(true), BUFFERING_HINT_DELAY_MS)
    }
    video.addEventListener('playing', handlePlaying)
    video.addEventListener('canplay', clearHint)
    video.addEventListener('waiting', handleWaiting)
    video.addEventListener('seeking', handleWaiting)
    return () => {
      if (hintTimer) clearTimeout(hintTimer)
      video.removeEventListener('playing', handlePlaying)
      video.removeEventListener('canplay', clearHint)
      video.removeEventListener('waiting', handleWaiting)
      video.removeEventListener('seeking', handleWaiting)
    }
  }, [mode])

  const onExhaustedRef = useRef(onExhausted)
  useEffect(() => {
    onExhaustedRef.current = onExhausted
  }, [onExhausted])

  /** Give up on the current mode; move to the next, or report the file as unplayable. */
  const advance = useCallback(
    (reason: string) => {
      const position = videoRef.current?.currentTime ?? 0
      if (position > resumeAtRef.current) resumeAtRef.current = position
      if (modeIndex + 1 < modes.length) {
        console.warn(`Debrid ${modes[modeIndex]?.label} failed (${reason}), trying ${modes[modeIndex + 1].label}`)
        setModeIndex(modeIndex + 1)
        return
      }
      if (exhaustedRef.current) return
      exhaustedRef.current = true
      console.error(`Debrid playback failed (${reason})`)
      onExhaustedRef.current(reason, resumeAtRef.current)
    },
    [modeIndex, modes]
  )
  /** Latest `advance` for effects that shouldn't re-subscribe (and rebuild hls.js) when it changes. */
  const advanceRef = useRef(advance)
  useEffect(() => {
    advanceRef.current = advance
  }, [advance])

  // Attach Real-Debrid's HLS stream. No browser except Safari understands
  // .m3u8 natively, so everything else goes through hls.js (MSE).
  useEffect(() => {
    if (!mode || mode.kind !== 'hls') return
    const video = videoRef.current
    if (!video) return

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
        startPosition: resumeAtRef.current,
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
      return () => {
        video.removeAttribute('src')
      }
    }

    advanceRef.current('HLS not supported in this browser')
  }, [mode])

  // Catch a mode that will never show a picture: metadata with no video
  // track (an undecodable codec plays sound over black), or nothing loaded in
  // time. A paused player that already has metadata is just waiting on
  // autoplay permission, not stuck. Neither applies once a frame has played.
  useEffect(() => {
    if (!mode) return
    const video = videoRef.current
    if (!video) return

    const handleLoadedMetadata = () => {
      if (video.videoWidth === 0) {
        advanceRef.current('no decodable video track')
        return
      }
      if (mode.kind === 'direct' && resumeAtRef.current > 0) video.currentTime = resumeAtRef.current
    }
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

    video.addEventListener('loadedmetadata', handleLoadedMetadata)
    return () => {
      clearTimeout(timer)
      video.removeEventListener('loadedmetadata', handleLoadedMetadata)
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

  // Fixed 10s seek on left/right arrow — the native controls seek by an
  // inconsistent amount (often a % of duration when the scrubber has focus).
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
      const target = e.target as HTMLElement | null
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return
      const video = videoRef.current
      if (!video) return

      e.preventDefault()
      const next = video.currentTime + (e.key === 'ArrowRight' ? 10 : -10)
      video.currentTime = Number.isFinite(video.duration)
        ? Math.min(Math.max(next, 0), video.duration)
        : Math.max(next, 0)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  if (!mode) return null

  return (
    <>
      <video
        ref={videoRef}
        key={mode.url}
        data-testid="debrid-video"
        src={mode.kind === 'direct' ? mode.url : undefined}
        controls
        autoPlay
        playsInline
        className={cn('bg-black object-contain', className)}
        onError={() => advance('video element error')}
      />
      {buffering && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
          <div className="flex items-center gap-2 rounded-full border border-white/10 bg-black/70 px-4 py-2 text-xs text-white/80 backdrop-blur-sm">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Real-Debrid converts this stream as it plays and can&apos;t skip far ahead — go back a bit, or pick another release.
          </div>
        </div>
      )}
    </>
  )
}
