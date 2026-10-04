/**
 * VideoPlayerModal — in-app playback for one Real-Debrid file.
 *
 * Either takes an already-resolved playback (from the search tab's Play) or
 * resolves a library file itself each time it opens (Real-Debrid links are
 * short-lived). Playback runs through DebridVideo, so a file the browser
 * can't decode directly falls back to Real-Debrid's HLS transcode; the
 * direct link stays available for VLC / download if nothing works.
 */

import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { getDebridFileStreams, type DebridReadyPlayback } from '@/lib/debridApi'
import { Loader2, AlertTriangle, ExternalLink } from 'lucide-react'
import { DebridVideo } from './DebridVideo'

export type VideoPlayerSource =
  | { kind: 'playback'; playback: DebridReadyPlayback }
  | { kind: 'file'; torrentId: string; fileId: number }

interface VideoPlayerModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  source: VideoPlayerSource
  fileName: string
  token: string
}

export default function VideoPlayerModal({ open, onOpenChange, source, fileName, token }: VideoPlayerModalProps) {
  const [playback, setPlayback] = useState<DebridReadyPlayback | null>(
    source.kind === 'playback' ? source.playback : null
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [playbackFailed, setPlaybackFailed] = useState(false)

  const torrentId = source.kind === 'file' ? source.torrentId : null
  const fileId = source.kind === 'file' ? source.fileId : null
  const preloaded = source.kind === 'playback' ? source.playback : null

  useEffect(() => {
    setPlaybackFailed(false)
    setError(null)
    if (!open) return
    if (preloaded) {
      setPlayback(preloaded)
      return
    }
    if (torrentId === null || fileId === null) return

    let cancelled = false
    setPlayback(null)
    setLoading(true)

    getDebridFileStreams(torrentId, fileId, token)
      .then((res) => {
        if (cancelled) return
        if (res.status === 'ready') setPlayback(res)
        else if (res.status === 'downloading') setError(`Still downloading on Real-Debrid (${Math.round(res.progress)}%).`)
        else setError(res.status === 'failed' ? res.reason : 'This file is not available')
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load stream URL')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [open, preloaded, torrentId, fileId, token])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl overflow-hidden border-none bg-black p-0 sm:rounded-xl">
        <DialogHeader className="px-4 pt-4">
          <DialogTitle className="truncate text-sm font-medium text-white/90">{fileName}</DialogTitle>
        </DialogHeader>

        <div className="relative flex aspect-video items-center justify-center bg-black">
          {loading && (
            <div className="flex flex-col items-center gap-2 text-white/70">
              <Loader2 className="h-8 w-8 animate-spin" />
              <span className="text-sm">Fetching stream link…</span>
            </div>
          )}

          {!loading && error && (
            <div className="flex flex-col items-center gap-2 px-6 text-center text-white/80">
              <AlertTriangle className="h-8 w-8 text-amber-400" />
              <p className="text-sm">{error}</p>
            </div>
          )}

          {open && !loading && !error && playback && !playbackFailed && (
            <DebridVideo
              playback={playback}
              onExhausted={() => setPlaybackFailed(true)}
              className="h-full w-full"
            />
          )}

          {!loading && !error && playback && playbackFailed && (
            <div className="flex flex-col items-center gap-3 px-6 text-center text-white/80">
              <AlertTriangle className="h-8 w-8 text-amber-400" />
              <p className="text-sm">Your browser can&apos;t play this file inline, and Real-Debrid&apos;s stream didn&apos;t load.</p>
              <a
                href={playback.directUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Open directly / download
              </a>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
