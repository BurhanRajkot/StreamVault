/**
 * VideoPlayerModal — in-app playback for a TorBox file.
 *
 * Fetches a fresh stream URL each time it opens (TorBox links are short-lived)
 * and renders it in a native <video> element. Falls back to a direct link
 * when the browser can't decode the container/codec (common with some .mkv
 * encodes) instead of failing silently.
 */

import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { getTorboxStreamUrl } from '@/lib/torboxApi'
import { Loader2, AlertTriangle, ExternalLink } from 'lucide-react'

interface VideoPlayerModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  torrentId: number
  fileId: number
  fileName: string
  token: string
}

export default function VideoPlayerModal({
  open,
  onOpenChange,
  torrentId,
  fileId,
  fileName,
  token,
}: VideoPlayerModalProps) {
  const [url, setUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [playbackFailed, setPlaybackFailed] = useState(false)

  useEffect(() => {
    if (!open) {
      setUrl(null)
      setError(null)
      setPlaybackFailed(false)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)

    getTorboxStreamUrl(torrentId, fileId, token)
      .then(({ url }) => {
        if (!cancelled) setUrl(url)
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Could not load stream URL')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [open, torrentId, fileId, token])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl overflow-hidden border-none bg-black p-0 sm:rounded-xl">
        <DialogHeader className="px-4 pt-4">
          <DialogTitle className="truncate text-sm font-medium text-white/90">
            {fileName}
          </DialogTitle>
        </DialogHeader>

        <div className="flex aspect-video items-center justify-center bg-black">
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

          {!loading && !error && url && !playbackFailed && (
            <video
              key={url}
              src={url}
              controls
              autoPlay
              className="h-full w-full"
              onError={() => setPlaybackFailed(true)}
            >
              Your browser can&apos;t play this file inline.
            </video>
          )}

          {!loading && !error && url && playbackFailed && (
            <div className="flex flex-col items-center gap-3 px-6 text-center text-white/80">
              <AlertTriangle className="h-8 w-8 text-amber-400" />
              <p className="text-sm">
                Your browser can&apos;t play this file&apos;s format inline (common
                with some .mkv encodes).
              </p>
              <a
                href={url}
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
