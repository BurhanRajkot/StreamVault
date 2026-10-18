/**
 * PlayerControls — the overlay UI for DebridVideo's <video>.
 *
 * Replaces the browser's native controls, which differ per browser, can't be
 * extended (release picker, next episode) and, in fullscreen, hide anything
 * of ours. Fullscreen is requested on the player's container rather than the
 * <video>, so these controls — and the settings menu, which is why nothing
 * here portals out — stay on screen.
 *
 * Mouse: click toggles play, double-click toggles fullscreen, the controls
 * and cursor hide after a few idle seconds. Touch: a tap shows/hides the
 * controls, which put play/pause and ∓10s in the middle of the picture;
 * double-tapping the left/right side seeks ∓10s (keep tapping to go
 * further). Keyboard (anywhere outside a text field): Space/K play, ←/→ or
 * J/L ∓10s, ↑/↓ volume, M mute, F fullscreen, 0–9 jump to 0–90%, Shift+N
 * next episode.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import {
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Maximize,
  Minimize,
  Pause,
  PictureInPicture2,
  Play,
  Settings,
  SkipForward,
  Volume1,
  Volume2,
  VolumeX,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatPlayerTime } from '@/lib/playbackPosition'

/** One file the viewer can switch to, as the settings menu lists it. */
export interface PlayerSource {
  id: string
  /** "1080p", "4K" */
  label: string
  /** "HDR", "IMAX", ... */
  tags?: string[]
  /** "2.4 GB" */
  size?: string
  /** The full release name, shown small under the label. */
  name?: string
}

export interface PlayerControlsProps {
  video: HTMLVideoElement | null
  container: HTMLDivElement | null
  title?: string
  subtitle?: string
  /**
   * Leave the player for the title's details. Only drawn where the page's
   * own back button isn't on screen: a phone turned sideways, or fullscreen.
   */
  onBack?: () => void
  /** Files the viewer can switch between, from the settings menu. */
  sources?: PlayerSource[]
  activeSourceId?: string | null
  onSourceChange?: (id: string) => void
  /** How the stream reaches the browser, when that's worth knowing ("Converted stream"). */
  streamNote?: string | null
  /** The file's direct link — offered for VLC, mpv or a download. */
  externalUrl?: string | null
  /** Explanation shown under the spinner while the stream waits on data. */
  bufferingHint?: string | null
  /** One-off message (e.g. "couldn't resume here"), shown for a few seconds. */
  notice?: string | null
  /** Next episode, when there is one. */
  onNext?: () => void
  /** What the next episode is, e.g. "S1 · E4". */
  nextLabel?: string
  /** Extra overlay just above the control bar (e.g. a "resumed at" prompt). */
  overlay?: ReactNode
}

const SEEK_STEP_S = 10
const VOLUME_STEP = 0.1
const HIDE_AFTER_MS = 3000
/** A stall shorter than this shows no spinner — avoids flicker on every tiny rebuffer. */
const SPINNER_DELAY_MS = 400
const DOUBLE_TAP_MS = 300
/** Seeks this close together add up in one "+30s" indicator. */
const SEEK_RIPPLE_MS = 800
const NEXT_EPISODE_COUNTDOWN_S = 10
/** The "Next episode" shortcut appears this close to the end — the credits — of a long enough video. */
const CREDITS_WINDOW_S = 40
const CREDITS_MIN_DURATION_S = 10 * 60
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
  seeking: boolean
  time: number
  duration: number
  buffered: number
  volume: number
  muted: boolean
  rate: number
  /** Not enough data to play on from here. */
  starved: boolean
}

const EMPTY_SNAPSHOT: Snapshot = {
  paused: true,
  ended: false,
  seeking: false,
  time: 0,
  duration: 0,
  buffered: 0,
  volume: 1,
  muted: false,
  rate: 1,
  starved: true,
}

function snapshotOf(video: HTMLVideoElement | null): Snapshot {
  if (!video) return EMPTY_SNAPSHOT
  return {
    paused: video.paused,
    ended: video.ended,
    seeking: video.seeking,
    time: video.currentTime,
    duration: Number.isFinite(video.duration) ? video.duration : 0,
    buffered: bufferedAhead(video),
    volume: video.volume,
    muted: video.muted,
    rate: video.playbackRate,
    starved: video.readyState < HTMLMediaElement.HAVE_FUTURE_DATA,
  }
}

function sameSnapshot(a: Snapshot, b: Snapshot): boolean {
  return (Object.keys(a) as (keyof Snapshot)[]).every((k) => a[k] === b[k])
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

type MenuView = 'main' | 'quality' | 'speed'

interface SeekRipple {
  side: 'back' | 'forward'
  /** Seconds sought in this burst. */
  amount: number
}

function speedLabel(rate: number): string {
  return rate === 1 ? 'Normal' : `${rate}×`
}

export function PlayerControls({
  video,
  container,
  title,
  subtitle,
  onBack,
  sources = [],
  activeSourceId = null,
  onSourceChange,
  streamNote,
  externalUrl,
  bufferingHint,
  notice,
  onNext,
  nextLabel,
  overlay,
}: PlayerControlsProps) {
  const [snap, setSnap] = useState<Snapshot>(() => snapshotOf(video))
  const [visible, setVisible] = useState(true)
  const [spinner, setSpinner] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [pip, setPip] = useState(false)
  const [menu, setMenu] = useState<MenuView | null>(null)
  const [flash, setFlash] = useState<{ kind: 'play' | 'pause'; id: number } | null>(null)
  const [ripple, setRipple] = useState<SeekRipple | null>(null)
  /** Playhead position while the seek bar is being dragged. */
  const [scrubTime, setScrubTime] = useState<number | null>(null)
  const [hover, setHover] = useState<{ time: number; x: number } | null>(null)
  const [countdown, setCountdown] = useState<number | null>(null)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const rippleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSeekRef = useRef<{ at: number; side: SeekRipple['side']; amount: number } | null>(null)
  const seekBarRef = useRef<HTMLDivElement>(null)
  const surfaceRef = useRef<HTMLDivElement>(null)
  const settingsButtonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const lastTapRef = useRef<{ at: number; side: 'left' | 'right' | 'center' } | null>(null)
  const idRef = useRef(0)

  // ── Mirror the element's state ───────────────────────────────────────────
  useEffect(() => {
    if (!video) return
    const stored = readStoredVolume()
    if (stored) {
      video.volume = stored.volume
      video.muted = stored.muted
    }

    let spinnerTimer: ReturnType<typeof setTimeout> | null = null
    const update = () => {
      const next = snapshotOf(video)
      setSnap((prev) => (sameSnapshot(prev, next) ? prev : next))
    }
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
  const pinned = snap.paused || scrubTime !== null || menu !== null || countdown !== null

  const reveal = useCallback(() => {
    setVisible(true)
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    hideTimerRef.current = setTimeout(() => setVisible(false), HIDE_AFTER_MS)
  }, [])

  const hide = useCallback(() => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    setVisible(false)
  }, [])

  useEffect(() => {
    if (pinned) {
      setVisible(true)
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    } else {
      reveal()
    }
  }, [pinned, reveal])

  useEffect(
    () => () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
      if (rippleTimerRef.current) clearTimeout(rippleTimerRef.current)
    },
    []
  )

  const shown = visible || pinned

  // ── Actions ──────────────────────────────────────────────────────────────
  /**
   * Read the element now rather than waiting for its next event — after a
   * seek, so the bar jumps to the new spot instead of gliding back from the
   * old one for a frame.
   */
  const syncSnap = useCallback(() => {
    if (video) setSnap(snapshotOf(video))
  }, [video])

  const togglePlay = useCallback(() => {
    if (!video) return
    if (video.paused || video.ended) {
      void video.play().catch(() => {})
      setFlash({ kind: 'play', id: ++idRef.current })
    } else {
      video.pause()
      setFlash({ kind: 'pause', id: ++idRef.current })
    }
  }, [video])

  const seekBy = useCallback(
    (delta: number) => {
      if (!video) return
      const end = Number.isFinite(video.duration) ? video.duration : Infinity
      video.currentTime = Math.min(Math.max(video.currentTime + delta, 0), end)
      syncSnap()

      // Seeks in quick succession, the same way, add up: "+10s", "+20s", ...
      const side = delta < 0 ? 'back' : 'forward'
      const now = Date.now()
      const last = lastSeekRef.current
      const amount = last && last.side === side && now - last.at < SEEK_RIPPLE_MS ? last.amount + Math.abs(delta) : Math.abs(delta)
      lastSeekRef.current = { at: now, side, amount }
      setRipple({ side, amount })
      if (rippleTimerRef.current) clearTimeout(rippleTimerRef.current)
      rippleTimerRef.current = setTimeout(() => setRipple(null), SEEK_RIPPLE_MS)
    },
    [video, syncSnap]
  )

  const seekToFraction = useCallback(
    (fraction: number) => {
      if (!video || !Number.isFinite(video.duration)) return
      video.currentTime = video.duration * fraction
      syncSnap()
    },
    [video, syncSnap]
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

  const goBack = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {})
    onBack?.()
  }, [onBack])

  const setSpeed = (rate: number) => {
    if (video) video.playbackRate = rate
    setMenu('main')
  }

  const closeMenu = useCallback((restoreFocus = false) => {
    setMenu(null)
    if (restoreFocus) settingsButtonRef.current?.focus()
  }, [])

  // ── Keyboard ─────────────────────────────────────────────────────────────
  const onNextRef = useRef(onNext)
  useEffect(() => {
    onNextRef.current = onNext
  }, [onNext])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || isTextField(e.target)) return
      const target = e.target as HTMLElement | null
      // The settings menu is a list of buttons — its keys are its own.
      if (target?.closest('[data-player-menu]')) {
        if (e.key === 'Escape') {
          e.preventDefault()
          closeMenu(true)
        }
        return
      }
      // A focused control elsewhere on the page (episode button, server
      // picker, ...) keeps the keys it uses itself.
      const outside = !!target && !!container && !container.contains(target) && target !== document.body
      if (outside && (e.key === ' ' || e.key === 'Enter') && target.closest(OWN_ACTIVATION_KEYS_SELECTOR)) return
      if (outside && target.closest(OWN_ARROW_KEYS_SELECTOR)) return
      // Inside the player Space always plays/pauses, even on a focused
      // button (a mouse click leaves one focused); Enter activates it.
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
        case 'N':
          if (e.shiftKey && onNextRef.current) onNextRef.current()
          else handled = false
          break
        case 'Escape':
          if (menu) closeMenu()
          else handled = false
          break
        default:
          if (/^[0-9]$/.test(e.key)) seekToFraction(Number(e.key) / 10)
          else handled = false
      }
      if (handled) {
        e.preventDefault()
        reveal()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [container, video, menu, togglePlay, seekBy, seekToFraction, setVolume, toggleMute, toggleFullscreen, reveal, closeMenu])

  // ── Settings menu: focus in, click outside ──────────────────────────────
  useEffect(() => {
    if (!menu) return
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node
      if (menuRef.current?.contains(t) || settingsButtonRef.current?.contains(t)) return
      // A click on the picture closes the menu itself (onSurfacePointerUp) —
      // closed here first, that same click would then also pause the film.
      if (t === surfaceRef.current) return
      setMenu(null)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [menu])

  // Keyboard users land on the first item of whichever page opened.
  const menuOpenedByKeyRef = useRef(false)
  useEffect(() => {
    if (!menu || !menuOpenedByKeyRef.current) return
    menuRef.current?.querySelector<HTMLElement>('button,a[href]')?.focus()
  }, [menu])

  // ── Pointer on the picture ───────────────────────────────────────────────
  const onSurfacePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return
    if (menu) {
      setMenu(null)
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
      lastTapRef.current = { at: now, side } // keep tapping to keep seeking
      return
    }
    lastTapRef.current = { at: now, side }
    if (shown && !pinned) hide()
    else reveal()
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
    syncSnap()
    setScrubTime(null)
  }

  const onSeekKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!video) return
    if (e.key === 'Home') video.currentTime = 0
    else if (e.key === 'End' && snap.duration) video.currentTime = snap.duration - 1
    else return
    syncSnap()
    e.preventDefault()
  }

  // ── Up next ──────────────────────────────────────────────────────────────
  // Keyed on whether there *is* a next episode, not the callback's identity,
  // which callers are free to recreate every render.
  const hasNext = !!onNext

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
  const fraction = (t: number) => (snap.duration ? Math.min(1, Math.max(0, t / snap.duration)) : 0)
  const showSpinner = (spinner || (!snap.paused && snap.starved)) && !snap.ended
  const volumeLevel = snap.muted ? 0 : snap.volume
  const VolumeIcon = volumeLevel === 0 ? VolumeX : volumeLevel < 0.5 ? Volume1 : Volume2
  const canPip = typeof document !== 'undefined' && document.pictureInPictureEnabled && !!video?.requestPictureInPicture
  const activeSource = sources.find((s) => s.id === activeSourceId) ?? null
  const qualityBadge = activeSource ? (activeSource.label === '4K' ? '4K' : /^(1080p|720p)$/.test(activeSource.label) ? 'HD' : null) : null
  const inCredits =
    hasNext && snap.duration >= CREDITS_MIN_DURATION_S && snap.duration - snap.time <= CREDITS_WINDOW_S && !snap.ended
  // Glide between timeupdates while playing; jump when the viewer seeks.
  const smooth = !snap.paused && !snap.seeking && scrubTime === null

  const iconButton =
    'flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white/90 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70'

  return (
    <div
      className={cn(
        'player-controls absolute inset-0 select-none',
        // Above the phone layout's pickers (z-110) while the settings sheet is up
        menu ? 'z-[120]' : 'z-20',
        !shown && 'cursor-none'
      )}
      data-shown={shown || undefined}
      onPointerMove={(e) => {
        if (e.pointerType === 'mouse') reveal()
      }}
      // Touching a control is activity too: keep the controls up after a ∓10s
      // tap instead of letting them vanish mid-use. (The picture's own taps
      // toggle them — see onSurfacePointerUp.)
      onPointerDown={(e) => {
        if (e.pointerType !== 'mouse' && e.target !== surfaceRef.current && shown) reveal()
      }}
      // A real mouse only: after a tap, browsers send compatibility mouse
      // events, and their mouseout would hide what the tap just revealed.
      onPointerLeave={(e) => {
        if (e.pointerType === 'mouse' && !pinned) hide()
      }}
    >
      {/* Picture surface — clicks/taps here, not on the controls */}
      <div
        ref={surfaceRef}
        className="absolute inset-0"
        data-testid="player-surface"
        onPointerUp={onSurfacePointerUp}
        onDoubleClick={(e) => {
          if (e.target === e.currentTarget) toggleFullscreen()
        }}
      />

      {/* Scrims: just enough shade for the controls to read on a bright frame */}
      <div
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/70 to-transparent transition-opacity duration-300',
          shown ? 'opacity-100' : 'opacity-0'
        )}
      />
      <div
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black/80 via-black/40 to-transparent transition-opacity duration-300',
          shown ? 'opacity-100' : 'opacity-0'
        )}
      />

      {/* Spinner */}
      {showSpinner && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-4">
          <span className="player-spinner" aria-hidden="true" />
          <span className="sr-only">Loading</span>
          {bufferingHint && (
            <p className="max-w-xs rounded-lg bg-black/70 px-3.5 py-2 text-center text-xs leading-relaxed text-white/80">
              {bufferingHint}
            </p>
          )}
        </div>
      )}

      {/* Centre: play/pause and ∓10s on touch; a play button when paused with a mouse */}
      {!showSpinner && scrubTime === null && countdown === null && menu === null && (
        <div
          className={cn(
            'pointer-events-none absolute inset-0 flex items-center justify-center gap-10 transition-opacity duration-200 sm:gap-16',
            shown ? 'opacity-100' : 'opacity-0'
          )}
        >
          <button
            onClick={() => seekBy(-SEEK_STEP_S)}
            aria-label="Back 10 seconds"
            tabIndex={-1}
            className={cn(
              'hidden h-12 w-12 items-center justify-center rounded-full bg-black/35 text-white active:bg-black/55 pointer-coarse:flex',
              shown && 'pointer-events-auto'
            )}
          >
            <SeekIcon direction="back" className="h-7 w-7" />
          </button>
          <button
            onClick={togglePlay}
            aria-label={snap.paused || snap.ended ? 'Play' : 'Pause'}
            tabIndex={-1}
            className={cn(
              'h-16 w-16 items-center justify-center rounded-full bg-black/45 text-white transition-[transform,background-color] duration-150 hover:bg-black/65 active:scale-95 sm:h-[4.5rem] sm:w-[4.5rem]',
              // A mouse already has the bar; it only needs the big button while paused.
              snap.paused || snap.ended ? 'flex' : 'hidden pointer-coarse:flex',
              shown && 'pointer-events-auto'
            )}
          >
            {snap.paused || snap.ended ? (
              <Play className="ml-1 h-8 w-8 fill-current" />
            ) : (
              <Pause className="h-8 w-8 fill-current" />
            )}
          </button>
          <button
            onClick={() => seekBy(SEEK_STEP_S)}
            aria-label="Forward 10 seconds"
            tabIndex={-1}
            className={cn(
              'hidden h-12 w-12 items-center justify-center rounded-full bg-black/35 text-white active:bg-black/55 pointer-coarse:flex',
              shown && 'pointer-events-auto'
            )}
          >
            <SeekIcon direction="forward" className="h-7 w-7" />
          </button>
        </div>
      )}

      {/* Click / key feedback (mouse and keyboard — touch has the centre buttons) */}
      {flash && (
        <div
          key={flash.id}
          className="player-flash pointer-events-none absolute left-1/2 top-1/2 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white pointer-coarse:hidden"
        >
          {flash.kind === 'play' ? <Play className="ml-0.5 h-7 w-7 fill-current" /> : <Pause className="h-7 w-7 fill-current" />}
        </div>
      )}

      {/* Seek indicator: "−10s", growing as seeks add up */}
      {ripple && (
        <div
          key={`${ripple.side}`}
          className={cn(
            'player-ripple pointer-events-none absolute inset-y-0 flex w-[30%] items-center justify-center',
            ripple.side === 'back' ? 'left-0 rounded-r-[50%]' : 'right-0 rounded-l-[50%]'
          )}
        >
          <span className="flex flex-col items-center gap-1 text-white">
            <SeekIcon direction={ripple.side} className="h-7 w-7" />
            <span className="text-sm font-semibold tabular-nums">
              {ripple.side === 'back' ? '−' : '+'}
              {ripple.amount}s
            </span>
          </span>
        </div>
      )}

      {/* Notice */}
      {notice && noticeVisible && (
        <div className="pointer-events-none absolute inset-x-0 top-16 z-10 flex justify-center px-4">
          <p className="max-w-md rounded-lg bg-black/80 px-4 py-2.5 text-center text-xs leading-relaxed text-white/90 shadow-lg">
            {notice}
          </p>
        </div>
      )}

      {/* Above the bar: the caller's overlay, then the end-of-episode prompts */}
      <div
        className={cn(
          'pointer-events-none absolute inset-x-0 z-10 flex items-end justify-between gap-3 px-[max(1rem,env(safe-area-inset-left,0px))] transition-[bottom] duration-300',
          shown ? 'bottom-[calc(5.5rem+env(safe-area-inset-bottom,0px))]' : 'bottom-[calc(1.25rem+env(safe-area-inset-bottom,0px))]'
        )}
      >
        <div className="pointer-events-auto min-w-0">{overlay}</div>
        {countdown !== null && onNext ? (
          <UpNextCard
            seconds={countdown}
            label={nextLabel}
            onPlay={() => {
              setCountdown(null)
              onNext()
            }}
            onCancel={() => setCountdown(null)}
          />
        ) : (
          inCredits &&
          onNext && (
            <button
              onClick={onNext}
              className="pointer-events-auto flex shrink-0 items-center gap-2 rounded-md bg-white px-4 py-2.5 text-sm font-semibold text-black shadow-lg transition-colors hover:bg-white/90"
            >
              <SkipForward className="h-4 w-4 fill-current" />
              Next episode
            </button>
          )
        )}
      </div>

      {/* Top bar */}
      <div
        className={cn(
          'pointer-events-none absolute inset-x-0 top-0 flex items-start gap-3 pb-6 pl-[max(1rem,env(safe-area-inset-left,0px))] pr-[max(1rem,env(safe-area-inset-right,0px))] pt-[max(0.75rem,env(safe-area-inset-top,0px))] transition-opacity duration-300 sm:pt-4',
          shown ? 'opacity-100 [&_button]:pointer-events-auto' : 'opacity-0'
        )}
      >
        {onBack && (
          <button onClick={goBack} aria-label="Back to details" className={cn(iconButton, 'player-back -ml-2 hidden')}>
            <ArrowLeft className="h-6 w-6" />
          </button>
        )}
        <div className="player-overlay-title min-w-0 flex-1 pt-1">
          {title && <p className="truncate text-base font-semibold text-white drop-shadow sm:text-lg">{title}</p>}
          {subtitle && <p className="truncate text-xs text-white/70 sm:text-sm">{subtitle}</p>}
        </div>
      </div>

      {/* Bottom bar */}
      <div
        className={cn(
          'absolute inset-x-0 bottom-0 pb-[max(0.375rem,env(safe-area-inset-bottom,0px))] pl-[max(0.75rem,env(safe-area-inset-left,0px))] pr-[max(0.75rem,env(safe-area-inset-right,0px))] transition-opacity duration-300 sm:pb-2 sm:pl-4 sm:pr-4',
          shown ? 'opacity-100' : 'pointer-events-none opacity-0'
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
          className="group/seek relative flex h-6 cursor-pointer touch-none items-center rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 sm:mx-1"
        >
          <div
            className={cn(
              'relative h-[3px] w-full overflow-hidden rounded-full bg-white/25 transition-[height] duration-150 group-hover/seek:h-[5px]',
              scrubTime !== null && 'h-[5px]'
            )}
          >
            <div
              className={cn('absolute inset-0 origin-left bg-white/40', smooth && 'transition-transform duration-500 ease-linear')}
              style={{ transform: `scaleX(${fraction(snap.buffered)})` }}
            />
            {hover && scrubTime === null && (
              <div className="absolute inset-y-0 left-0 bg-white/30" style={{ width: hover.x }} />
            )}
            <div
              className={cn('absolute inset-0 origin-left bg-primary', smooth && 'transition-transform duration-300 ease-linear')}
              style={{ transform: `scaleX(${fraction(displayTime)})` }}
            />
          </div>
          {/* Thumb: rides a full-width layer that slides, so it moves on the compositor */}
          <div
            aria-hidden="true"
            className={cn('pointer-events-none absolute inset-0', smooth && 'transition-transform duration-300 ease-linear')}
            style={{ transform: `translateX(${fraction(displayTime) * 100}%)` }}
          >
            <div
              className={cn(
                'absolute left-0 top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary shadow-[0_0_0_3px_rgba(0,0,0,0.25)] transition-transform duration-150 group-hover/seek:scale-100 group-focus-visible/seek:scale-100 pointer-coarse:scale-100',
                scrubTime !== null ? 'scale-125' : 'scale-0'
              )}
            />
          </div>
          {(hover || scrubTime !== null) && snap.duration > 0 && (
            <div
              className="pointer-events-none absolute bottom-7 -translate-x-1/2 rounded-md bg-black/85 px-2 py-1 text-xs font-semibold tabular-nums text-white shadow"
              style={{ left: scrubTime !== null ? `${fraction(scrubTime) * 100}%` : `${hover?.x ?? 0}px` }}
            >
              {formatPlayerTime(scrubTime ?? hover?.time ?? 0)}
            </div>
          )}
        </div>

        {/* Buttons */}
        <div className="flex items-center gap-0.5 sm:gap-1">
          <button
            onClick={togglePlay}
            aria-label={snap.paused ? 'Play (k)' : 'Pause (k)'}
            title={snap.paused ? 'Play (k)' : 'Pause (k)'}
            className={cn(iconButton, 'pointer-coarse:hidden')}
          >
            {snap.paused ? <Play className="h-6 w-6 fill-current" /> : <Pause className="h-6 w-6 fill-current" />}
          </button>
          <button
            onClick={() => seekBy(-SEEK_STEP_S)}
            aria-label="Back 10 seconds (←)"
            title="Back 10 seconds (←)"
            className={cn(iconButton, 'pointer-coarse:hidden')}
          >
            <SeekIcon direction="back" className="h-6 w-6" />
          </button>
          <button
            onClick={() => seekBy(SEEK_STEP_S)}
            aria-label="Forward 10 seconds (→)"
            title="Forward 10 seconds (→)"
            className={cn(iconButton, 'pointer-coarse:hidden')}
          >
            <SeekIcon direction="forward" className="h-6 w-6" />
          </button>

          <div className="group/vol flex items-center pointer-coarse:hidden">
            <button
              onClick={toggleMute}
              aria-label={volumeLevel === 0 ? 'Unmute (m)' : 'Mute (m)'}
              title={volumeLevel === 0 ? 'Unmute (m)' : 'Mute (m)'}
              className={iconButton}
            >
              <VolumeIcon className="h-6 w-6" />
            </button>
            {/* Revealed on hover; phones use their hardware buttons */}
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={volumeLevel}
              onChange={(e) => setVolume(Number(e.target.value))}
              aria-label="Volume"
              className="player-volume w-0 opacity-0 transition-[width,opacity,margin] duration-200 group-hover/vol:mr-2 group-hover/vol:w-20 group-hover/vol:opacity-100 focus-visible:mr-2 focus-visible:w-20 focus-visible:opacity-100"
              style={{ ['--player-volume' as string]: `${volumeLevel * 100}%` }}
            />
          </div>

          <span className="ml-1 whitespace-nowrap text-[13px] font-medium tabular-nums text-white sm:ml-2 sm:text-sm">
            {formatPlayerTime(displayTime)}
            <span className="text-white/55"> / {formatPlayerTime(snap.duration)}</span>
          </span>

          <div className="ml-auto flex items-center gap-0.5 sm:gap-1">
            {onNext && (
              <button
                onClick={onNext}
                aria-label="Next episode"
                title={nextLabel ? `Next episode · ${nextLabel} (Shift+N)` : 'Next episode (Shift+N)'}
                className={iconButton}
              >
                <SkipForward className="h-6 w-6 fill-current" />
              </button>
            )}

            <button
              ref={settingsButtonRef}
              onClick={(e) => {
                // detail === 0: activated from the keyboard, not a pointer.
                menuOpenedByKeyRef.current = e.detail === 0
                setMenu((m) => (m ? null : 'main'))
              }}
              aria-haspopup="dialog"
              aria-expanded={menu !== null}
              title="Settings"
              className={cn(iconButton, 'relative')}
            >
              {/* Named by its content ("Settings HD"), not aria-label: the
                  badge is visible text and has to be part of the name. */}
              <span className="sr-only">Settings</span>
              <Settings aria-hidden="true" className={cn('h-6 w-6 transition-transform duration-300', menu && 'rotate-45')} />
              {qualityBadge && (
                <span className="absolute right-0.5 top-1 rounded-[3px] bg-primary px-[3px] text-[8px] font-bold leading-[11px] text-white">
                  {qualityBadge}
                </span>
              )}
            </button>

            {canPip && (
              <button
                onClick={togglePip}
                aria-label={pip ? 'Exit picture-in-picture' : 'Picture-in-picture'}
                title="Picture-in-picture"
                className={cn(iconButton, 'pointer-coarse:hidden')}
              >
                <PictureInPicture2 className="h-6 w-6" />
              </button>
            )}
            <button
              onClick={toggleFullscreen}
              aria-label={fullscreen ? 'Exit fullscreen (f)' : 'Fullscreen (f)'}
              title={fullscreen ? 'Exit fullscreen (f)' : 'Fullscreen (f)'}
              className={iconButton}
            >
              {fullscreen ? <Minimize className="h-6 w-6" /> : <Maximize className="h-6 w-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Settings — a popover over the picture; a bottom sheet on a portrait
          phone, where the picture is too short to hold a list (index.css) */}
      {menu && <div aria-hidden="true" className="player-menu-scrim" />}
      {menu && (
        <div
          ref={menuRef}
          role="dialog"
          aria-label="Player settings"
          data-player-menu
          className="player-menu absolute bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))] right-[max(0.75rem,env(safe-area-inset-right,0px))] z-30 flex max-h-[calc(100%-6.5rem)] w-[min(20rem,calc(100%-1.5rem))] flex-col overflow-hidden rounded-xl bg-neutral-900/[0.97] py-1.5 text-sm text-white shadow-2xl ring-1 ring-white/10 sm:right-4"
        >
          {menu === 'main' && (
            <div className="overflow-y-auto overscroll-contain">
              {sources.length > 0 && (
                <MenuRow onClick={() => setMenu('quality')} label="Quality" value={activeSource?.label ?? 'Auto'} chevron />
              )}
              <MenuRow onClick={() => setMenu('speed')} label="Playback speed" value={speedLabel(snap.rate)} chevron />
              {externalUrl && (
                <a
                  href={externalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex w-full items-center justify-between gap-4 px-4 py-2.5 text-left transition-colors hover:bg-white/10 focus-visible:bg-white/10 focus-visible:outline-none"
                >
                  <span>Open in another player</span>
                  <ExternalLink className="h-4 w-4 text-white/60" />
                </a>
              )}
              {streamNote && <p className="border-t border-white/10 px-4 pb-1 pt-2.5 text-xs leading-relaxed text-white/50">{streamNote}</p>}
            </div>
          )}

          {menu === 'quality' && (
            <>
              <MenuHeader title="Quality" onBack={() => setMenu('main')} />
              <div className="overflow-y-auto overscroll-contain">
                {sources.map((source) => {
                  const selected = source.id === activeSourceId
                  return (
                    <button
                      key={source.id}
                      onClick={() => {
                        setMenu(null)
                        if (!selected) onSourceChange?.(source.id)
                      }}
                      aria-current={selected || undefined}
                      title={source.name}
                      className="flex w-full items-start gap-3 px-4 py-2.5 text-left transition-colors hover:bg-white/10 focus-visible:bg-white/10 focus-visible:outline-none"
                    >
                      <Check className={cn('mt-0.5 h-4 w-4 shrink-0', selected ? 'opacity-100' : 'opacity-0')} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline gap-2">
                          <span className="font-semibold">{source.label}</span>
                          {source.tags && source.tags.length > 0 && (
                            <span className="text-xs text-white/60">{source.tags.join(' · ')}</span>
                          )}
                          {source.size && <span className="ml-auto shrink-0 text-xs tabular-nums text-white/50">{source.size}</span>}
                        </span>
                        {source.name && <span className="mt-0.5 block truncate text-[11px] text-white/40">{source.name}</span>}
                      </span>
                    </button>
                  )
                })}
              </div>
            </>
          )}

          {menu === 'speed' && (
            <>
              <MenuHeader title="Playback speed" onBack={() => setMenu('main')} />
              <div className="overflow-y-auto overscroll-contain">
                {SPEEDS.map((rate) => {
                  const selected = rate === snap.rate
                  return (
                    <button
                      key={rate}
                      onClick={() => setSpeed(rate)}
                      aria-current={selected || undefined}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-left tabular-nums transition-colors hover:bg-white/10 focus-visible:bg-white/10 focus-visible:outline-none"
                    >
                      <Check className={cn('h-4 w-4 shrink-0', selected ? 'opacity-100' : 'opacity-0')} />
                      {speedLabel(rate)}
                    </button>
                  )
                })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function MenuRow({ label, value, chevron, onClick }: { label: string; value?: string; chevron?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center justify-between gap-4 px-4 py-2.5 text-left transition-colors hover:bg-white/10 focus-visible:bg-white/10 focus-visible:outline-none"
    >
      <span>{label}</span>
      <span className="flex items-center gap-1 text-white/60">
        {value}
        {chevron && <ChevronRight className="h-4 w-4" />}
      </span>
    </button>
  )
}

function MenuHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <button
      onClick={onBack}
      className="mb-1 flex w-full shrink-0 items-center gap-2 border-b border-white/10 px-3 pb-2.5 pt-1.5 text-left font-semibold transition-colors hover:text-white/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/60"
    >
      <ChevronLeft className="h-4 w-4" />
      {title}
    </button>
  )
}

/** End of an episode: the next one starts by itself unless cancelled. */
function UpNextCard({
  seconds,
  label,
  onPlay,
  onCancel,
}: {
  seconds: number
  label?: string
  onPlay: () => void
  onCancel: () => void
}) {
  return (
    <div className="pointer-events-auto w-72 max-w-full shrink-0 overflow-hidden rounded-xl bg-neutral-900/95 text-white shadow-2xl ring-1 ring-white/10">
      <div className="p-4">
        <p className="text-xs text-white/60">Up next{label ? ` · ${label}` : ''}</p>
        <p className="mt-0.5 text-sm font-semibold">Playing in {seconds}s</p>
        <div className="mt-3 flex gap-2">
          <button
            onClick={onPlay}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-white py-2 text-xs font-bold text-black transition-colors hover:bg-white/90"
          >
            <Play className="h-3.5 w-3.5 fill-current" /> Play now
          </button>
          <button
            onClick={onCancel}
            className="rounded-md px-3 py-2 text-xs font-medium text-white/80 transition-colors hover:bg-white/10 hover:text-white"
          >
            Cancel
          </button>
        </div>
      </div>
      <div className="h-[3px] bg-white/10">
        <div className="player-countdown h-full origin-left bg-white" style={{ animationDuration: `${NEXT_EPISODE_COUNTDOWN_S}s` }} />
      </div>
    </div>
  )
}

/** A circular arrow with "10" in it — the ∓10s seek buttons (lucide's rotate arrows, plus the number). */
function SeekIcon({ direction, className }: { direction: 'back' | 'forward'; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {direction === 'back' ? (
        <>
          <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
          <path d="M3 3v5h5" />
        </>
      ) : (
        <>
          <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
          <path d="M21 3v5h-5" />
        </>
      )}
      <text
        x="12"
        y="15.3"
        textAnchor="middle"
        fontSize="8"
        fontWeight="700"
        fill="currentColor"
        stroke="none"
        style={{ fontFamily: 'Archivo, system-ui, sans-serif' }}
      >
        10
      </text>
    </svg>
  )
}
