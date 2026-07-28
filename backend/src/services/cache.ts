import { logger } from '../lib/logger'
import {
  clearLocalStore,
  delLocalByPattern,
  delLocalValue,
  getLocalStoreKeyCount,
  getLocalValue,
  setLocalValue,
} from './cache/localStore'
import {
  getRedisStatus,
  redisClient,
  runRedisOperation,
} from './cache/redisPrimary'

function toNamespacedKey(namespace: string, key: string): string {
  return `${namespace}:${key}`
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function escapeRedisGlob(value: string): string {
  return value.replace(/[\\*?[\]]/g, '\\$&')
}

/**
 * Generate a cache key from multiple parameters
 */
export function generateCacheKey(...parts: (string | number | undefined)[]): string {
  return parts.filter(Boolean).join(':')
}

/** Batch size for SCAN and the pipelined DELs that follow it. */
const SCAN_BATCH = 500

/**
 * Delete every Redis key matching `pattern`.
 *
 * Uses SCAN rather than KEYS: KEYS walks the entire keyspace in one blocking
 * call, stalling every other client on the server for the duration. SCAN
 * amortises the same work across short, non-blocking cursor steps.
 *
 * Returns the number of keys deleted.
 */
async function deleteRedisByPattern(operation: string, pattern: string): Promise<number> {
  const deleted = await runRedisOperation(operation, async () => {
    let cursor = '0'
    let count = 0

    do {
      const reply = await redisClient.scan(cursor, { MATCH: pattern, COUNT: SCAN_BATCH })
      cursor = String(reply.cursor)

      if (reply.keys.length > 0) {
        await redisClient.del(reply.keys)
        count += reply.keys.length
      }
    } while (cursor !== '0')

    return count
  })

  return deleted ?? 0
}

const createNamespace = (namespace: string, defaultTtl: number) => ({
  get: async <T>(key: string): Promise<T | undefined> => {
    const namespacedKey = toNamespacedKey(namespace, key)

    const redisData = await runRedisOperation(`get:${namespace}`, async () => {
      return redisClient.get(namespacedKey)
    })

    if (redisData !== undefined) {
      if (!redisData) return undefined

      try {
        const parsed = JSON.parse(redisData) as T
        // Keep a hot local copy so fallback can still serve the latest values.
        setLocalValue(namespacedKey, parsed, defaultTtl)
        return parsed
      } catch (err: unknown) {
        logger.error(`Cache parse error [${namespace}]`, { error: err instanceof Error ? err.message : String(err) })
        return undefined
      }
    }

    return getLocalValue<T>(namespacedKey)
  },

  set: async <T>(key: string, value: T, ttl?: number): Promise<boolean> => {
    const namespacedKey = toNamespacedKey(namespace, key)
    const effectiveTtl = ttl || defaultTtl

    const redisSet = await runRedisOperation(`set:${namespace}`, async () => {
      await redisClient.set(namespacedKey, JSON.stringify(value), { EX: effectiveTtl })
      return true
    })

    // Always keep fallback warm, even when Redis is healthy.
    const localSet = setLocalValue(namespacedKey, value, effectiveTtl)
    return Boolean(redisSet ?? localSet)
  },

  del: async (key: string): Promise<number> => {
    const namespacedKey = toNamespacedKey(namespace, key)

    const redisDeleted = await runRedisOperation(`del:${namespace}`, async () => {
      return redisClient.del(namespacedKey)
    })

    const localDeleted = delLocalValue(namespacedKey)
    return redisDeleted !== undefined ? redisDeleted : localDeleted
  },

  flush: async (): Promise<void> => {
    await deleteRedisByPattern(`flush:${namespace}`, `${escapeRedisGlob(namespace)}:*`)
    delLocalByPattern(new RegExp(`^${escapeRegExp(namespace)}:`))
  },
})

/**
 * TMDB Cache Operations: 5 minutes default
 */
export const tmdb = createNamespace('tmdb', 300)

/**
 * User Data Cache Operations: 1 minute default
 */
export const userData = {
  ...createNamespace('user', 60),

  invalidateUser: async (userId: string): Promise<void> => {
    await deleteRedisByPattern('invalidate_user', `user:*${escapeRedisGlob(userId)}*`)

    const safeRegexUserId = escapeRegExp(userId)
    delLocalByPattern(new RegExp(`^user:.*${safeRegexUserId}.*`))
  },
}

/**
 * Season Data Cache Operations: 1 hour default
 */
export const seasons = createNamespace('season', 3600)

/**
 * Clear all caches completely
 */
export async function clearAllCaches(): Promise<void> {
  await runRedisOperation('flushdb', async () => {
    await redisClient.flushDb()
    return true
  })

  clearLocalStore()
  logger.info('All caches flushed')
}

export function getCacheStatus() {
  const redis = getRedisStatus()
  return {
    backend: 'redis-primary-with-memory-fallback',
    redisReady: redis.redisReady,
    redisOpen: redis.redisOpen,
    fallbackActive: redis.fallbackActive,
    lastFailureAt: redis.lastFailureAt,
    lastFailureReason: redis.lastFailureReason,
    redisCommandTimeoutMs: redis.commandTimeoutMs,
    localKeys: getLocalStoreKeyCount(),
  }
}
