import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle2, Download, Loader2, Magnet, Smartphone, Zap } from 'lucide-react'
import { DownloadSheet } from '@/components/downloads/DownloadSheet'
import { formatBytes } from '@/lib/debridApi'
import { useSettings } from '@app/lib/settings'
import { isDesktop } from '@app/native/platform'
import { useDownloadAction, type DownloadTarget } from '@app/downloads/useDownloadAction'
import { Button, IconTile, ListRow, ListSection } from './kit'
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
        <div className="flex flex-col gap-6">
          {action.available && action.downloadsAllowed && (
            <ListSection className="mb-0" footer={`Watch offline in the app. Picks ${downloadQuality} when there's a choice.`}>
              <ListRow
                icon={
                  <IconTile color="blue">
                    <Smartphone />
                  </IconTile>
                }
                label={`Save to this ${isDesktop ? 'computer' : 'phone'}`}
                detail={record?.status === 'done' ? 'Downloaded' : record && record.status !== 'failed' ? `Downloading ${record.total > 0 ? `${Math.round((record.bytes / record.total) * 100)}%` : '…'} · ${formatBytes(record.total)}` : action.premium ? 'The best file from Real-Debrid' : 'Comes with Premium'}
              />
              <div className="px-4 pb-4 pt-1">
                {record?.status === 'done' ? (
                  <Button
                    variant="gray"
                    className="w-full"
                    onClick={() => {
                      onClose()
                      navigate(`/offline/${encodeURIComponent(record.id)}`)
                    }}
                  >
                    <CheckCircle2 className="text-ios-green" /> Play Offline
                  </Button>
                ) : record && record.status !== 'failed' ? (
                  <Button
                    variant="gray"
                    className="w-full"
                    onClick={() => {
                      onClose()
                      navigate('/downloads')
                    }}
                  >
                    <Loader2 className="animate-spin" /> Show in Downloads
                  </Button>
                ) : action.premium ? (
                  <Button
                    variant="tinted"
                    className="w-full"
                    disabled={resolving}
                    onClick={async () => {
                      if (!target) return
                      const started = await action.start(target)
                      if (started) onClose()
                    }}
                  >
                    {resolving ? <Loader2 className="animate-spin" /> : <Download />}
                    {resolving ? 'Finding the best file…' : 'Download'}
                  </Button>
                ) : (
                  <Button
                    variant="gray"
                    className="w-full"
                    onClick={() => {
                      onClose()
                      navigate('/premium')
                    }}
                  >
                    <Zap className="fill-ios-yellow text-ios-yellow" /> Get Premium
                  </Button>
                )}
              </div>
            </ListSection>
          )}

          <ListSection className="mb-0" footer="Free. Opens in your torrent app.">
            <ListRow
              onClick={() => setTorrentOpen(true)}
              icon={
                <IconTile color="graphite">
                  <Magnet />
                </IconTile>
              }
              label="Magnet links & subtitles"
            />
          </ListSection>
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
