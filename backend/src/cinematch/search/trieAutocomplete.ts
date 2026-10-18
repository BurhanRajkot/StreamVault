import { logger } from '../../lib/logger'
import { mapConcurrent } from '../../utils/concurrency'
import { TMDB_BASE_URL } from '../../lib/tmdbBase'
import { tmdbFetch } from '../../lib/tmdbFetch'
import { MediaType } from '../types'

export interface TrieEntity {
  id: number
  title: string
  mediaType: MediaType
  popularity?: number
  poster_path?: string
  release_year?: number
  /** Carried so a hit renders with its score, like a title from the full search. */
  vote_average?: number
  vote_count?: number
}

interface TrieNode {
  children: Record<string, TrieNode>
  isTerminal: boolean
  // Store top entities that match this exact prefix.
  // We keep it bounded to avoid massive memory usage for short prefixes like "a".
  topEntities: TrieEntity[]
}

const MAX_ENTITIES_PER_NODE = 20

/** The trie's key for a title or a typed prefix: lower-case, accents folded ("Pokémon" → "pokemon"). */
function trieKey(text: string): string {
  return text.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
}

class AutocompleteTrie {
  private root: TrieNode

  constructor() {
    this.root = this.createNode()
  }

  private createNode(): TrieNode {
    return {
      children: {},
      isTerminal: false,
      topEntities: []
    }
  }

  /**
   * Insert a title into the Trie.
   * We insert not just the full title, but also substrings if desired,
   * though usually prefix is enough for a standard Trie.
   */
  public insert(entity: TrieEntity, textToindex?: string) {
    const text = trieKey(textToindex || entity.title)
    if (!text) return

    let current = this.root
    
    // We'll update the topEntities of every node along the path
    // so that lookup is instant O(m) where m is prefix length.
    for (let i = 0; i < text.length; i++) {
      const char = text[i]
      if (!current.children[char]) {
        current.children[char] = this.createNode()
      }
      current = current.children[char]
      
      this.addEntityToNode(current, entity)
    }
    
    current.isTerminal = true
  }

  private addEntityToNode(node: TrieNode, entity: TrieEntity) {
    // Avoid duplicates
    if (node.topEntities.some(e => e.id === entity.id && e.mediaType === entity.mediaType)) {
      return
    }

    node.topEntities.push(entity)
    // Keep it sorted by popularity
    node.topEntities.sort((a, b) => (b.popularity || 0) - (a.popularity || 0))
    
    if (node.topEntities.length > MAX_ENTITIES_PER_NODE) {
      node.topEntities.pop()
    }
  }

  /**
   * $O(m)$ lookup where m is length of prefix.
   */
  public search(prefix: string): TrieEntity[] {
    const text = trieKey(prefix)
    if (!text) return []

    let current = this.root
    for (let i = 0; i < text.length; i++) {
      const char = text[i]
      if (!current.children[char]) {
        return [] // Prefix not found
      }
      current = current.children[char]
    }

    return current.topEntities
  }

  public getSizeInfo() {
    let nodeCount = 0
    let entityRefs = 0

    const traverse = (node: TrieNode) => {
      nodeCount++
      entityRefs += node.topEntities.length
      for (const child of Object.values(node.children)) {
        traverse(child)
      }
    }
    traverse(this.root)

    return { nodeCount, entityRefs }
  }
}

// Global Singleton Trie
export const globalTrie = new AutocompleteTrie()

// ── Background Seed Job ─────────────────────────────────────

const TMDB_API_KEY = process.env.TMDB_API_KEY || process.env.VITE_TMDB_API_KEY

/**
 * Seeds the Trie on server startup.
 * Fetches the top trending and highly rated movies and TV shows
 * to provide instant, zero-latency autocomplete for popular queries.
 */
export async function seedTrieBackground() {
  if (!TMDB_API_KEY) {
    logger.warn('[Trie] TMDB_API_KEY missing, skipping seed')
    return
  }
  
  logger.info('[Trie] Starting background seed process...')
  const startTime = Date.now()
  let count = 0

  // What people type the start of: this week's titles, plus the most-voted of
  // all time. TMDB's own search matches whole words only ("nar" finds "Nar",
  // never "Narcos"), so a title missing here can't come up for a short query.
  const sources: Array<{ ep: string; pages: number }> = [
    { ep: '/trending/all/day', pages: 3 },
    { ep: '/trending/all/week', pages: 3 },
    { ep: '/movie/popular', pages: 3 },
    { ep: '/tv/popular', pages: 3 },
    { ep: '/movie/top_rated', pages: 3 },
    { ep: '/tv/top_rated', pages: 3 },
    { ep: '/discover/movie?sort_by=vote_count.desc', pages: 50 },
    { ep: '/discover/tv?sort_by=vote_count.desc', pages: 25 },
  ]

  const tasks: { ep: string; page: number }[] = []
  for (const { ep, pages } of sources) {
    for (let page = 1; page <= pages; page++) {
      tasks.push({ ep, page })
    }
  }

  const results = await mapConcurrent(tasks, 2, async ({ ep, page }) => {
    const url = `${TMDB_BASE_URL}${ep}${ep.includes('?') ? '&' : '?'}api_key=${TMDB_API_KEY}&page=${page}`
    try {
      const res = await tmdbFetch(url, {
        headers: {
          'accept': 'application/json'
        }
      })
      if (!res.ok) return { ep, items: [] }

      interface RawTrieItem {
        id: number
        title?: string
        name?: string
        popularity?: number
        poster_path?: string
        vote_average?: number
        vote_count?: number
        release_date?: string
        first_air_date?: string
        media_type?: string
      }
      try {
        const data = await res.json() as { results?: RawTrieItem[] }
        return { ep, items: data.results || [] }
      } catch (_parseErr) {
        const preview = await res.text().catch(() => '<unreadable>')
        throw new Error(`JSON parse error. Body preview: ${preview.substring(0, 150)}`)
      }
    } catch (err: unknown) {
      logger.warn(`[Trie] Failed to fetch ${ep}`, { error: err instanceof Error ? err.message : String(err) })
      return { ep, items: [] }
    }
  })

  for (const { ep, items } of results) {
    for (const item of items) {
      if (!item.title && !item.name) continue

      const mediaType = item.media_type || (ep.includes('/movie') ? 'movie' : 'tv')
      const title = item.title || item.name
      const entity: TrieEntity = {
        id: item.id,
        mediaType: mediaType as MediaType,
        title: title || '',
        popularity: item.popularity || 0,
        poster_path: item.poster_path,
        vote_average: item.vote_average,
        vote_count: item.vote_count,
        release_year: item.release_date ? parseInt(item.release_date.substring(0, 4)) :
                     (item.first_air_date ? parseInt(item.first_air_date.substring(0, 4)) : undefined)
      }
      const titleString = title || 'Unknown'
      globalTrie.insert(entity, titleString)

      // Add partial matching for long titles
      if (titleString.length > 5) {
        const titleLower = titleString.toLowerCase()
        if (titleLower.startsWith('the ')) {
         globalTrie.insert(entity, titleString.substring(4))
        }
        if (titleLower.startsWith('a ')) {
         globalTrie.insert(entity, titleString.substring(2))
        }
      }
      count++
    }
  }

  const duration = Date.now() - startTime
  const stats = globalTrie.getSizeInfo()
  logger.info('[Trie] Background seed complete', { 
    itemsProcessed: count, 
    durationMs: duration,
    nodeCount: stats.nodeCount,
    entityRefs: stats.entityRefs
  })
}
