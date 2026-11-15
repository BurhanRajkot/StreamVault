import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ExternalLink } from 'lucide-react'
import { readResumePosition, resumeKey, saveResumePosition } from '@/lib/playbackPosition'
import { setPlaybackMode } from '@app/native/platform'
import { getDownloads, openWithOtherApp, playableUrl } from '@app/downloads/store'

/**
 * A downloaded file, played with no connection: the app's video element
 * over a local URL that answers range requests, so seeking works. Files the
 * web view can't decode (some MKV/HEVC releases) open in another player.
 */
export function OfflinePlayerScreen() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const record = getDownloads().find((r) => r.id === decodeURIComponent(id))
  const videoRef = useRef<HTMLVideoElement>(null)
  const [src, setSrc] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [chrome, setChrome] = useState(true)
  const key = record ? resumeKey(`offline:${record.tmdbId}:${record.mediaType}`, record.season, record.episode) : ''

  useEffect(() => {
    void setPlaybackMode(true)
    return () => void setPlaybackMode(false)
  }, [])

  useEffect(() => {
    if (!record) return
    playableUrl(record).then(setSrc, (err: unknown) => setError(err instanceof Error ? err.message : String(err)))
  }, [record])

  useEffect(() => {
    if (!chrome) return
    const timer = setTimeout(() => setChrome(false), 3500)
    return () => clearTimeout(timer)
  }, [chrome])

  const back = () => (window.history.state?.idx > 0 ? navigate(-1) : navigate('/downloads', { replace: true }))

  if (!record) {
    return (
      <div className="fixed inset-0 z-[300] flex flex-col items-center justify-center gap-3 bg-black text-center">
        <p className="text-white/70">This download is no longer on the device.</p>
        <button onClick={back} className="rounded-md bg-white px-4 py-2 text-[13px] font-semibold text-black">
          Back
        </button>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-[300] bg-black" onPointerDown={() => setChrome(true)}>
      {src && (
        <video
          ref={videoRef}
          src={src}
          className="h-full w-full"
          controls
          autoPlay
          playsInline
          controlsList="nodownload"
          onLoadedMetadata={(e) => {
            const at = readResumePosition(key)
            if (at) e.currentTarget.currentTime = at
          }}
          onTimeUpdate={(e) => {
            const v = e.currentTarget
            if (Math.floor(v.currentTime) % 5 === 0) saveResumePosition(key, v.currentTime, v.duration)
          }}
          onPause={(e) => saveResumePosition(key, e.currentTarget.currentTime, e.currentTarget.duration)}
          onError={() => setError("This file's format doesn't play in the app.")}
        />
      )}
      <div
        className={`absolute inset-x-0 top-0 flex items-center gap-2 bg-gradient-to-b from-black/80 to-transparent pb-8 pl-[max(var(--sal),8px)] pr-[max(var(--sar),8px)] pt-[max(var(--sat),6px)] transition-opacity ${chrome || error ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
      >
        <button onClick={back} aria-label="Back" className="flex h-10 w-10 items-center justify-center rounded-full text-white active:bg-white/10">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-semibold text-white">{record.title}</p>
          <p className="text-[11.5px] text-white/55">
            {record.mediaType === 'tv' ? `S${record.season} · E${record.episode} · ` : ''}Offline · {record.quality}
          </p>
        </div>
        <button
          onClick={() => void openWithOtherApp(record)}
          className="flex h-9 items-center gap-1.5 rounded-full bg-white/10 px-3 text-[12px] font-semibold text-white"
        >
          <ExternalLink className="h-4 w-4" /> Open with…
        </button>
      </div>
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-8 text-center">
          <p className="text-[14px] text-white/80">{error}</p>
          <p className="text-[12px] text-white/50">Open it in a player like VLC instead.</p>
          <button onClick={() => void openWithOtherApp(record)} className="rounded-md bg-white px-4 py-2 text-[13px] font-semibold text-black">
            Open with another app
          </button>
        </div>
      )}
    </div>
  )
}
