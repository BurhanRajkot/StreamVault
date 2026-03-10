import { createClient } from 'redis'
import { logger } from '../lib/logger'

/**
 * Distributed Cache using Redis
 */

// If running in Docker Compose, the host is 'redis' (injected via environment variable).
// If running locally natively (e.g. `bun run dev`), we use the exposed port from the host.
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6380'

export const redisClient = createClient({
  url: REDIS_URL
})

redisClient.on('error', (err) => logger.error('Redis Client Error', err))
redisClient.on('connect', () => logger.info('Redis Client Connected via ' + REDIS_URL))
redisClient.on('reconnecting', () => logger.warn('Redis Client Reconnecting...'))
redisClient.on('ready', () => logger.info('Redis completely ready'))

// Connect on initialization
redisClient.connect().catch(console.error)

/**
 * Generate a cache key from multiple parameters (same as before)
 */
export function generateCacheKey(...parts: (string | number | undefined)[]): string {
  return parts.filter(Boolean).join(':')
}

// Helper to handle JSON serialize/deserialize for Redis strings
const createNamespace = (namespace: string, defaultTtl: number) => ({
  get: async <T>(key: string): Promise<T | undefined> => {
    try {
      const data = await redisClient.get(`${namespace}:${key}`)
      return data ? JSON.parse(data) : undefined
    } catch (err: any) {
      logger.error(`Redis Get Error [${namespace}]`, { error: err.message || err })
      return undefined
    }
  },
  set: async <T>(key: string, value: T, ttl?: number): Promise<boolean> => {
    try {
      await redisClient.set(`${namespace}:${key}`, JSON.stringify(value), {
        EX: ttl || defaultTtl
      })
      return true
    } catch (err: any) {
      logger.error(`Redis Set Error [${namespace}]`, { error: err.message || err })
      return false
    }
  },
  del: async (key: string): Promise<number> => {
    try {
      return await redisClient.del(`${namespace}:${key}`)
    } catch (err: any) {
      logger.error(`Redis Del Error [${namespace}]`, { error: err.message || err })
      return 0
    }
  },
  flush: async (): Promise<void> => {
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
    try {
      const keys = await redisClient.keys(`user:*${userId}*`)
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
  await redisClient.flushDb()
  logger.info('Redis database flushed completely')
}
