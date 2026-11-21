import { describe, expect, it } from 'bun:test'
import type { Request } from 'express'
import { appVersion, compareVersions, isOutdatedApp } from './clientKind'

const req = (header?: string) => ({ get: (name: string) => (name.toLowerCase() === 'x-streamvault-client' ? header : undefined) }) as unknown as Request

describe('compareVersions', () => {
  it('compares dotted versions numerically', () => {
    expect(compareVersions('1.0.9', '1.0.21')).toBe(-1)
    expect(compareVersions('1.0.21', '1.0.21')).toBe(0)
    expect(compareVersions('1.1', '1.0.40')).toBe(1)
  })
})

describe('isOutdatedApp (Premium needs a recent app build)', () => {
  it('reads the version the app sends', () => {
    expect(appVersion(req('app/1.0.22'))).toBe('1.0.22')
    expect(appVersion(req('app'))).toBeNull()
    expect(appVersion(req())).toBeNull()
  })

  it('holds back builds older than the minimum, and app calls with no version', () => {
    expect(isOutdatedApp(req('app/1.0.20'), '1.0.21')).toBe(true)
    expect(isOutdatedApp(req('app'), '1.0.21')).toBe(true)
    expect(isOutdatedApp(req('app/1.0.21'), '1.0.21')).toBe(false)
    expect(isOutdatedApp(req('app/1.0.30'), '1.0.21')).toBe(false)
  })

  it('never calls the website outdated (it gets app-only instead)', () => {
    expect(isOutdatedApp(req(), '9.9.9')).toBe(false)
  })
})
