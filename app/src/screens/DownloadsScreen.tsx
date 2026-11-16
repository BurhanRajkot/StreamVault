import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { AlertCircle, CheckCircle2, Download, ExternalLink, FolderOpen, Info, Pause, Play, Trash2, Zap } from 'lucide-react'
import { formatBytes } from '@/lib/debridApi'
import { usePremiumAccess } from '@/hooks/usePremiumAccess'
import { cn } from '@/lib/utils'
import { desktop, isAndroid, isNativeApp, SvNative } from '@app/native/platform'
import { removeDownload, useDownloads, type DownloadRecord } from '@app/downloads/store'
import { Sheet } from '@app/components/Sheet'
import { EmptyState, PageHeader } from '@app/components/PageHeader'
import { Button, ButtonLink, IconTile, ListRow, ListSection } from '@app/components/kit'
import { ProgressRing } from './TitleScreen'

export function DownloadsScreen() {
  const downloads = useDownloads()
  const { premium } = usePremiumAccess()
  const navigate = useNavigate()
  const [editing, setEditing] = useState<DownloadRecord | null>(null)
  const { data: free } = useQuery({
    queryKey: ['free-space'],
    queryFn: async () => (isAndroid ? (await SvNative.freeSpace()).bytes : desktop ? (await desktop.freeSpace()).bytes : 0),
    enabled: isNativeApp,
    staleTime: 30_000,
  })
  const used = downloads.filter((d) => d.status === 'done').reduce((sum, d) => sum + (d.total || 0), 0)

  // One group per title, episodes under their show
  const groups = new Map<string, DownloadRecord[]>()
  for (const d of downloads) {
    const key = `${d.mediaType}:${d.tmdbId}`
    groups.set(key, [...(groups.get(key) ?? []), d])
  }

  const usedShare = free ? Math.max(1.5, Math.min(100, (used / (used + free)) * 100)) : 0

  return (
    <div className="mx-auto max-w-3xl px-4 pb-tabbar pt-page lg:px-8">
      <PageHeader title="Downloads" subtitle={downloads.length > 0 ? 'Saved to this device — they play with no connection.' : undefined} />

      {!isNativeApp && (
        <ListSection>
          <ListRow
            icon={
              <IconTile color="gray">
                <Info />
              </IconTile>
            }
            label="Downloads live in the apps"
            detail="Offline downloads work in the Android, Linux and Windows apps."
          />
        </ListSection>
      )}

      {downloads.length === 0 ? (
        <EmptyState
          icon={<Download />}
          title="Watch without the internet"
          text="Save movies and episodes to this device and watch them with no connection."
          action={
            premium ? (
              <Button variant="tinted" onClick={() => navigate('/')}>
                Find Something to Download
              </Button>
            ) : (
              <ButtonLink to="/premium" variant="gray">
                <Zap className="fill-ios-yellow text-ios-yellow" /> Downloads Come with Premium
              </ButtonLink>
            )
          }
        />
      ) : (
        <>
          {isNativeApp && (
            <ListSection header="Storage">
              <div className="px-4 py-3.5">
                <div className="flex h-[6px] overflow-hidden rounded-full bg-fill">
                  <motion.div className="h-full rounded-full bg-tint" initial={{ width: 0 }} animate={{ width: `${usedShare}%` }} transition={{ duration: 0.8, ease: 'easeOut' }} />
                </div>
                <p className="t-footnote mt-2 flex justify-between gap-3 text-label-2">
                  <span>StreamVault · {formatBytes(used)}</span>
                  {free ? <span>{formatBytes(free)} available</span> : null}
                </p>
              </div>
            </ListSection>
          )}
          <ListSection header={`${downloads.length} item${downloads.length === 1 ? '' : 's'}`}>
            {[...groups.values()].flatMap((items) => items).map((d) => (
              <DownloadRow key={d.id} record={d} onPlay={() => navigate(`/offline/${encodeURIComponent(d.id)}`)} onMore={() => setEditing(d)} />
            ))}
          </ListSection>
        </>
      )}

      <Sheet open={!!editing} onOpenChange={(open) => !open && setEditing(null)} title={editing?.title ?? ''} description={editing?.fileName}>
        {editing && (
          <div className="flex flex-col gap-6">
            <ListSection className="mb-0">
              {editing.status === 'done' && (
                <ListRow
                  onClick={() => {
                    navigate(`/offline/${encodeURIComponent(editing.id)}`)
                    setEditing(null)
                  }}
                  icon={
                    <IconTile color="blue">
                      <Play className="fill-current" />
                    </IconTile>
                  }
                  label="Play"
                  accessory="none"
                />
              )}
              <ListRow
                onClick={() => {
                  navigate(`/title/${editing.mediaType}/${editing.tmdbId}`)
                  setEditing(null)
                }}
                icon={
                  <IconTile color="graphite">
                    <ExternalLink />
                  </IconTile>
                }
                label="Go to Title"
              />
              {desktop && editing.status === 'done' && (
                <ListRow
                  onClick={() => void desktop!.showInFolder(editing.path)}
                  icon={
                    <IconTile color="graphite">
                      <FolderOpen />
                    </IconTile>
                  }
                  label="Show in Folder"
                  accessory="none"
                />
              )}
            </ListSection>
            <ListSection className="mb-0">
              <ListRow
                onClick={() => {
                  void removeDownload(editing.id)
                  setEditing(null)
                }}
                icon={
                  <IconTile color="red">
                    <Trash2 />
                  </IconTile>
                }
                label={editing.status === 'done' ? 'Delete Download' : 'Cancel Download'}
                destructive
                accessory="none"
              />
            </ListSection>
          </div>
        )}
      </Sheet>
    </div>
  )
}

function DownloadRow({ record, onPlay, onMore }: { record: DownloadRecord; onPlay: () => void; onMore: () => void }) {
  const percent = record.total > 0 ? record.bytes / record.total : 0
  const done = record.status === 'done'
  return (
    <div className="cell-sep-inset tap relative flex items-center gap-3 px-3 py-2.5" style={{ '--sep-inset': '124px' } as React.CSSProperties}>
      <button type="button" onClick={done ? onPlay : onMore} className="press relative w-[100px] shrink-0 overflow-hidden rounded-[6px] bg-fill" aria-label={done ? `Play ${record.title}` : record.title}>
        {record.poster ? <img src={record.poster} alt="" className="aspect-video w-full object-cover object-[center_20%]" /> : <div className="aspect-video w-full" />}
        {done && (
          <span className="absolute inset-0 flex items-center justify-center bg-black/25">
            <Play className="h-5 w-5 fill-white text-white drop-shadow" />
          </span>
        )}
      </button>
      <button type="button" onClick={onMore} className="min-w-0 flex-1 text-left">
        <p className="t-subhead truncate font-semibold">{record.title}</p>
        {record.mediaType === 'tv' && (
          <p className="t-footnote truncate text-white/80">
            S{record.season}, E{record.episode}
            {record.episodeName ? ` · ${record.episodeName}` : ''}
          </p>
        )}
        <p className={cn('t-footnote mt-0.5 truncate', record.status === 'failed' ? 'text-ios-red' : 'text-label-2')}>
          {done
            ? [record.quality, formatBytes(record.total)].filter(Boolean).join(' · ')
            : record.status === 'failed'
              ? record.error ?? 'Failed'
              : record.status === 'paused'
                ? `Paused${record.error ? ` · ${record.error}` : ''}`
                : `${formatBytes(record.bytes)} of ${formatBytes(record.total)}`}
        </p>
        {!done && record.status !== 'failed' && (
          <span className="mt-1.5 block h-[4px] overflow-hidden rounded-full bg-fill">
            <motion.span className="block h-full rounded-full bg-tint" animate={{ width: `${Math.round(percent * 100)}%` }} transition={{ ease: 'easeOut' }} />
          </span>
        )}
      </button>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center">
        {done ? (
          <CheckCircle2 className="h-5 w-5 text-ios-green" />
        ) : record.status === 'failed' ? (
          <AlertCircle className="h-5 w-5 text-ios-red" />
        ) : record.status === 'paused' ? (
          <Pause className="h-5 w-5 fill-current text-label-2" />
        ) : (
          <ProgressRing value={percent} size={24} />
        )}
      </span>
    </div>
  )
}
