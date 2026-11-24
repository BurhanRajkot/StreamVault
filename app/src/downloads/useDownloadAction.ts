import { useState } from 'react'
import { toast } from 'sonner'
import { useDebridToken } from '@/hooks/useDebridToken'
import { usePremiumAccess } from '@/hooks/usePremiumAccess'
import { getSettings } from '@app/lib/settings'
import { resolvePremiumFile } from './premiumFile'
import { canDownloadOffline, findDownload, startDownload, useDownloads, type DownloadMeta, type DownloadRecord } from './store'

export interface DownloadTarget extends DownloadMeta {
  imdbId?: string | null
  year?: string
  /** The audio language wanted (lib/audioLanguage). */
  audioLang?: string
}

/**
 * Start (or report on) an offline download for a movie or an episode:
 * Premium finds a file, Real-Debrid hands back a direct link, the OS
 * downloader fetches it.
 */
export function useDownloadAction() {
  useDownloads() // re-render as progress arrives
  const getToken = useDebridToken()
  const { premium, downloads: downloadsAllowed } = usePremiumAccess()
  const [resolving, setResolving] = useState<string | null>(null)

  const keyOf = (t: { tmdbId: number; season?: number; episode?: number }) => `${t.tmdbId}:${t.season ?? ''}:${t.episode ?? ''}`

  const start = async (target: DownloadTarget): Promise<DownloadRecord | null> => {
    // The sheet doesn't offer it then; and the backend refuses it anyway.
    if (!downloadsAllowed) {
      toast.error("Downloads aren't enabled for your account")
      return null
    }
    const key = keyOf(target)
    setResolving(key)
    try {
      const token = await getToken()
      const file = await resolvePremiumFile(
        {
          title: target.title,
          year: target.year,
          imdbId: target.imdbId,
          mediaType: target.mediaType,
          season: target.season,
          episode: target.episode,
          audioLang: target.audioLang,
        },
        token,
        getSettings().downloadQuality
      )
      const record = await startDownload(target, file)
      toast.success('Downloading', { description: `${target.title}${target.mediaType === 'tv' ? ` · S${target.season} E${target.episode}` : ''} — ${file.quality}` })
      return record
    } catch (err) {
      toast.error("Couldn't start the download", { description: err instanceof Error ? err.message : String(err) })
      return null
    } finally {
      setResolving(null)
    }
  }

  return {
    available: canDownloadOffline,
    premium,
    /** The admin allows this account to save Premium's file. Always true for the admin. */
    downloadsAllowed,
    start,
    isResolving: (t: { tmdbId: number; season?: number; episode?: number }) => resolving === keyOf(t),
    recordFor: (t: { tmdbId: number; mediaType: 'movie' | 'tv'; season?: number; episode?: number }) => findDownload(t),
  }
}
