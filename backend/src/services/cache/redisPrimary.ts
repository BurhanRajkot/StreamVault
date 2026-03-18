import { createClient } from 'redis'
import { logger } from '../../lib/logger'

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6380'
const REDIS_CONNECT_TIMEOUT_MS = Number(process.env.REDIS_CONNECT_TIMEOUT_MS || 1400)
const REDIS_COMMAND_TIMEOUT_MS = Number(process.env.REDIS_COMMAND_TIMEOUT_MS || 1400)
const REDIS_RECONNECT_INTERVAL_MS = Number(process.env.REDIS_RECONNECT_INTERVAL_MS || 15000)

let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let connectInFlight = false
let fallbackActive = false
let lastFailureAt: string | null = null
let lastFailureReason: string | null = null

export const redisClient = createClient({
  url: REDIS_URL,
  socket: {
    connectTimeout: REDIS_CONNECT_TIMEOUT_MS,
    reconnectStrategy: (retries) => Math.min(retries * 250, 5000),
  },
})

function normalizeRedisError(err: unknown): { code?: string; error?: string } {
  if (!err || typeof err !== 'object') return {}

  const redisError = err as { code?: string; message?: string }
  return {
    code: redisError.code,
    error: redisError.message,
  }
}

function markRedisFailure(reason: string, err?: unknown) {
  const details = {
    reason,
    redisUrl: REDIS_URL,
    ...normalizeRedisError(err),
  }

  lastFailureAt = new Date().toISOString()
  lastFailureReason = reason

  if (!fallbackActive) {
    logger.warn('Redis unavailable, using in-memory cache fallback', details)
  }

  fallbackActive = true
  scheduleReconnect('failure')
}

function markRedisReady() {
  if (fallbackActive) {
    logger.warn('Redis recovered, using Redis as primary cache again', { redisUrl: REDIS_URL })
  }

  fallbackActive = false
  lastFailureAt = null
  lastFailureReason = null

  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
}

export function isRedisReady(): boolean {
  return redisClient.isReady
}

function scheduleReconnect(reason: string) {
  if (reconnectTimer || connectInFlight || redisClient.isReady || redisClient.isOpen) return

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    void ensureRedisConnection('scheduled_reconnect')
  }, REDIS_RECONNECT_INTERVAL_MS)

  logger.debug('Scheduled Redis reconnect', {
    reason,
    redisUrl: REDIS_URL,
    retryInMs: REDIS_RECONNECT_INTERVAL_MS,
  })
}

function withTimeout<T>(operation: string, fn: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Redis operation timeout (${operation}) after ${REDIS_COMMAND_TIMEOUT_MS}ms`))
    }, REDIS_COMMAND_TIMEOUT_MS)

    void fn()
      .then((result) => {
        clearTimeout(timeout)
        resolve(result)
      })
      .catch((err) => {
        clearTimeout(timeout)
        reject(err)
      })
  })
}

export async function runRedisOperation<T>(operation: string, fn: () => Promise<T>): Promise<T | undefined> {
  if (!isRedisReady()) {
    scheduleReconnect('not_ready_operation')
    return undefined
  }

  try {
    const result = await withTimeout(operation, fn)

    if (fallbackActive) {
      markRedisReady()
    }

    return result
  } catch (err) {
    markRedisFailure(`operation_failed:${operation}`, err)
    return undefined
  }
}

export async function ensureRedisConnection(reason: string): Promise<void> {
  if (connectInFlight || redisClient.isReady || redisClient.isOpen) return

  connectInFlight = true
  try {
    await redisClient.connect()
  } catch (err) {
    markRedisFailure(`connect_failed:${reason}`, err)
  } finally {
    connectInFlight = false
  }
}

redisClient.on('error', (err) => {
  if (redisClient.isReady) {
    logger.error('Redis Client Error', normalizeRedisError(err))
    return
  }

  markRedisFailure('error_event', err)
})

redisClient.on('connect', () => logger.info('Redis Client Connected via ' + REDIS_URL))

redisClient.on('ready', () => {
  markRedisReady()
  logger.info('Redis completely ready')
})

redisClient.on('end', () => {
  markRedisFailure('connection_closed')
})

// Fire and forget: Redis stays primary, fallback is only for degraded periods.
void ensureRedisConnection('startup')

export function getRedisStatus() {
  return {
    redisReady: redisClient.isReady,
    redisOpen: redisClient.isOpen,
    fallbackActive,
    lastFailureAt,
    lastFailureReason,
    commandTimeoutMs: REDIS_COMMAND_TIMEOUT_MS,
  }
}
