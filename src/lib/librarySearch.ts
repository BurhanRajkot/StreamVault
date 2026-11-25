import { getAdminToken } from './api'
import type { DebridRelease } from './debridApi'
import type { PremiumReleaseSource } from './premiumSearch'

/*
 * Admin-only keyword search over the files in the Real-Debrid account
 * (GET /debrid/library-search). A hit plays through the ordinary Premium
 * player: its source is just "this torrent, this file", already in the account.
 */

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000'

export interface LibraryHit {
  torrentId: string
  hash: string
  torrentName: string
  added: string
  /** The matching file; null when only the torrent's name matched (its largest video plays) */
  file: { id: number; path: string; name: string; bytes: number; video: boolean } | null
}

export interface LibrarySearchResponse {
  results: LibraryHit[]
  torrents: number
  indexed: number
  indexing: boolean
}

export async function searchLibraryFiles(q: string, signal?: AbortSignal): Promise<LibrarySearchResponse> {
  const token = getAdminToken()
  if (!token) throw new Error('Sign in as admin to search your files.')
  const res = await fetch(`${API_BASE}/debrid/library-search?${new URLSearchParams({ q, limit: '80' })}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal,
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    throw new Error(body?.error ?? `Search failed (${res.status})`)
  }
  return (await res.json()) as LibrarySearchResponse
}

/** What the player is told to play for a hit: the one release, flagged cached, with the file to pick. */
function releaseOf(hit: LibraryHit): DebridRelease {
  return {
    id: `${hit.torrentId}:${hit.file?.id ?? 0}`,
    name: hit.torrentName,
    info_hash: hit.hash.toUpperCase(),
    seeders: '0',
    leechers: '0',
    size: String(hit.file?.bytes ?? 0),
    num_files: '1',
    username: '',
    added: hit.added,
    category: '',
    cached: true,
    file_name: hit.file?.name,
    // Real-Debrid's file ids are 1-based; the player's fileIdx is 0-based
    file_idx: hit.file ? hit.file.id - 1 : undefined,
  }
}

export function libraryReleaseSource(hit: LibraryHit): PremiumReleaseSource {
  return {
    key: `library:${hit.torrentId}:${hit.file?.id ?? 0}`,
    probeUnseeded: true,
    notFoundMessage: "This file isn't in your Real-Debrid account any more.",
    find: async () => [releaseOf(hit)],
  }
}

/** The player's address for a hit — the hit travels in the query, so a refresh keeps playing it. */
export function libraryPlayPath(hit: LibraryHit): string {
  const params = new URLSearchParams({ torrent: hit.torrentId, name: hit.torrentName, added: hit.added })
  if (hit.file) {
    params.set('file', String(hit.file.id))
    params.set('fileName', hit.file.name)
    params.set('bytes', String(hit.file.bytes))
  }
  return `/watch/file/${hit.hash}?${params}`
}

/** The hit a player address stands for, or null when it is malformed. */
export function libraryHitFromPath(hash: string | undefined, search: string): LibraryHit | null {
  if (!hash || !/^[a-fA-F0-9]{40}$/.test(hash)) return null
  const q = new URLSearchParams(search)
  const torrentId = q.get('torrent')
  const torrentName = q.get('name')
  if (!torrentId || !torrentName) return null
  const fileId = Number(q.get('file'))
  const fileName = q.get('fileName')
  return {
    torrentId,
    hash,
    torrentName,
    added: q.get('added') ?? '',
    file: Number.isInteger(fileId) && fileId > 0 && fileName ? { id: fileId, path: fileName, name: fileName, bytes: Number(q.get('bytes')) || 0, video: true } : null,
  }
}
