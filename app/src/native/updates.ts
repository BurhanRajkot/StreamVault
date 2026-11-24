import { useQuery } from '@tanstack/react-query'
import { APP_VERSION, desktop, isAndroid, isWindows } from './platform'

/** Where releases are published (the workflow in .github/workflows/app-release.yml). */
export const GITHUB_REPO = 'BurhanRajkot/StreamVault'
export const RELEASES_PAGE = `https://github.com/${GITHUB_REPO}/releases`
/** App releases are tagged app-v1.2.3 so they never mix with anything else in the repo. */
const TAG_PREFIX = 'app-v'

/**
 * The release mirror on Supabase Storage (app/scripts/mirror-release.sh):
 * GitHub's release CDN crawls on some ISPs (12–36 KB/s measured), Supabase's
 * Cloudflare-fronted storage doesn't. GitHub stays the fallback.
 */
export const MIRROR_BASE = 'https://xpickztkltapgelrsdts.supabase.co/storage/v1/object/public/app-releases'

export interface AppRelease {
  version: string
  notes: string
  publishedAt: string
  pageUrl: string
  /** The download for this device — the APK on Android, the AppImage on Linux, the installer on Windows. */
  assetUrl: string | null
  assetSize: number | null
  /** The AppImage and the Windows installer come from the mirror in parts, joined in order. */
  assetParts?: string[]
  /** SHA-256 of the whole file, when the mirror published one. */
  assetSha256?: string
}

interface MirrorManifest {
  version: string
  publishedAt: string
  page: string
  android?: { url: string; size: number; sha256: string }
  linux?: { appimage?: MirrorFile }
  windows?: { installer?: MirrorFile }
}

/** A file the mirror keeps in parts (its storage refuses files over 50 MiB). */
interface MirrorFile {
  parts: string[]
  size: number
  sha256: string
}

interface GithubRelease {
  tag_name: string
  name: string | null
  body: string | null
  draft: boolean
  prerelease: boolean
  published_at: string
  html_url: string
  /** `digest` is "sha256:<hex>" on every asset GitHub has hashed. */
  assets: { name: string; browser_download_url: string; size: number; digest?: string | null }[]
}

/** Compare dotted versions numerically: 1.0.10 is newer than 1.0.9. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0)
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

function pickAsset(assets: GithubRelease['assets']): GithubRelease['assets'][number] | undefined {
  if (isAndroid) return assets.find((a) => a.name.endsWith('.apk'))
  if (isWindows) return assets.find((a) => a.name.endsWith('.exe'))
  if (desktop) return assets.find((a) => a.name.endsWith('.AppImage'))
  return undefined
}

/** The mirror's latest.json — fast, and no GitHub API rate limit. */
async function fetchFromMirror(): Promise<AppRelease | null> {
  // An hourly query string keeps the check fresh past any CDN copy
  const res = await fetch(`${MIRROR_BASE}/latest.json?h=${Math.floor(Date.now() / 3_600_000)}`)
  if (!res.ok) throw new Error(`mirror answered ${res.status}`)
  const m = (await res.json()) as MirrorManifest
  const parted = isWindows ? m.windows?.installer : desktop ? m.linux?.appimage : undefined
  const base = { version: m.version, notes: '', publishedAt: m.publishedAt, pageUrl: m.page }
  if (isAndroid && m.android) return { ...base, assetUrl: m.android.url, assetSize: m.android.size, assetSha256: m.android.sha256 }
  if (parted) return { ...base, assetUrl: parted.parts[0], assetParts: parted.parts, assetSize: parted.size, assetSha256: parted.sha256 }
  return { ...base, assetUrl: null, assetSize: null }
}

export async function fetchLatestRelease(): Promise<AppRelease | null> {
  try {
    return await fetchFromMirror()
  } catch {
    return fetchFromGithub()
  }
}

async function fetchFromGithub(): Promise<AppRelease | null> {
  const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases?per_page=30`, {
    headers: { Accept: 'application/vnd.github+json' },
  })
  if (!res.ok) throw new Error(`GitHub answered ${res.status}`)
  const releases = (await res.json()) as GithubRelease[]
  const latest = releases
    .filter((r) => !r.draft && !r.prerelease && r.tag_name.startsWith(TAG_PREFIX))
    .map((r) => ({ release: r, version: r.tag_name.slice(TAG_PREFIX.length) }))
    .sort((a, b) => compareVersions(b.version, a.version))[0]
  if (!latest) return null
  const asset = pickAsset(latest.release.assets)
  return {
    version: latest.version,
    notes: latest.release.body ?? '',
    publishedAt: latest.release.published_at,
    pageUrl: latest.release.html_url,
    assetUrl: asset?.browser_download_url ?? null,
    assetSize: asset?.size ?? null,
    assetSha256: asset?.digest?.startsWith('sha256:') ? asset.digest.slice('sha256:'.length) : undefined,
  }
}

/**
 * The newest release on GitHub when it's newer than this build, else null.
 * Asked on launch and every few hours after; GitHub allows 60 unauthenticated
 * calls an hour per address, so this stays far inside it.
 */
export function useAvailableUpdate(): { update: AppRelease | null; latest: AppRelease | null; checking: boolean; refetch: () => void } {
  const { data, isFetching, refetch } = useQuery({
    queryKey: ['app-update'],
    queryFn: fetchLatestRelease,
    staleTime: 3 * 60 * 60 * 1000,
    refetchInterval: 6 * 60 * 60 * 1000,
    retry: 1,
  })
  const latest = data ?? null
  const update = latest && compareVersions(latest.version, APP_VERSION) > 0 ? latest : null
  return { update, latest, checking: isFetching, refetch: () => void refetch() }
}
