import { useSyncExternalStore } from 'react'
import { desktop, isAndroid, SvNative, type NativeTransfer } from '@app/native/platform'
import { getSettings } from '@app/lib/settings'
import type { PremiumFile } from './premiumFile'

/** One title (or episode) saved for offline viewing. */
export interface DownloadRecord {
  id: string
  /** The OS downloader's id for the transfer. */
  transferId: string
  /** Where the file lands on disk. */
  path: string
  fileName: string
  tmdbId: number
  mediaType: 'movie' | 'tv'
  title: string
  season?: number
  episode?: number
  episodeName?: string
  /** Poster as a data URL, so the list has art without a connection. */
  poster?: string
  quality?: string
  status: 'downloading' | 'paused' | 'done' | 'failed'
  bytes: number
  total: number
  createdAt: number
  error?: string
}

export interface DownloadMeta {
  tmdbId: number
  mediaType: 'movie' | 'tv'
  title: string
  season?: number
  episode?: number
  episodeName?: string
  posterUrl?: string | null
}

const KEY = 'sv-app:downloads'

function load(): DownloadRecord[] {
  try {
    const raw = localStorage.getItem(KEY)
    const parsed = raw ? (JSON.parse(raw) as DownloadRecord[]) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

let records = load()
const listeners = new Set<() => void>()

function commit(next: DownloadRecord[]): void {
  records = next
  try {
    localStorage.setItem(KEY, JSON.stringify(records))
  } catch {
    // Quota: posters are the big part — drop them rather than lose the list
    try {
      localStorage.setItem(KEY, JSON.stringify(records.map(({ poster: _poster, ...r }) => r)))
    } catch {
      /* the in-memory list still works this session */
    }
  }
  listeners.forEach((fn) => fn())
  schedulePoll()
}

export function useDownloads(): DownloadRecord[] {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn)
      schedulePoll()
      return () => listeners.delete(fn)
    },
    () => records
  )
}

export function getDownloads(): DownloadRecord[] {
  return records
}

/** Whether downloading to the device works here at all (the website can't). */
export const canDownloadOffline = isAndroid || !!desktop

export function downloadKey(meta: { tmdbId: number; mediaType: string; season?: number; episode?: number }): string {
  return meta.mediaType === 'tv' ? `tv:${meta.tmdbId}:${meta.season}:${meta.episode}` : `movie:${meta.tmdbId}`
}

export function findDownload(meta: { tmdbId: number; mediaType: string; season?: number; episode?: number }): DownloadRecord | undefined {
  const key = downloadKey(meta)
  return records.find((r) => downloadKey(r) === key)
}

async function posterDataUrl(url: string | null | undefined): Promise<string | undefined> {
  if (!url) return undefined
  try {
    const res = await fetch(url)
    if (!res.ok) return undefined
    const blob = await res.blob()
    return await new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : undefined)
      reader.onerror = () => resolve(undefined)
      reader.readAsDataURL(blob)
    })
  } catch {
    return undefined
  }
}

/** File names the OS will accept, keeping the real extension. */
function safeFileName(meta: DownloadMeta, file: PremiumFile): string {
  const ext = /\.[a-z0-9]{2,4}$/i.exec(file.fileName)?.[0] ?? '.mkv'
  const base = meta.mediaType === 'tv'
    ? `${meta.title} S${String(meta.season).padStart(2, '0')}E${String(meta.episode).padStart(2, '0')}`
    : meta.title
  return `${base.replace(/[^\w\s.-]+/g, '').replace(/\s+/g, ' ').trim().slice(0, 80) || 'video'} [${file.quality}]${ext}`
}

export async function startDownload(meta: DownloadMeta, file: PremiumFile): Promise<DownloadRecord> {
  const existing = findDownload(meta)
  if (existing && existing.status !== 'failed') return existing
  if (existing) await removeDownload(existing.id)

  const fileName = safeFileName(meta, file)
  const label = meta.mediaType === 'tv' ? `${meta.title} · S${meta.season} E${meta.episode}` : meta.title
  const started = isAndroid
    ? await SvNative.enqueue({ url: file.url, fileName, title: label, description: 'StreamVault download', wifiOnly: getSettings().wifiOnly })
    : await desktop!.download({ url: file.url, fileName, title: label })

  const record: DownloadRecord = {
    id: `${downloadKey(meta)}:${Date.now()}`,
    transferId: started.id,
    path: started.path,
    fileName,
    tmdbId: meta.tmdbId,
    mediaType: meta.mediaType,
    title: meta.title,
    season: meta.season,
    episode: meta.episode,
    episodeName: meta.episodeName,
    quality: file.quality,
    status: 'downloading',
    bytes: 0,
    total: file.size,
    createdAt: Date.now(),
  }
  commit([record, ...records])
  // Art is fetched after the transfer is queued — it never holds the download up
  void posterDataUrl(meta.posterUrl).then((poster) => {
    if (poster) commit(records.map((r) => (r.id === record.id ? { ...r, poster } : r)))
  })
  return record
}

export async function removeDownload(id: string): Promise<void> {
  const record = records.find((r) => r.id === id)
  if (!record) return
  commit(records.filter((r) => r.id !== id))
  try {
    if (isAndroid) await SvNative.remove({ id: record.transferId, path: record.path })
    else await desktop?.remove({ id: record.transferId, path: record.path })
  } catch {
    // Already gone from disk
  }
}

/** A URL the app's video element can play (and seek) the downloaded file from. */
export async function playableUrl(record: DownloadRecord): Promise<string> {
  if (isAndroid) return (await SvNative.serve({ path: record.path })).url
  if (desktop) return (await desktop.serve(record.path)).url
  throw new Error('Offline playback needs the app')
}

export async function openWithOtherApp(record: DownloadRecord): Promise<void> {
  if (isAndroid) return SvNative.openWith({ path: record.path })
  if (desktop) return desktop.openWith(record.path)
}

// ── Progress polling ────────────────────────────────────────────────────────
// Only while something is downloading and someone is listening.

let pollTimer: ReturnType<typeof setTimeout> | null = null

function schedulePoll(): void {
  if (pollTimer || listeners.size === 0) return
  if (!records.some((r) => r.status === 'downloading' || r.status === 'paused')) return
  pollTimer = setTimeout(() => {
    pollTimer = null
    void poll().finally(schedulePoll)
  }, 1500)
}

function applyTransfer(record: DownloadRecord, t: NativeTransfer | undefined): DownloadRecord {
  if (!t) return { ...record, status: 'failed', error: 'The download was cancelled.' }
  const status: DownloadRecord['status'] =
    t.status === 'done' ? 'done' : t.status === 'failed' ? 'failed' : t.status === 'paused' ? 'paused' : 'downloading'
  return {
    ...record,
    status,
    bytes: t.bytes,
    total: t.total > 0 ? t.total : record.total,
    error: status === 'failed' ? t.reason || 'The download failed.' : status === 'paused' ? t.reason : undefined,
  }
}

async function poll(): Promise<void> {
  const active = records.filter((r) => r.status === 'downloading' || r.status === 'paused')
  if (active.length === 0) return
  try {
    const ids = active.map((r) => r.transferId)
    const items = isAndroid ? (await SvNative.status({ ids })).items : await desktop!.status(ids)
    const byId = new Map(items.map((t) => [t.id, t]))
    const changed = records.map((r) => (active.includes(r) ? applyTransfer(r, byId.get(r.transferId)) : r))
    if (JSON.stringify(changed) !== JSON.stringify(records)) commit(changed)
  } catch {
    // The bridge hiccuped; try again on the next tick
  }
}
