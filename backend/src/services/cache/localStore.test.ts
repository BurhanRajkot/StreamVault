import { describe, it, expect, beforeEach, mock } from 'bun:test'
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

  describe('getLocalValue and setLocalValue', () => {
    it('should set and get a value', () => {
      setLocalValue('test-key', 'test-value', 100)
      expect(getLocalValue('test-key')).toBe('test-value')
    })

    it('should return undefined for non-existent key', () => {
      expect(getLocalValue('missing-key')).toBeUndefined()
    })

    it('should pass ttlSeconds to the underlying node-cache instance', async () => {
      const mockSet = mock(() => true)
      mock.module('node-cache', () => {
        return {
          default: class MockNodeCache {
            set = mockSet
            get = mock(() => undefined)
            del = mock(() => 1)
            keys = mock(() => [])
            flushAll = mock(() => {})
          },
        }
      })

      // Use a dynamic import with cache-busting to get the newly mocked version
      const { setLocalValue: mockedSetLocalValue } = await import(
        `./localStore.ts?t=${Date.now()}`
      )

      mockedSetLocalValue('ttl-key', 'ttl-value', 60)

      expect(mockSet).toHaveBeenCalledWith('ttl-key', 'ttl-value', 60)

      // Reset the mock module after use
      mock.module('node-cache', () => import('node-cache'))
    })
  })

  describe('delLocalValue', () => {
    it('should delete a specific key', () => {
      setLocalValue('key-to-delete', 'value', 100)
      expect(getLocalValue('key-to-delete')).toBe('value')

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
      expect(getLocalValue('other-key-1')).toBe('value1')
      expect(getLocalValue('other-key-2')).toBe('value2')
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
      expect(getLocalValue('other-key')).toBe('value3')
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
