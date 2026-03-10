import NodeCache from 'node-cache'

const localCache = new NodeCache({
  stdTTL: 0,
  checkperiod: 120,
  useClones: false,
})

export function getLocalValue<T>(key: string): T | undefined {
  return localCache.get<T>(key)
}

export function setLocalValue<T>(key: string, value: T, ttlSeconds: number): boolean {
  return localCache.set(key, value, ttlSeconds)
}

export function delLocalValue(key: string): number {
  return localCache.del(key)
}

export function delLocalByPattern(pattern: RegExp): number {
  const keys = localCache.keys().filter((key) => pattern.test(key))
  return keys.length > 0 ? localCache.del(keys) : 0
}

export function clearLocalStore(): void {
  localCache.flushAll()
}

export function getLocalStoreKeyCount(): number {
  return localCache.keys().length
}
