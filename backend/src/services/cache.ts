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
  return value.replace(/[\\*?\[\]]/g, '\\$&')
}

/**
 * Generate a cache key from multiple parameters
 */
export function generateCacheKey(...parts: (string | number | undefined)[]): string {
  return parts.filter(Boolean).join(':')
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
      } catch (err: any) {
        logger.error(`Cache parse error [${namespace}]`, { error: err?.message || err })
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
    const pattern = `${namespace}:*`

    const keys = await runRedisOperation(`keys:${namespace}`, async () => {
      return redisClient.keys(pattern)
    })

    if (keys && keys.length > 0) {
      await runRedisOperation(`delkeys:${namespace}`, async () => {
        await redisClient.del(keys)
        return true
      })
    }

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
    const safeRedisUserId = escapeRedisGlob(userId)
    const redisKeys = await runRedisOperation('invalidate_user:keys', async () => {
      return redisClient.keys(`user:*${safeRedisUserId}*`)
    })

    if (redisKeys && redisKeys.length > 0) {
      await runRedisOperation('invalidate_user:del', async () => {
        await redisClient.del(redisKeys)
        return true
      })
    }

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
