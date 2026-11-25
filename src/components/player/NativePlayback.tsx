import { useEffect, useRef, useState } from 'react'
import { Play } from 'lucide-react'
import type { DebridReadyPlayback } from '@/lib/debridApi'
import { nearestDirectUrl, type EdgeChoice } from '@/lib/debridHost'
import { toWebVtt, type NativePlayer, type NativePlayResult } from '@/lib/nativePlayer'
import type { PlayerSubtitles } from '@/hooks/useSubtitles'

/** How long to wait for the remembered subtitles to load before starting without them. */
const SUBTITLES_WAIT_MS = 2500

interface NativePlaybackProps {
  player: NativePlayer
  playback: DebridReadyPlayback
  edge: EdgeChoice | undefined
  title: string
  subtitle?: string
  /** Seconds to start at (the resume point). */
  startAt?: number
  audioLanguage?: string
  subtitles: PlayerSubtitles
  backdropUrl?: string | null
  /** Where it got to — saved like the page player's progress. */
  onProgress: (position: number, duration: number) => void
  onNext?: () => void
  /** The viewer came back from the player. */
  onDone?: () => void
  /** It couldn't play at all: the page's own player takes over. */
  onFailed: (error: string) => void
}

/**
 * The TV app's Premium: the file plays in Android's own player
 * (lib/nativePlayer), and this stands behind it — starting it once the
 * remembered subtitles are in, saving where the film got to when the viewer
 * comes back, then the next episode or back to the details.
 */
export function NativePlayback({
  player,
  playback,
  edge,
  title,
  subtitle,
  startAt,
  audioLanguage,
  subtitles,
  backdropUrl,
  onProgress,
  onNext,
  onDone,
  onFailed,
}: NativePlaybackProps) {
  const [waited, setWaited] = useState(false)
  const [stopped, setStopped] = useState<{ at: number } | null>(null)
  const [attempt, setAttempt] = useState(0)
  const launchedFor = useRef(-1)
  const subtitlesSettled = (subtitles.status !== 'loading' && !subtitles.loadingTrack) || waited

  useEffect(() => {
    const timer = setTimeout(() => setWaited(true), SUBTITLES_WAIT_MS)
    return () => clearTimeout(timer)
  }, [])

  // The latest props, for the answer that comes back minutes later
  const latest = useRef({ onProgress, onNext, onDone, onFailed })
  latest.current = { onProgress, onNext, onDone, onFailed }

  useEffect(() => {
    if (!subtitlesSettled || launchedFor.current === attempt) return
    launchedFor.current = attempt
    const near = nearestDirectUrl(playback, edge)
    const urls = [near, playback.directUrl].filter((u, i, all): u is string => !!u && all.indexOf(u) === i)
    const from = stopped?.at ?? startAt
    const vtt = subtitles.language && subtitles.track ? toWebVtt(subtitles.track, subtitles.delay) : undefined
    void player
      .play({
        urls,
        convertedUrl: playback.hls,
        title,
        subtitle,
        startS: from,
        audioLang: audioLanguage,
        subtitlesVtt: vtt,
        subtitlesLang: subtitles.language ?? undefined,
      })
      .then((result: NativePlayResult) => {
        const { onProgress, onNext, onDone, onFailed } = latest.current
        if (result.durationS > 0) onProgress(result.positionS, result.durationS)
        if (result.error && !result.error.startsWith('stopped')) {
          onFailed(result.error)
          return
        }
        if (result.error) {
          setStopped({ at: result.positionS })
          return
        }
        if (result.ended && onNext) onNext()
        else onDone?.()
      })
      .catch((err: unknown) => latest.current.onFailed(err instanceof Error ? err.message : 'The TV player didn’t start'))
    // Started once per attempt; later changes (a cue loading, the edge) don't restart the film
  }, [subtitlesSettled, attempt]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden bg-black">
      {backdropUrl && <img src={backdropUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-20" />}
      <div className="relative flex max-w-md flex-col items-center gap-4 px-6 text-center">
        {stopped ? (
          <>
            <p className="text-lg font-semibold text-white">Playback stopped</p>
            <p className="text-sm text-white/70">The connection to the file dropped. It picks up where it stopped.</p>
            <div className="flex gap-3">
              <button
                autoFocus
                data-tv-autofocus
                onClick={() => setAttempt((n) => n + 1)}
                className="flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-black"
              >
                <Play className="h-4 w-4 fill-current" /> Play again
              </button>
              {onDone && (
                <button onClick={onDone} className="rounded-full bg-white/10 px-5 py-2.5 text-sm font-semibold text-white">
                  Back
                </button>
              )}
            </div>
          </>
        ) : (
          <p className="text-sm font-semibold text-white/70">Opening the player…</p>
        )}
      </div>
    </div>
  )
}
