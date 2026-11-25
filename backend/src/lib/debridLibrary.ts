/**
 * Keyword search over the files in the Real-Debrid account (admin only — see
 * GET /debrid/library-search).
 *
 * Real-Debrid has no search of its own. Torrent *names* come cheap — one call
 * lists the whole account — but the files inside a torrent need one call per
 * torrent, so a slow background indexer reads them, newest first, and keeps
 * what it learned for as long as the process lives. A search answers from
 * whatever is indexed so far (and says how far along the indexer is), so the
 * first searches after a restart can miss files inside older multi-file
 * torrents until the indexer catches up.
 */

import * as debrid from './debrid'
import { logger } from './logger'

/** A file inside a torrent in the account — only ones that were selected, since only those have a link. */
export interface IndexedFile {
  /** Real-Debrid's 1-based file id; Torrentio-style `fileIdx` is this minus 1 */
  id: number
  path: string
  bytes: number
}

export interface LibraryHit {
  torrentId: string
  hash: string
  torrentName: string
  added: string
  /** The matching file, or null when only the torrent's name matched and its files aren't indexed yet */
  file: { id: number; path: string; name: string; bytes: number; video: boolean } | null
}

export interface LibrarySearchResult {
  results: LibraryHit[]
  /** Finished torrents in the account */
  torrents: number
  /** How many of those have had their files read */
  indexed: number
  /** The indexer is still reading files; searching again later may find more */
  indexing: boolean
}

const MAX_TOKENS = 8
const MAX_FILES_PER_TORRENT = 10
const VIDEO_RE = /\.(mkv|mp4|m4v|avi|mov|wmv|webm|ts|m2ts|mpg|mpeg)$/i

/** Lower-case words: every run of letters/digits, so "Sex.Ten_2024-WEB" and "sex ten" meet. */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

/** The words of a search, deduped; at most MAX_TOKENS. */
export function searchTokens(query: string): string[] {
  const words = normalizeText(query).split(' ').filter(Boolean)
  return [...new Set(words)].slice(0, MAX_TOKENS)
}

function matchesAll(haystack: string, tokens: string[]): boolean {
  return tokens.length > 0 && tokens.every((t) => haystack.includes(t))
}

function baseName(path: string): string {
  const parts = path.split('/')
  return parts[parts.length - 1] || path
}

/**
 * The pure half: which torrents and files match every word. A word may land in
 * the torrent's name or the file's path (a folder name + a file name together
 * count). Newest torrents first, as Real-Debrid lists them.
 */
export function matchLibrary(
  torrents: debrid.DebridTorrent[],
  index: ReadonlyMap<string, IndexedFile[]>,
  tokens: string[],
  limit: number
): LibraryHit[] {
  const hits: LibraryHit[] = []
  for (const torrent of torrents) {
    if (hits.length >= limit) break
    if (torrent.status !== 'downloaded') continue
    const nameText = normalizeText(torrent.filename || '')
    const files = index.get(torrent.id)

    if (!files) {
      if (matchesAll(nameText, tokens)) {
        hits.push({ torrentId: torrent.id, hash: torrent.hash, torrentName: torrent.filename, added: torrent.added, file: null })
      }
      continue
    }

    const matching = files
      .filter((f) => matchesAll(`${nameText} ${normalizeText(f.path)}`, tokens))
      .sort((a, b) => Number(VIDEO_RE.test(b.path)) - Number(VIDEO_RE.test(a.path)) || b.bytes - a.bytes)
      .slice(0, MAX_FILES_PER_TORRENT)
    for (const f of matching) {
      if (hits.length >= limit) break
      hits.push({
        torrentId: torrent.id,
        hash: torrent.hash,
        torrentName: torrent.filename,
        added: torrent.added,
        file: { id: f.id, path: f.path, name: baseName(f.path), bytes: f.bytes, video: VIDEO_RE.test(f.path) },
      })
    }
  }
  return hits
}

// ---------------------------------------------------------------------------
// The account's torrent list, and the file index built from it
// ---------------------------------------------------------------------------

const LIST_TTL_MS = 45_000
/** A torrent whose files couldn't be read isn't asked again for this long. */
const RETRY_AFTER_MS = 10 * 60_000
const WORKERS = 2
/** Pause after each file-list call per worker: ~200 calls/min in all, well under Real-Debrid's 250/min, leaving room for playback. */
const PAUSE_MS = 600

let listCache: { at: number; torrents: debrid.DebridTorrent[] } | null = null
const fileIndex = new Map<string, IndexedFile[]>()
const failedAt = new Map<string, number>()
let indexerRunning = false

async function accountTorrents(): Promise<debrid.DebridTorrent[]> {
  if (listCache && Date.now() - listCache.at < LIST_TTL_MS) return listCache.torrents
  const torrents = await debrid.listTorrents(2500)
  listCache = { at: Date.now(), torrents }
  return torrents
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/** Read the files of every finished torrent not indexed yet, a few at a time, in the background. */
function startIndexer(): void {
  if (indexerRunning) return
  indexerRunning = true

  const worker = async (): Promise<void> => {
    for (;;) {
      const current = listCache?.torrents ?? []
      const now = Date.now()
      const next = current.find(
        (t) => t.status === 'downloaded' && !fileIndex.has(t.id) && !(failedAt.has(t.id) && now - (failedAt.get(t.id) ?? 0) < RETRY_AFTER_MS)
      )
      if (!next) return
      // Claim it before the await so the other worker takes a different one
      failedAt.set(next.id, now)
      try {
        const info = await debrid.getTorrentInfo(next.id)
        fileIndex.set(
          next.id,
          info.files.filter((f) => f.selected === 1).map((f) => ({ id: f.id, path: f.path, bytes: f.bytes }))
        )
        failedAt.delete(next.id)
      } catch (err: unknown) {
        logger.debug('Library index: could not read a torrent', { torrentId: next.id, error: err instanceof Error ? err.message : String(err) })
      }
      await sleep(PAUSE_MS)
    }
  }

  void Promise.all(Array.from({ length: WORKERS }, worker))
    .catch((err: unknown) => logger.warn('Library indexer stopped', { error: err instanceof Error ? err.message : String(err) }))
    .finally(() => {
      indexerRunning = false
    })
}

function pendingCount(torrents: debrid.DebridTorrent[]): number {
  const now = Date.now()
  return torrents.filter(
    (t) => t.status === 'downloaded' && !fileIndex.has(t.id) && !(failedAt.has(t.id) && now - (failedAt.get(t.id) ?? 0) < RETRY_AFTER_MS)
  ).length
}

/** Search the account's files by keywords (every word must match). */
export async function searchAccountFiles(query: string, limit = 60): Promise<LibrarySearchResult> {
  const tokens = searchTokens(query)
  const torrents = await accountTorrents()

  // Forget torrents deleted from the account
  const live = new Set(torrents.map((t) => t.id))
  for (const id of fileIndex.keys()) if (!live.has(id)) fileIndex.delete(id)

  startIndexer()
  const finished = torrents.filter((t) => t.status === 'downloaded')
  return {
    results: matchLibrary(torrents, fileIndex, tokens, Math.min(Math.max(limit, 1), 200)),
    torrents: finished.length,
    indexed: finished.filter((t) => fileIndex.has(t.id)).length,
    indexing: indexerRunning && pendingCount(torrents) > 0,
  }
}

export function resetLibraryForTests(): void {
  listCache = null
  fileIndex.clear()
  failedAt.clear()
  indexerRunning = false
}
