import NodeCache from 'node-cache'

/**
 * In-memory caching service with TTL support
 * Uses node-cache for LRU eviction and automatic cleanup
 */

// Cache instances with different TTLs
const tmdbCache = new NodeCache({
  stdTTL: 300, // 5 minutes for TMDB data
  checkperiod: 60, // Check for expired keys every 60 seconds
  useClones: false, // Don't clone objects for better performance
})

const userDataCache = new NodeCache({
  stdTTL: 60, // 1 minute for user data (favorites, continue watching)
  checkperiod: 30,
  useClones: false,
})

const seasonCache = new NodeCache({
  stdTTL: 3600, // 1 hour for season data (rarely changes)
  checkperiod: 300,
  useClones: false,
})

/**
 * Generate a cache key from multiple parameters
 */
export function generateCacheKey(...parts: (string | number | undefined)[]): string {
  return parts.filter(Boolean).join(':')
}

/**
 * TMDB Cache Operations
 */
export const tmdb = {
  get: <T>(key: string): T | undefined => {
    return tmdbCache.get<T>(key)
  },
  set: <T>(key: string, value: T, ttl?: number): boolean => {
    return tmdbCache.set(key, value, ttl || 300)
  },
  del: (key: string): number => {
    return tmdbCache.del(key)
  },
  flush: (): void => {
    tmdbCache.flushAll()
  },
  stats: () => {
    return tmdbCache.getStats()
  },
}

/**
 * User Data Cache Operations
 */
export const userData = {
  get: <T>(key: string): T | undefined => {
    return userDataCache.get<T>(key)
  },
  set: <T>(key: string, value: T, ttl?: number): boolean => {
    return userDataCache.set(key, value, ttl || 60)
  },
  del: (key: string): number => {
    return userDataCache.del(key)
  },
  flush: (): void => {
    userDataCache.flushAll()
  },
  invalidateUser: (userId: string): void => {
    // Invalidate all cache keys for a specific user
    const keys = userDataCache.keys()
    keys.forEach((key: string) => {
      if (key.includes(userId)) {
        userDataCache.del(key)
      }
    })
  },
}

/**
 * Season Data Cache Operations
 */
export const seasons = {
  get: <T>(key: string): T | undefined => {
    return seasonCache.get<T>(key)
  },
  set: <T>(key: string, value: T, ttl?: number): boolean => {
    return seasonCache.set(key, value, ttl || 3600)
  },
  del: (key: string): number => {
    return seasonCache.del(key)
  },
  flush: (): void => {
    seasonCache.flushAll()
  },
}

/**
 * Cache middleware for Express routes
 * Usage: router.get('/path', cacheMiddleware(300), handler)
 */
export function cacheMiddleware(ttl: number = 300) {
  return (req: any, res: any, next: any) => {
    const key = generateCacheKey(req.method, req.originalUrl)
    const cached = tmdb.get(key)

    if (cached) {
      res.setHeader('X-Cache', 'HIT')
      return res.json(cached)
    }

    res.setHeader('X-Cache', 'MISS')

    // Override res.json to cache the response
    const originalJson = res.json.bind(res)
    res.json = (body: any) => {
      tmdb.set(key, body, ttl)
      return originalJson(body)
    }

    next()
  }
}

/**
 * Clear all caches (useful for debugging or manual cache invalidation)
 */
export function clearAllCaches(): void {
  tmdb.flush()
  userData.flush()
  seasons.flush()
  console.log('✅ All caches cleared')
}

/**
 * Get cache statistics for monitoring
 */
export function getCacheStats() {
  return {
    tmdb: tmdbCache.getStats(),
    userData: userDataCache.getStats(),
    seasons: seasonCache.getStats(),
  }
}
