import { DebridRequestError, playDebridRelease, parseTorrentQuality, type DebridRelease } from '@/lib/debridApi'
import { detectBrowserVideoSupport, rankReleasesForPlayback } from '@/lib/releasePlayback'
import { findPremiumReleases, type PremiumSearchTarget } from '@/lib/premiumSearch'
import { releaseLanguageRank } from '@/lib/audioLanguage'

/** What the downloader fetches: a Real-Debrid direct link to one video file. */
export interface PremiumFile {
  url: string
  fileName: string
  size: number
  quality: string
}

export type QualityPreference = '4K' | '1080p' | '720p'

/** Releases tried before giving up — each one is a Real-Debrid round trip. */
const MAX_ATTEMPTS = 4

const QUALITY_ORDER: Record<QualityPreference, string[]> = {
  '4K': ['4K', '1080p', '720p', 'SD', '480p'],
  '1080p': ['1080p', '720p', '4K', 'SD', '480p'],
  '720p': ['720p', '1080p', '480p', 'SD', '4K'],
}

/**
 * Find a file for offline viewing: the Premium search, ranked the way the
 * player ranks it (files the app's video element decodes first, so an
 * offline copy plays without a converter), reordered by the viewer's
 * quality preference, then started on Real-Debrid instant-only — a release
 * that isn't cached would mean waiting for a torrent, which a download
 * button shouldn't do silently.
 */
export async function resolvePremiumFile(
  target: PremiumSearchTarget,
  token: string | undefined,
  preference: QualityPreference
): Promise<PremiumFile> {
  const releases = await findPremiumReleases(target, token)
  if (releases.length === 0) throw new Error('No releases found for this title.')

  const lang = target.audioLang ?? 'en'
  const base = target.audioBase ?? 'en'
  const ranked = rankReleasesForPlayback(releases, detectBrowserVideoSupport(), { audioLang: lang, audioBase: base })
  const order = QUALITY_ORDER[preference]
  // The language first (an offline copy plays its first track), then the quality asked for
  const byPreference = [...ranked].sort(
    (a, b) =>
      releaseLanguageRank(a, lang, base) - releaseLanguageRank(b, lang, base) ||
      order.indexOf(parseTorrentQuality(a.name)) - order.indexOf(parseTorrentQuality(b.name))
  )
  const candidates: DebridRelease[] = byPreference.filter((r) => r.cached)
  if (candidates.length === 0) throw new Error('Nothing is ready to download instantly. Stream it on Premium, or try again later.')

  let lastError = 'Real-Debrid could not start any release.'
  for (const release of candidates.slice(0, MAX_ATTEMPTS)) {
    try {
      const result = await playDebridRelease(release, token, {
        season: target.mediaType === 'tv' ? target.season : undefined,
        episode: target.mediaType === 'tv' ? target.episode : undefined,
        instantOnly: true,
        purpose: 'download',
      })
      if (result.status === 'ready') {
        return {
          url: result.directUrl,
          fileName: result.fileName,
          size: result.fileSize,
          quality: parseTorrentQuality(release.name),
        }
      }
      if (result.status === 'failed') lastError = result.reason
    } catch (err) {
      // Access refused won't get better with the next release
      if (err instanceof DebridRequestError && (err.status === 401 || err.status === 403)) throw err
      lastError = err instanceof Error ? err.message : String(err)
    }
  }
  throw new Error(lastError)
}
