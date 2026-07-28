import { describe, it, expect, beforeEach, afterEach, setSystemTime } from 'bun:test'
import {
  getLocalValue,
  setLocalValue,
  delLocalValue,
  delLocalByPattern,
  clearLocalStore,
  getLocalStoreKeyCount,
} from './localStore'

describe('localStore', () => {
  beforeEach(() => {
    clearLocalStore()
  })

  afterEach(() => {
    // Undo any clock travel so a failing test can't leak a frozen clock
    // into the rest of the suite.
    setSystemTime()
  })

  describe('getLocalValue and setLocalValue', () => {
    it('should set and get a value', () => {
      setLocalValue('test-key', 'test-value', 100)
      expect(getLocalValue<string>('test-key')).toBe('test-value')
    })

    it('should return undefined for non-existent key', () => {
      expect(getLocalValue('missing-key')).toBeUndefined()
    })

    it('should expire a value once its ttlSeconds has elapsed', () => {
      // The store is created with stdTTL: 0 (never expire), so a dropped
      // ttlSeconds argument would silently make every cache entry permanent.
      // Travel the clock rather than sleeping to keep the suite fast.
      setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
      setLocalValue('ttl-key', 'ttl-value', 60)
      expect(getLocalValue<string>('ttl-key')).toBe('ttl-value')

      // 59s in: still inside the window
      setSystemTime(new Date('2026-01-01T00:00:59.000Z'))
      expect(getLocalValue<string>('ttl-key')).toBe('ttl-value')

      // 61s in: past the window
      setSystemTime(new Date('2026-01-01T00:01:01.000Z'))
      expect(getLocalValue('ttl-key')).toBeUndefined()
    })

    it('should keep entries with a longer ttl while shorter ones expire', () => {
      setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
      setLocalValue('short', 'a', 30)
      setLocalValue('long', 'b', 600)

      setSystemTime(new Date('2026-01-01T00:01:00.000Z'))
      expect(getLocalValue('short')).toBeUndefined()
      expect(getLocalValue<string>('long')).toBe('b')
    })
  })

  describe('delLocalValue', () => {
    it('should delete a specific key', () => {
      setLocalValue('key-to-delete', 'value', 100)
      expect(getLocalValue<string>('key-to-delete')).toBe('value')

      const deletedCount = delLocalValue('key-to-delete')
      expect(deletedCount).toBe(1)
      expect(getLocalValue('key-to-delete')).toBeUndefined()
    })

    it('should return 0 when deleting a non-existent key', () => {
      const deletedCount = delLocalValue('missing-key')
      expect(deletedCount).toBe(0)
    })
  })

  describe('delLocalByPattern', () => {
    it('should handle an empty store safely and return 0', () => {
      const deletedCount = delLocalByPattern(/^test/)
      expect(deletedCount).toBe(0)
    })

    it('should return 0 and leave existing keys intact when no keys match the pattern', () => {
      setLocalValue('other-key-1', 'value1', 100)
      setLocalValue('other-key-2', 'value2', 100)

      const deletedCount = delLocalByPattern(/^test/)
      expect(deletedCount).toBe(0)
      expect(getLocalValue<string>('other-key-1')).toBe('value1')
      expect(getLocalValue<string>('other-key-2')).toBe('value2')
      expect(getLocalStoreKeyCount()).toBe(2)
    })

    it('should delete multiple keys that match the pattern and leave non-matching keys intact', () => {
      setLocalValue('test-key-1', 'value1', 100)
      setLocalValue('test-key-2', 'value2', 100)
      setLocalValue('other-key', 'value3', 100)

      expect(getLocalStoreKeyCount()).toBe(3)

      const deletedCount = delLocalByPattern(/^test-key/)

      expect(deletedCount).toBe(2)
      expect(getLocalValue('test-key-1')).toBeUndefined()
      expect(getLocalValue('test-key-2')).toBeUndefined()
      expect(getLocalValue<string>('other-key')).toBe('value3')
      expect(getLocalStoreKeyCount()).toBe(1)
    })
  })

  describe('clearLocalStore and getLocalStoreKeyCount', () => {
    it('should return the correct key count', () => {
      expect(getLocalStoreKeyCount()).toBe(0)
      setLocalValue('key1', 'val1', 100)
      expect(getLocalStoreKeyCount()).toBe(1)
      setLocalValue('key2', 'val2', 100)
      expect(getLocalStoreKeyCount()).toBe(2)
    })

    it('should clear the entire store', () => {
      setLocalValue('key1', 'val1', 100)
      setLocalValue('key2', 'val2', 100)
      expect(getLocalStoreKeyCount()).toBe(2)

      clearLocalStore()

      expect(getLocalStoreKeyCount()).toBe(0)
      expect(getLocalValue('key1')).toBeUndefined()
      expect(getLocalValue('key2')).toBeUndefined()
    })
  })
})
