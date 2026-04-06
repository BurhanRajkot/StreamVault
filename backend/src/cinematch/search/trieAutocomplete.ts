import { logger } from '../../lib/logger'
import { MediaType } from '../types'

export interface TrieEntity {
  id: number
  title: string
  mediaType: MediaType
  popularity?: number
  poster_path?: string
  release_year?: number
}

interface TrieNode {
  children: Record<string, TrieNode>
  isTerminal: boolean
  // Store top entities that match this exact prefix.
  // We keep it bounded to avoid massive memory usage for short prefixes like "a".
  topEntities: TrieEntity[]
}

const MAX_ENTITIES_PER_NODE = 20

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
    const text = (textToindex || entity.title).toLowerCase().trim()
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
    const text = prefix.toLowerCase().trim()
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
const TMDB_BASE_URL = 'https://api.themoviedb.org/3'

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

  const endpoints = [
    '/trending/all/day',
    '/trending/all/week',
    '/movie/popular',
    '/tv/popular',
    '/movie/top_rated',
    '/tv/top_rated'
  ]

  for (const ep of endpoints) {
    try {
      // Fetch top 3 pages for each to get a good base catalog
      for (let page = 1; page <= 3; page++) {
        const url = `${TMDB_BASE_URL}${ep}?api_key=${TMDB_API_KEY}&page=${page}`
        const res = await fetch(url)
        if (!res.ok) continue
        
        const data = await res.json()
        const items = data.results || []
        
        for (const item of items) {
          if (!item.title && !item.name) continue
          
          const mediaType = item.media_type || (ep.includes('/movie') ? 'movie' : 'tv')
          const title = item.title || item.name
          const entity: TrieEntity = {
            id: item.id,
            mediaType: mediaType as MediaType,
            title,
            popularity: item.popularity || 0,
            poster_path: item.poster_path,
            release_year: item.release_date ? parseInt(item.release_date.substring(0, 4)) : 
                         (item.first_air_date ? parseInt(item.first_air_date.substring(0, 4)) : undefined)
          }

          globalTrie.insert(entity, title)
          count++
          
          // If the title has meaningful alternative prefixes (like dropping "The "), insert those too
          const titleLower = title.toLowerCase()
          if (titleLower.startsWith('the ')) {
             globalTrie.insert(entity, title.substring(4))
          }
          if (titleLower.startsWith('a ')) {
             globalTrie.insert(entity, title.substring(2))
          }
        }
      }
    } catch (err: any) {
      logger.warn(`[Trie] Failed to fetch ${ep}`, { error: err.message })
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
