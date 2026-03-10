import { createClient } from 'redis'
import { logger } from '../lib/logger'

/**
 * Distributed Cache using Redis
 */

// If running in Docker Compose, the host is 'redis' (injected via environment variable).
// If running locally natively (e.g. `bun run dev`), we use the exposed port from the host.
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6380'
const REDIS_CONNECT_TIMEOUT_MS = 5000

export const redisClient = createClient({
  url: REDIS_URL,
  socket: {
    connectTimeout: REDIS_CONNECT_TIMEOUT_MS,
    reconnectStrategy: (retries) => Math.min(retries * 250, 5000),
  },
})

function toNamespacedKey(namespace: string, key: string): string {
  return `${namespace}:${key}`
}

function escapeRedisGlob(value: string): string {
  return value.replace(/[\\*?\[\]]/g, '\\$&')
}

function normalizeRedisError(err: unknown): { code?: string; error?: string } {
  if (!err || typeof err !== 'object') return {}

  const redisError = err as { code?: string; message?: string }
  return {
    code: redisError.code,
    error: redisError.message,
  }
}

function isRedisReady(): boolean {
  return redisClient.isReady
}

async function connectRedisOrExit(): Promise<void> {
  try {
    await redisClient.connect()
  } catch (err) {
    logger.error('Redis startup connection failed. Exiting process.', {
      redisUrl: REDIS_URL,
      ...normalizeRedisError(err),
    })
    process.exit(1)
  }
}

redisClient.on('error', (err) => {
  logger.error('Redis Client Error', normalizeRedisError(err))
})
redisClient.on('connect', () => logger.info('Redis Client Connected via ' + REDIS_URL))
redisClient.on('ready', () => {
  logger.info('Redis completely ready')
})
redisClient.on('end', () => logger.warn('Redis connection closed'))

// Connect on initialization
void connectRedisOrExit()

/**
 * Generate a cache key from multiple parameters (same as before)
 */
export function generateCacheKey(...parts: (string | number | undefined)[]): string {
  return parts.filter(Boolean).join(':')
}

// Helper to handle JSON serialize/deserialize for Redis strings
const createNamespace = (namespace: string, defaultTtl: number) => ({
  get: async <T>(key: string): Promise<T | undefined> => {
    const namespacedKey = toNamespacedKey(namespace, key)

    if (!isRedisReady()) {
      return undefined
    }

    try {
      const data = await redisClient.get(namespacedKey)
      return data ? JSON.parse(data) : undefined
    } catch (err: any) {
      logger.error(`Redis Get Error [${namespace}]`, { error: err.message || err })
      return undefined
    }
  },
  set: async <T>(key: string, value: T, ttl?: number): Promise<boolean> => {
    const namespacedKey = toNamespacedKey(namespace, key)
    const effectiveTtl = ttl || defaultTtl

    if (!isRedisReady()) {
      return false
    }

    try {
      await redisClient.set(namespacedKey, JSON.stringify(value), {
        EX: effectiveTtl
      })
      return true
    } catch (err: any) {
      logger.error(`Redis Set Error [${namespace}]`, { error: err.message || err })
      return false
    }
  },
  del: async (key: string): Promise<number> => {
    const namespacedKey = toNamespacedKey(namespace, key)

    if (!isRedisReady()) {
      return 0
    }

    try {
      return await redisClient.del(namespacedKey)
    } catch (err: any) {
      logger.error(`Redis Del Error [${namespace}]`, { error: err.message || err })
      return 0
    }
  },
  flush: async (): Promise<void> => {
    if (!isRedisReady()) {
      return
    }

    try {
      // Find all keys matching the namespace and delete them
      const keys = await redisClient.keys(`${namespace}:*`)
      if (keys.length > 0) {
        await redisClient.del(keys)
      }
    } catch(err: any) {
      logger.error(`Redis Flush Error [${namespace}]`, { error: err.message || err })
    }
  }
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
    if (!isRedisReady()) {
      return
    }

    try {
      const safeUserId = escapeRedisGlob(userId)
      const keys = await redisClient.keys(`user:*${safeUserId}*`)
      if (keys.length > 0) {
        await redisClient.del(keys)
      }
    } catch(err: any) {
      logger.error('Redis invalidateUser Error', { error: err.message || err })
    }
  }
}

/**
 * Season Data Cache Operations: 1 hour default
 */
export const seasons = createNamespace('season', 3600)

/**
 * Clear all caches completely
 */
export async function clearAllCaches(): Promise<void> {
  if (!isRedisReady()) {
    return
  }

  try {
    await redisClient.flushDb()
    logger.info('Redis database flushed completely')
  } catch (err: any) {
    logger.error('Redis flushDb Error', { error: err.message || err })
  }
}

export function getCacheStatus() {
  return {
    backend: 'redis',
    redisReady: redisClient.isReady,
    redisOpen: redisClient.isOpen,
  }
}
