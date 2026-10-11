/**
 * PlayerControls — the overlay UI for DebridVideo's <video>.
 *
 * Replaces the browser's native controls, which differ per browser, can't be
 * extended (release picker, next episode) and, in fullscreen, hide anything
 * of ours. Fullscreen is requested on the player's container rather than the
 * <video>, so these controls — and every menu in them, which is why none of
 * them portal out — stay on screen.
 *
 * Desktop: click toggles play, double-click toggles fullscreen, controls hide
 * after a few idle seconds. Touch: tap shows/hides the controls, double-tap
 * the left/right side seeks ∓10s. Keyboard (anywhere outside a text field):
 * Space/K play, ←/→ or J/L ∓10s, ↑/↓ volume, M mute, F fullscreen.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import {
  Loader2,
  Maximize,
  Minimize,
  Pause,
  PictureInPicture2,
  Play,
  RotateCcw,
  RotateCw,
  SkipForward,
  Volume1,
  Volume2,
  VolumeX,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatPlayerTime } from '@/lib/playbackPosition'

interface PlayerControlsProps {
  video: HTMLVideoElement | null
  container: HTMLDivElement | null
  title?: string
  subtitle?: string
  /** Extra controls on the right of the top bar. */
  topBarActions?: ReactNode
  /** Explanation shown under the spinner while the stream waits on data. */
  bufferingHint?: string | null
  /** One-off message (e.g. "couldn't resume here"), shown for a few seconds. */
  notice?: string | null
  /** Next episode, when there is one. */
  onNext?: () => void
}

const SEEK_STEP_S = 10
const VOLUME_STEP = 0.1
const HIDE_AFTER_MS = 3000
/** A stall shorter than this shows no spinner — avoids flicker on every tiny rebuffer. */
const SPINNER_DELAY_MS = 400
const DOUBLE_TAP_MS = 300
const NEXT_EPISODE_COUNTDOWN_S = 10
const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const

const VOLUME_STORAGE_KEY = 'sv:player:volume'

function readStoredVolume(): { volume: number; muted: boolean } | null {
  try {
    const raw = localStorage.getItem(VOLUME_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { volume?: unknown; muted?: unknown }
    if (typeof parsed.volume !== 'number' || typeof parsed.muted !== 'boolean') return null
    return { volume: Math.min(Math.max(parsed.volume, 0), 1), muted: parsed.muted }
  } catch {
    return null
  }
}

function storeVolume(volume: number, muted: boolean) {
  try {
    localStorage.setItem(VOLUME_STORAGE_KEY, JSON.stringify({ volume, muted }))
  } catch {
    // Not remembering the volume is fine.
  }
}

/** End of the buffered range the playhead is in, in seconds. */
function bufferedAhead(video: HTMLVideoElement): number {
  const t = video.currentTime
  for (let i = 0; i < video.buffered.length; i++) {
    if (video.buffered.start(i) <= t + 0.5 && t <= video.buffered.end(i)) return video.buffered.end(i)
  }
  return t
}

interface Snapshot {
  paused: boolean
  ended: boolean
  time: number
  duration: number
  buffered: number
  volume: number
  muted: boolean
  rate: number
  /** Not enough data to play on from here. */
  starved: boolean
}

function snapshotOf(video: HTMLVideoElement | null): Snapshot {
  if (!video) {
    return { paused: true, ended: false, time: 0, duration: 0, buffered: 0, volume: 1, muted: false, rate: 1, starved: true }
  }
  return {
    paused: video.paused,
    ended: video.ended,
    time: video.currentTime,
    duration: Number.isFinite(video.duration) ? video.duration : 0,
    buffered: bufferedAhead(video),
    volume: video.volume,
    muted: video.muted,
    rate: video.playbackRate,
    starved: video.readyState < HTMLMediaElement.HAVE_FUTURE_DATA,
  }
}

/** Controls that Space/Enter activate. */
const OWN_ACTIVATION_KEYS_SELECTOR = 'button,a[href],summary,[role="button"],[role="link"],[role="checkbox"],[role="switch"]'

/** Widgets that use the arrow keys themselves. */
const OWN_ARROW_KEYS_SELECTOR =
  '[role="combobox"],[role="listbox"],[role="option"],[role="menu"],[role="menuitem"],[role="slider"],[role="tab"],[role="radiogroup"]'

function isTextField(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  return !!el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable)
}

interface Flash {
  kind: 'play' | 'pause' | 'back' | 'forward'
  /** Bumped so the same flash twice in a row re-runs its animation. */
  id: number
}

export function PlayerControls({
  video,
  container,
  title,
  subtitle,
  topBarActions,
  bufferingHint,
  notice,
  onNext,
}: PlayerControlsProps) {
  const [snap, setSnap] = useState<Snapshot>(() => snapshotOf(video))
  const [visible, setVisible] = useState(true)
  const [spinner, setSpinner] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [pip, setPip] = useState(false)
  const [speedMenuOpen, setSpeedMenuOpen] = useState(false)
  const [flash, setFlash] = useState<Flash | null>(null)
  /** Playhead position while the seek bar is being dragged. */
  const [scrubTime, setScrubTime] = useState<number | null>(null)
  const [hover, setHover] = useState<{ time: number; x: number } | null>(null)
  const [countdown, setCountdown] = useState<number | null>(null)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const seekBarRef = useRef<HTMLDivElement>(null)
  const lastTapRef = useRef<{ at: number; side: 'left' | 'right' | 'center' } | null>(null)
  const flashIdRef = useRef(0)

  // ── Mirror the element's state ───────────────────────────────────────────
  useEffect(() => {
    if (!video) return
    const stored = readStoredVolume()
    if (stored) {
      video.volume = stored.volume
      video.muted = stored.muted
    }

    let spinnerTimer: ReturnType<typeof setTimeout> | null = null
    const update = () => setSnap(snapshotOf(video))
    const onWaiting = () => {
      update()
      if (!spinnerTimer) spinnerTimer = setTimeout(() => setSpinner(true), SPINNER_DELAY_MS)
    }
    const onFlowing = () => {
      update()
      if (spinnerTimer) clearTimeout(spinnerTimer)
      spinnerTimer = null
      setSpinner(false)
    }
    const onVolume = () => {
      update()
      storeVolume(video.volume, video.muted)
    }
    const onEnterPip = () => setPip(true)
    const onLeavePip = () => setPip(false)

    const events = ['timeupdate', 'durationchange', 'progress', 'ratechange', 'pause', 'play', 'ended', 'loadedmetadata', 'seeked']
    events.forEach((e) => video.addEventListener(e, update))
    video.addEventListener('waiting', onWaiting)
    video.addEventListener('seeking', onWaiting)
    video.addEventListener('playing', onFlowing)
    video.addEventListener('seeked', onFlowing)
    video.addEventListener('canplay', onFlowing)
    video.addEventListener('volumechange', onVolume)
    video.addEventListener('enterpictureinpicture', onEnterPip)
    video.addEventListener('leavepictureinpicture', onLeavePip)
    update()
    return () => {
      if (spinnerTimer) clearTimeout(spinnerTimer)
      events.forEach((e) => video.removeEventListener(e, update))
      video.removeEventListener('waiting', onWaiting)
      video.removeEventListener('seeking', onWaiting)
      video.removeEventListener('playing', onFlowing)
      video.removeEventListener('seeked', onFlowing)
      video.removeEventListener('canplay', onFlowing)
      video.removeEventListener('volumechange', onVolume)
      video.removeEventListener('enterpictureinpicture', onEnterPip)
      video.removeEventListener('leavepictureinpicture', onLeavePip)
    }
  }, [video])

  useEffect(() => {
    const onChange = () => setFullscreen(!!container && document.fullscreenElement === container)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [container])

  // ── Auto-hide ────────────────────────────────────────────────────────────
  const menuOpen = speedMenuOpen
  const pinned = snap.paused || scrubTime !== null || menuOpen || countdown !== null

  const reveal = useCallback(() => {
    setVisible(true)
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    hideTimerRef.current = setTimeout(() => setVisible(false), HIDE_AFTER_MS)
  }, [])

  useEffect(() => {
    if (pinned) {
      setVisible(true)
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    } else {
      reveal()
    }
  }, [pinned, reveal])

  useEffect(() => () => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
  }, [])

  const shown = visible || pinned

  // ── Actions ──────────────────────────────────────────────────────────────
  const showFlash = (kind: Flash['kind']) => setFlash({ kind, id: ++flashIdRef.current })

  const togglePlay = useCallback(() => {
    if (!video) return
    if (video.paused || video.ended) {
      void video.play().catch(() => {})
      showFlash('play')
    } else {
      video.pause()
      showFlash('pause')
    }
  }, [video])

  const seekBy = useCallback(
    (delta: number) => {
      if (!video) return
      const end = Number.isFinite(video.duration) ? video.duration : Infinity
      video.currentTime = Math.min(Math.max(video.currentTime + delta, 0), end)
      showFlash(delta < 0 ? 'back' : 'forward')
    },
    [video]
  )

  const setVolume = useCallback(
    (volume: number) => {
      if (!video) return
      video.volume = Math.min(Math.max(volume, 0), 1)
      video.muted = video.volume === 0
    },
    [video]
  )

  const toggleMute = useCallback(() => {
    if (!video) return
    if (video.muted || video.volume === 0) {
      video.muted = false
      if (video.volume === 0) video.volume = 0.5
    } else {
      video.muted = true
    }
  }, [video])

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {})
      return
    }
    if (container?.requestFullscreen) {
      void container
        .requestFullscreen({ navigationUI: 'hide' })
        .then(() => {
          // Phones: fullscreen video should fill a sideways screen.
          const orientation = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }
          return orientation?.lock?.('landscape')
        })
        .catch(() => {})
      return
    }
    // iOS Safari has no element fullscreen — only the video's own player.
    const legacy = video as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null
    legacy?.webkitEnterFullscreen?.()
  }, [container, video])

  const togglePip = useCallback(() => {
    if (!video) return
    if (document.pictureInPictureElement) {
      void document.exitPictureInPicture().catch(() => {})
    } else {
      void video.requestPictureInPicture?.().catch(() => {})
    }
  }, [video])

  const setSpeed = (rate: number) => {
    if (video) video.playbackRate = rate
    setSpeedMenuOpen(false)
  }

  // ── Keyboard ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || isTextField(e.target)) return
      // A focused control elsewhere on the page (episode button, server
      // picker, ...) keeps the keys it uses itself.
      const target = e.target as HTMLElement | null
      const outside = !!target && !!container && !container.contains(target) && target !== document.body
      if (outside && (e.key === ' ' || e.key === 'Enter') && target.closest(OWN_ACTIVATION_KEYS_SELECTOR)) return
      if (outside && target.closest(OWN_ARROW_KEYS_SELECTOR)) return
      let handled = true
      switch (e.key) {
        case ' ':
        case 'k':
        case 'K':
          togglePlay()
          break
        case 'ArrowLeft':
        case 'j':
        case 'J':
          seekBy(-SEEK_STEP_S)
          break
        case 'ArrowRight':
        case 'l':
        case 'L':
          seekBy(SEEK_STEP_S)
          break
        case 'ArrowUp':
          if (video) setVolume(video.volume + VOLUME_STEP)
          break
        case 'ArrowDown':
          if (video) setVolume(video.volume - VOLUME_STEP)
          break
        case 'm':
        case 'M':
          toggleMute()
          break
        case 'f':
        case 'F':
          toggleFullscreen()
          break
        default:
          handled = false
      }
      if (handled) {
        e.preventDefault()
        reveal()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [container, video, togglePlay, seekBy, setVolume, toggleMute, toggleFullscreen, reveal])

  // ── Pointer on the picture ───────────────────────────────────────────────
  const onSurfacePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return
    if (speedMenuOpen) {
      setSpeedMenuOpen(false)
      return
    }
    if (e.pointerType === 'mouse') {
      if (e.button === 0) togglePlay()
      return
    }
    // Touch / pen
    const rect = e.currentTarget.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width
    const side = x < 0.35 ? 'left' : x > 0.65 ? 'right' : 'center'
    const now = Date.now()
    const last = lastTapRef.current
    if (last && now - last.at < DOUBLE_TAP_MS && last.side === side && side !== 'center') {
      seekBy(side === 'left' ? -SEEK_STEP_S : SEEK_STEP_S)
      lastTapRef.current = { at: now, side } // allow triple-tap to keep seeking
      reveal()
      return
    }
    lastTapRef.current = { at: now, side }
    if (shown && !pinned) {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
      setVisible(false)
    } else {
      reveal()
    }
  }

  // ── Seek bar ─────────────────────────────────────────────────────────────
  const timeAt = (clientX: number): number => {
    const bar = seekBarRef.current
    if (!bar || !snap.duration) return 0
    const rect = bar.getBoundingClientRect()
    return Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1) * snap.duration
  }

  const onSeekPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!snap.duration) return
    e.currentTarget.setPointerCapture(e.pointerId)
    setScrubTime(timeAt(e.clientX))
  }

  const onSeekPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const t = timeAt(e.clientX)
    if (scrubTime !== null) setScrubTime(t)
    const rect = seekBarRef.current?.getBoundingClientRect()
    if (rect && e.pointerType === 'mouse') setHover({ time: t, x: e.clientX - rect.left })
  }

  const onSeekPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (scrubTime === null) return
    if (video) video.currentTime = timeAt(e.clientX)
    setScrubTime(null)
  }

  const onSeekKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!video) return
    if (e.key === 'Home') video.currentTime = 0
    else if (e.key === 'End' && snap.duration) video.currentTime = snap.duration - 1
    else return
    e.preventDefault()
  }

  // ── Up next ──────────────────────────────────────────────────────────────
  // Keyed on whether there *is* a next episode, not the callback's identity,
  // which callers are free to recreate every render.
  const hasNext = !!onNext
  const onNextRef = useRef(onNext)
  useEffect(() => {
    onNextRef.current = onNext
  }, [onNext])

  useEffect(() => {
    if (snap.ended && hasNext) setCountdown(NEXT_EPISODE_COUNTDOWN_S)
    else setCountdown(null)
  }, [snap.ended, hasNext])

  useEffect(() => {
    if (countdown === null) return
    if (countdown <= 0) {
      setCountdown(null)
      onNextRef.current?.()
      return
    }
    const timer = setTimeout(() => setCountdown((c) => (c === null ? null : c - 1)), 1000)
    return () => clearTimeout(timer)
  }, [countdown])

  // ── Notice ───────────────────────────────────────────────────────────────
  const [noticeVisible, setNoticeVisible] = useState(false)
  useEffect(() => {
    if (!notice) return
    setNoticeVisible(true)
    const timer = setTimeout(() => setNoticeVisible(false), 7000)
    return () => clearTimeout(timer)
  }, [notice])

  // ── Render ───────────────────────────────────────────────────────────────
  const displayTime = scrubTime ?? snap.time
  const pct = (t: number) => (snap.duration ? Math.min(100, (t / snap.duration) * 100) : 0)
  const showSpinner = (spinner || (!snap.paused && snap.starved)) && !snap.ended
  const volumeLevel = snap.muted ? 0 : snap.volume
  const VolumeIcon = volumeLevel === 0 ? VolumeX : volumeLevel < 0.5 ? Volume1 : Volume2
  const iconButton =
    'flex h-10 w-10 items-center justify-center rounded-full text-white/90 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60'
  const canPip = typeof document !== 'undefined' && document.pictureInPictureEnabled && !!video?.requestPictureInPicture

  return (
    <div
      className={cn('absolute inset-0 z-20 select-none', !shown && 'cursor-none')}
      onPointerMove={(e) => {
        if (e.pointerType === 'mouse') reveal()
      }}
      onMouseLeave={() => {
        if (!pinned) setVisible(false)
      }}
    >
      {/* Picture surface — clicks/taps here, not on the controls */}
      <div
        className="absolute inset-0"
        data-testid="player-surface"
        onPointerUp={onSurfacePointerUp}
        onDoubleClick={(e) => {
          if (e.target === e.currentTarget) toggleFullscreen()
        }}
      />

      {/* Spinner */}
      {showSpinner && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3">
          <Loader2 className="h-12 w-12 animate-spin text-white/80 drop-shadow-lg" />
          {bufferingHint && (
            <p className="max-w-sm rounded-full bg-black/70 px-4 py-2 text-center text-xs text-white/80">{bufferingHint}</p>
          )}
        </div>
      )}

      {/* Big play button while paused */}
      {snap.paused && !snap.ended && !showSpinner && scrubTime === null && (
        <button
          onClick={togglePlay}
          aria-label="Play"
          className="absolute left-1/2 top-1/2 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-black shadow-2xl transition-transform hover:scale-105 active:scale-95 sm:h-20 sm:w-20"
        >
          <Play className="ml-1 h-8 w-8 fill-current sm:h-9 sm:w-9" />
        </button>
      )}

      {/* Feedback for a click / key / double-tap */}
      {flash && (
        <div
          key={flash.id}
          className={cn(
            'player-flash pointer-events-none absolute top-1/2 flex h-16 w-16 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-white',
            flash.kind === 'back' ? 'left-[18%]' : flash.kind === 'forward' ? 'right-[18%]' : 'left-1/2 -translate-x-1/2'
          )}
        >
          {flash.kind === 'play' && <Play className="ml-0.5 h-7 w-7 fill-current" />}
          {flash.kind === 'pause' && <Pause className="h-7 w-7 fill-current" />}
          {flash.kind === 'back' && <span className="text-sm font-semibold">−{SEEK_STEP_S}s</span>}
          {flash.kind === 'forward' && <span className="text-sm font-semibold">+{SEEK_STEP_S}s</span>}
        </div>
      )}

      {/* Notice */}
      {notice && noticeVisible && (
        <div className="pointer-events-none absolute inset-x-0 top-16 flex justify-center px-4">
          <p className="max-w-md rounded-lg bg-black/75 px-4 py-2 text-center text-xs text-white/85 shadow-lg">{notice}</p>
        </div>
      )}

      {/* Up next */}
      {countdown !== null && onNext && (
        <div className="absolute bottom-24 right-4 z-10 w-64 rounded-xl border border-white/10 bg-zinc-900/95 p-4 shadow-2xl sm:right-8">
          <p className="text-xs uppercase tracking-widest text-white/50">Up next</p>
          <p className="mt-1 text-sm font-semibold text-white">Next episode in {countdown}s</p>
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => {
                setCountdown(null)
                onNext()
              }}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-white py-2 text-xs font-bold text-black hover:bg-white/90"
            >
              <Play className="h-3.5 w-3.5 fill-current" /> Play now
            </button>
            <button
              onClick={() => setCountdown(null)}
              className="rounded-md border border-white/20 px-3 py-2 text-xs text-white/80 hover:bg-white/10"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Top bar. The gradients themselves let clicks through to the
          picture; only the controls on them take the pointer. */}
      <div
        className={cn(
          'pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 bg-gradient-to-b from-black/75 via-black/30 to-transparent px-3 pb-10 pt-3 transition-opacity duration-300 sm:px-5 sm:pt-4',
          shown ? 'opacity-100' : 'opacity-0'
        )}
      >
        <div className="player-overlay-title min-w-0">
          {title && <p className="truncate text-sm font-semibold text-white sm:text-base">{title}</p>}
          {subtitle && <p className="truncate text-xs text-white/60">{subtitle}</p>}
        </div>
        <div className={cn('ml-auto flex shrink-0 items-center gap-2', shown && 'pointer-events-auto')}>{topBarActions}</div>
      </div>

      {/* Bottom bar */}
      <div
        className={cn(
          'pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent px-2 pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))] pt-12 transition-opacity duration-300 sm:px-4 [&>*]:pointer-events-auto',
          shown ? 'opacity-100' : 'opacity-0 [&>*]:!pointer-events-none'
        )}
      >
        {/* Seek bar */}
        <div
          ref={seekBarRef}
          role="slider"
          tabIndex={0}
          aria-label="Seek"
          aria-valuemin={0}
          aria-valuemax={Math.floor(snap.duration)}
          aria-valuenow={Math.floor(displayTime)}
          aria-valuetext={`${formatPlayerTime(displayTime)} of ${formatPlayerTime(snap.duration)}`}
          data-testid="player-seekbar"
          onPointerDown={onSeekPointerDown}
          onPointerMove={onSeekPointerMove}
          onPointerUp={onSeekPointerUp}
          onPointerCancel={() => setScrubTime(null)}
          onPointerLeave={() => setHover(null)}
          onKeyDown={onSeekKeyDown}
          className="group/seek relative mx-1 flex h-5 cursor-pointer touch-none items-center focus-visible:outline-none sm:mx-2"
        >
          <div
            className={cn(
              'relative h-1 w-full rounded-full bg-white/20 transition-[height] duration-150 group-hover/seek:h-1.5',
              scrubTime !== null && 'h-1.5'
            )}
          >
            <div className="absolute inset-y-0 left-0 rounded-full bg-white/35" style={{ width: `${pct(snap.buffered)}%` }} />
            <div className="absolute inset-y-0 left-0 rounded-full bg-primary" style={{ width: `${pct(displayTime)}%` }} />
            <div
              className={cn(
                'absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary shadow transition-transform duration-150 group-hover/seek:scale-100 group-focus-visible/seek:scale-100',
                scrubTime !== null ? 'scale-100' : 'scale-0'
              )}
              style={{ left: `${pct(displayTime)}%` }}
            />
          </div>
          {(hover || scrubTime !== null) && snap.duration > 0 && (
            <div
              className="pointer-events-none absolute bottom-6 -translate-x-1/2 rounded bg-black/85 px-2 py-1 text-xs font-medium tabular-nums text-white"
              style={{
                left:
                  scrubTime !== null
                    ? `${pct(scrubTime)}%`
                    : `${hover?.x ?? 0}px`,
              }}
            >
              {formatPlayerTime(scrubTime ?? hover?.time ?? 0)}
            </div>
          )}
        </div>

        {/* Buttons */}
        <div className="mt-1 flex items-center gap-0.5 sm:gap-1">
          <button onClick={togglePlay} aria-label={snap.paused ? 'Play (k)' : 'Pause (k)'} title={snap.paused ? 'Play (k)' : 'Pause (k)'} className={iconButton}>
            {snap.paused ? <Play className="h-5 w-5 fill-current" /> : <Pause className="h-5 w-5 fill-current" />}
          </button>
          <button onClick={() => seekBy(-SEEK_STEP_S)} aria-label="Back 10 seconds" title="Back 10s (←)" className={iconButton}>
            <RotateCcw className="h-5 w-5" />
          </button>
          <button onClick={() => seekBy(SEEK_STEP_S)} aria-label="Forward 10 seconds" title="Forward 10s (→)" className={iconButton}>
            <RotateCw className="h-5 w-5" />
          </button>

          <div className="group/vol flex items-center">
            <button onClick={toggleMute} aria-label={volumeLevel === 0 ? 'Unmute (m)' : 'Mute (m)'} title={volumeLevel === 0 ? 'Unmute (m)' : 'Mute (m)'} className={iconButton}>
              <VolumeIcon className="h-5 w-5" />
            </button>
            {/* Hover-revealed on desktop; phones use the hardware buttons */}
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={volumeLevel}
              onChange={(e) => setVolume(Number(e.target.value))}
              aria-label="Volume"
              className="player-volume hidden w-0 opacity-0 transition-[width,opacity] duration-200 group-hover/vol:w-20 group-hover/vol:opacity-100 focus-visible:w-20 focus-visible:opacity-100 md:block"
              style={{ ['--player-volume' as string]: `${volumeLevel * 100}%` }}
            />
          </div>

          <span className="ml-1 whitespace-nowrap text-xs tabular-nums text-white/85 sm:ml-2 sm:text-sm">
            {formatPlayerTime(displayTime)}
            <span className="text-white/45"> / {formatPlayerTime(snap.duration)}</span>
          </span>

          <div className="ml-auto flex items-center gap-0.5 sm:gap-1">
            {onNext && (
              <button onClick={onNext} aria-label="Next episode" title="Next episode" className={cn(iconButton, 'w-auto gap-1.5 px-3')}>
                <SkipForward className="h-5 w-5 fill-current" />
                <span className="hidden text-xs font-semibold sm:inline">Next</span>
              </button>
            )}

            <div className="relative">
              <button
                onClick={() => setSpeedMenuOpen((o) => !o)}
                aria-label="Playback speed"
                aria-expanded={speedMenuOpen}
                title="Playback speed"
                className={cn(iconButton, 'w-auto px-2.5 text-xs font-semibold tabular-nums')}
              >
                {snap.rate === 1 ? '1x' : `${snap.rate}x`}
              </button>
              {speedMenuOpen && (
                <div className="absolute bottom-full right-0 mb-2 w-28 overflow-hidden rounded-lg border border-white/10 bg-zinc-900/95 py-1 shadow-2xl">
                  {SPEEDS.map((rate) => (
                    <button
                      key={rate}
                      onClick={() => setSpeed(rate)}
                      className={cn(
                        'block w-full px-3 py-1.5 text-left text-xs tabular-nums transition-colors hover:bg-white/10',
                        rate === snap.rate ? 'font-semibold text-white' : 'text-white/70'
                      )}
                    >
                      {rate === 1 ? 'Normal' : `${rate}x`}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {canPip && (
              <button onClick={togglePip} aria-label={pip ? 'Exit picture-in-picture' : 'Picture-in-picture'} title="Picture-in-picture" className={cn(iconButton, 'hidden sm:flex')}>
                <PictureInPicture2 className="h-5 w-5" />
              </button>
            )}
            <button onClick={toggleFullscreen} aria-label={fullscreen ? 'Exit fullscreen (f)' : 'Fullscreen (f)'} title={fullscreen ? 'Exit fullscreen (f)' : 'Fullscreen (f)'} className={iconButton}>
              {fullscreen ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
