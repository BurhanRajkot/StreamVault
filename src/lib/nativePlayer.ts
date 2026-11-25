/**
 * Playing Premium in the device's own video player — the TV app only.
 *
 * On a TV the web view can't keep up with a film: it draws every frame
 * through the GPU and, for Dolby/DTS files, the app converts the audio on
 * the TV's CPU. The TV app registers Android's own player here
 * (app/src/native/nativePlayer.ts → TvPlayerActivity), and the Premium
 * player hands it the file instead of playing it in the page
 * (components/player/NativePlayback). Nothing registers on the website,
 * a phone or a computer, which play as before.
 */

import type { SubtitleTrack } from './subtitles'

export interface NativePlayRequest {
  /** The file's links, best first (the nearest Real-Debrid server, then the one it gave). */
  urls: string[]
  /** Real-Debrid's conversion (HLS, H.264 + AAC): for when the file's audio can't play. */
  convertedUrl: string | null
  title: string
  /** The line under the title: "S1 · E4". */
  subtitle?: string
  /** Seconds to start at. */
  startS?: number
  /** The audio track's language to prefer (ISO 639-1). */
  audioLang?: string
  /** The subtitles on screen, as WebVTT. */
  subtitlesVtt?: string
  subtitlesLang?: string
}

export interface NativePlayResult {
  positionS: number
  durationS: number
  ended: boolean
  /** It couldn't play — "stopped: …" when it did for a while first. */
  error?: string
}

export interface NativePlayer {
  play(request: NativePlayRequest): Promise<NativePlayResult>
}

let current: NativePlayer | null = null

/** Called by the TV app at startup. */
export function setNativePlayer(player: NativePlayer | null): void {
  current = player
}

export function nativePlayer(): NativePlayer | null {
  return current
}

function vttTime(seconds: number): string {
  const ms = Math.max(0, Math.round(seconds * 1000))
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  const s = Math.floor((ms % 60_000) / 1000)
  const pad = (n: number, w = 2) => String(n).padStart(w, '0')
  return `${pad(h)}:${pad(m)}:${pad(s)}.${pad(ms % 1000, 3)}`
}

function escapeVtt(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Subtitle cues as a WebVTT file, shifted by `delay` seconds (positive: later). */
export function toWebVtt(track: SubtitleTrack, delay = 0): string {
  const blocks = track.cues
    .filter((cue) => cue.end + delay > 0)
    .map((cue) => {
      const text = cue.lines.map((line) => line.map((seg) => (seg.italic ? `<i>${escapeVtt(seg.text)}</i>` : escapeVtt(seg.text))).join('')).join('\n')
      return `${vttTime(cue.start + delay)} --> ${vttTime(cue.end + delay)}${cue.top ? ' line:10%' : ''}\n${text}`
    })
  return `WEBVTT\n\n${blocks.join('\n\n')}\n`
}
