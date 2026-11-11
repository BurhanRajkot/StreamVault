import { describe, expect, it } from 'bun:test'
import { magnetLink } from './magnet'

const HASH = 'A1B2C3D4E5F60718293A4B5C6D7E8F9012345678'

describe('magnetLink', () => {
  it('names the release by its info-hash, with its name and public trackers', () => {
    const link = magnetLink(HASH, 'Inception 2010 1080p BluRay & more')!
    const params = new URLSearchParams(link.replace(/^magnet:\?/, ''))
    expect(link.startsWith('magnet:?xt=urn:btih:a1b2c3d4e5f60718293a4b5c6d7e8f9012345678&')).toBe(true)
    expect(params.get('dn')).toBe('Inception 2010 1080p BluRay & more')
    expect(params.getAll('tr').length).toBeGreaterThan(2)
    expect(params.getAll('tr').every((t) => t.startsWith('udp://'))).toBe(true)
  })

  it('takes a base32 info-hash too', () => {
    expect(magnetLink('mfrggzdfmztwq2lknnwg23tpobyxe43u')).toStartWith('magnet:?xt=urn:btih:MFRGGZDFMZTWQ2LKNNWG23TPOBYXE43U&tr=')
  })

  it('refuses anything that isn’t an info-hash', () => {
    expect(magnetLink('')).toBeNull()
    expect(magnetLink('not-a-hash')).toBeNull()
    expect(magnetLink(`${HASH}&tr=http://evil`)).toBeNull()
  })
})
