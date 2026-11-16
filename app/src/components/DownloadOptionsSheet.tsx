import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle2, ChevronRight, Loader2, Magnet, Smartphone, Zap } from 'lucide-react'
import { DownloadSheet } from '@/components/downloads/DownloadSheet'
import { formatBytes } from '@/lib/debridApi'
import { useSettings } from '@app/lib/settings'
import { isDesktop } from '@app/native/platform'
import { useDownloadAction, type DownloadTarget } from '@app/downloads/useDownloadAction'
import { Sheet } from './Sheet'

/**
 * Two ways to download, like the website plus one:
 * - to this device, for offline viewing (Premium: a Real-Debrid file);
 * - magnet links and subtitles for a torrent app (free, the website's sheet).
 */
export function DownloadOptionsSheet({
  target,
  onClose,
}: {
  target: DownloadTarget | null
  onClose: () => void
}) {
  const navigate = useNavigate()
  const { downloadQuality } = useSettings()
  const action = useDownloadAction()
  const [torrentOpen, setTorrentOpen] = useState(false)
  const record = target ? action.recordFor(target) : undefined
  const resolving = target ? action.isResolving(target) : false
  const label = target?.mediaType === 'tv' ? `S${target.season} · E${target.episode}${target.episodeName ? ` · ${target.episodeName}` : ''}` : undefined

  return (
    <>
      <Sheet open={!!target && !torrentOpen} onOpenChange={(open) => !open && onClose()} title={`Download ${target?.title ?? ''}`} description={label}>
        <div className="flex flex-col gap-2.5">
          {action.available && (
            <div className="surface rounded-2xl p-4">
              <div className="mb-3 flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-white">
                  <Smartphone className="h-[18px] w-[18px]" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-semibold">Save to this {isDesktop ? 'computer' : 'phone'}</p>
                  <p className="text-[11.5px] text-white/50">Watch offline in the app · prefers {downloadQuality}</p>
                </div>
              </div>
              {record?.status === 'done' ? (
                <button
                  onClick={() => {
                    onClose()
                    navigate(`/offline/${encodeURIComponent(record.id)}`)
                  }}
                  className="press flex w-full items-center justify-center gap-2 rounded-full bg-white/10 py-3 text-[13.5px] font-bold"
                >
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" /> Downloaded · Play offline
                </button>
              ) : record && record.status !== 'failed' ? (
                <button
                  onClick={() => {
                    onClose()
                    navigate('/downloads')
                  }}
                  className="press flex w-full items-center justify-center gap-2 rounded-full bg-white/10 py-3 text-[13.5px] font-bold"
                >
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Downloading {record.total > 0 ? `${Math.round((record.bytes / record.total) * 100)}%` : '…'} · {formatBytes(record.total)}
                </button>
              ) : action.premium ? (
                <button
                  onClick={async () => {
                    if (!target) return
                    const started = await action.start(target)
                    if (started) onClose()
                  }}
                  disabled={resolving}
                  className="press flex w-full items-center justify-center gap-2 rounded-full bg-white py-3 text-[14px] font-bold text-black disabled:opacity-70"
                >
                  {resolving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                  {resolving ? 'Finding the best file…' : 'Download'}
                </button>
              ) : (
                <button
                  onClick={() => {
                    onClose()
                    navigate('/premium')
                  }}
                  className="press flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-amber-300 to-amber-500 py-3 text-[13.5px] font-bold text-black"
                >
                  <Zap className="h-4 w-4" /> Offline downloads come with Premium
                </button>
              )}
            </div>
          )}

          <button
            onClick={() => setTorrentOpen(true)}
            className="surface press flex items-center gap-3 rounded-2xl p-4 text-left transition-colors hover:bg-white/[0.06]"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/[0.07] text-white/80">
              <Magnet className="h-[18px] w-[18px]" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[14px] font-semibold">Magnet links & subtitles</span>
              <span className="block text-[11.5px] text-white/50">Free · opens in your torrent app</span>
            </span>
            <ChevronRight className="h-4 w-4 text-white/40" />
          </button>
        </div>
      </Sheet>

      <DownloadSheet
        target={torrentOpen && target ? { title: target.title, year: target.year, imdbId: target.imdbId, tmdbId: target.tmdbId, mediaType: target.mediaType, season: target.season, episode: target.episode, label } : null}
        onOpenChange={(open) => {
          if (!open) {
            setTorrentOpen(false)
            onClose()
          }
        }}
      />
    </>
  )
}
