import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { AlertCircle, CheckCircle2, Download, ExternalLink, FolderOpen, HardDrive, Info, Pause, Play, Trash2, Zap } from 'lucide-react'
import { formatBytes } from '@/lib/debridApi'
import { usePremiumAccess } from '@/hooks/usePremiumAccess'
import { cn } from '@/lib/utils'
import { desktop, isAndroid, isNativeApp, SvNative } from '@app/native/platform'
import { removeDownload, useDownloads, type DownloadRecord } from '@app/downloads/store'
import { Sheet } from '@app/components/Sheet'
import { EmptyState, PageHeader } from '@app/components/PageHeader'
import { item, stagger } from '@app/lib/motion'
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

  return (
    <div className="mx-auto max-w-5xl px-4 pb-tabbar pt-page lg:px-12">
      <PageHeader
        title="Downloads"
        subtitle={downloads.length > 0 ? 'Saved to this device — they play with no connection.' : undefined}
        actions={
          isNativeApp && downloads.length > 0 ? (
            <div className="surface hidden min-w-[220px] rounded-2xl p-3.5 sm:block">
              <p className="mb-2 flex items-center gap-2 text-[12px] font-semibold text-white/60">
                <HardDrive className="h-4 w-4" /> Storage
              </p>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                <motion.div className="h-full rounded-full bg-primary" initial={{ width: 0 }} animate={{ width: `${free ? Math.max(2, Math.min(100, (used / (used + free)) * 100)) : 0}%` }} transition={{ duration: 1, ease: 'easeOut' }} />
              </div>
              <p className="mt-1.5 flex justify-between gap-3 text-[11px] text-white/45">
                <span>StreamVault · {formatBytes(used)}</span>
                {free ? <span>{formatBytes(free)} free</span> : null}
              </p>
            </div>
          ) : undefined
        }
      />

      {!isNativeApp && (
        <p className="surface mb-4 flex items-center gap-2.5 rounded-2xl p-4 text-[13px] text-white/65">
          <Info className="h-4 w-4 shrink-0" /> Offline downloads work in the Android and Linux apps.
        </p>
      )}

      {downloads.length === 0 ? (
        <EmptyState
          icon={<Download className="h-10 w-10 text-white" />}
          title="Watch without the internet"
          text="Save movies and episodes to this device and watch them with no connection."
          action={
            premium ? (
              <button onClick={() => navigate('/')} className="press rounded-full bg-white px-6 py-2.5 text-[14px] font-bold text-black">
                Find something to download
              </button>
            ) : (
              <Link to="/premium" className="press flex items-center gap-2 rounded-full bg-gradient-to-r from-amber-500 to-amber-300 px-6 py-2.5 text-[14px] font-bold text-black shadow-[0_10px_30px_-10px_rgb(251_191_36/0.6)]">
                <Zap className="h-4 w-4" /> Downloads come with Premium
              </Link>
            )
          }
        />
      ) : (
        <motion.ul variants={stagger(0.04)} initial="hidden" animate="show" className="grid gap-2 lg:grid-cols-2 lg:gap-3">
          {[...groups.values()].flatMap((items) => items).map((d) => (
            <motion.li key={d.id} variants={item} layout>
              <DownloadRow record={d} onPlay={() => navigate(`/offline/${encodeURIComponent(d.id)}`)} onMore={() => setEditing(d)} />
            </motion.li>
          ))}
        </motion.ul>
      )}

      <Sheet open={!!editing} onOpenChange={(open) => !open && setEditing(null)} title={editing?.title ?? ''} description={editing?.fileName}>
        {editing && (
          <div className="flex flex-col gap-2">
            {editing.status === 'done' && (
              <button
                onClick={() => {
                  navigate(`/offline/${encodeURIComponent(editing.id)}`)
                  setEditing(null)
                }}
                className="press flex items-center gap-3 rounded-2xl bg-white/[0.05] p-3.5 text-left text-[14px] font-semibold transition-colors hover:bg-white/[0.09]"
              >
                <Play className="h-5 w-5" /> Play
              </button>
            )}
            <Link
              to={`/title/${editing.mediaType}/${editing.tmdbId}`}
              onClick={() => setEditing(null)}
              className="press flex items-center gap-3 rounded-2xl bg-white/[0.05] p-3.5 text-[14px] font-semibold transition-colors hover:bg-white/[0.09]"
            >
              <ExternalLink className="h-5 w-5" /> Go to title
            </Link>
            {desktop && editing.status === 'done' && (
              <button onClick={() => void desktop!.showInFolder(editing.path)} className="press flex items-center gap-3 rounded-2xl bg-white/[0.05] p-3.5 text-left text-[14px] font-semibold transition-colors hover:bg-white/[0.09]">
                <FolderOpen className="h-5 w-5" /> Show in folder
              </button>
            )}
            <button
              onClick={() => {
                void removeDownload(editing.id)
                setEditing(null)
              }}
              className="press flex items-center gap-3 rounded-2xl bg-red-500/10 p-3.5 text-left text-[14px] font-semibold text-red-300 transition-colors hover:bg-red-500/20"
            >
              <Trash2 className="h-5 w-5" /> {editing.status === 'done' ? 'Delete download' : 'Cancel download'}
            </button>
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
    <div className="group flex items-center gap-3 rounded-2xl bg-white/[0.03] p-2 pr-3 ring-1 ring-white/[0.05] transition-colors hover:bg-white/[0.06]">
      <button onClick={done ? onPlay : onMore} className="press relative w-[128px] shrink-0 overflow-hidden rounded-xl bg-white/[0.05]">
        {record.poster ? (
          <img src={record.poster} alt="" className="aspect-video w-full object-cover object-[center_20%]" />
        ) : (
          <div className="aspect-video w-full bg-gradient-to-br from-white/10 to-white/[0.02]" />
        )}
        {done && (
          <span className="absolute inset-0 flex items-center justify-center bg-black/30">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20 ring-1 ring-white/50 backdrop-blur transition-all group-hover:scale-110 group-hover:bg-white group-hover:text-black">
              <Play className="ml-0.5 h-4 w-4 fill-current" />
            </span>
          </span>
        )}
      </button>
      <button onClick={onMore} className="min-w-0 flex-1 text-left">
        <p className="font-display truncate text-[14.5px] font-extrabold">{record.title}</p>
        {record.mediaType === 'tv' && (
          <p className="truncate text-[12px] text-white/60">
            S{record.season} · E{record.episode}
            {record.episodeName ? ` · ${record.episodeName}` : ''}
          </p>
        )}
        <p className={cn('mt-0.5 text-[11.5px]', record.status === 'failed' ? 'text-red-300' : 'text-white/45')}>
          {done
            ? `${record.quality ?? ''} · ${formatBytes(record.total)}`
            : record.status === 'failed'
              ? record.error ?? 'Failed'
              : record.status === 'paused'
                ? `Paused${record.error ? ` · ${record.error}` : ''}`
                : `${formatBytes(record.bytes)} of ${formatBytes(record.total)}`}
        </p>
        {!done && record.status !== 'failed' && (
          <span className="mt-2 block h-1 overflow-hidden rounded-full bg-white/10">
            <motion.span className="block h-full rounded-full bg-primary" animate={{ width: `${Math.round(percent * 100)}%` }} transition={{ ease: 'easeOut' }} />
          </span>
        )}
      </button>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center">
        {done ? (
          <CheckCircle2 className="h-5 w-5 text-emerald-400/80" />
        ) : record.status === 'failed' ? (
          <AlertCircle className="h-5 w-5 text-red-400" />
        ) : record.status === 'paused' ? (
          <Pause className="h-5 w-5 text-white/50" />
        ) : (
          <ProgressRing value={percent} size={26} />
        )}
      </span>
    </div>
  )
}
