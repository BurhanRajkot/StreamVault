import { describe, it, expect } from 'bun:test'
import { HLS_MEDIA_PATH } from './rateLimiter'

describe('HLS_MEDIA_PATH', () => {
  const sid = '2a276233-7dbe-42ad-bcfd-ef1efc895a2c'

  it('matches TorBox HLS playlist and segment fetches', () => {
    expect(HLS_MEDIA_PATH.test(`/torbox/hls/${sid}/playlist.m3u8`)).toBe(true)
    expect(HLS_MEDIA_PATH.test(`/torbox/hls/${sid}/seg_00042.ts`)).toBe(true)
  })

  it('does not match other TorBox endpoints', () => {
    expect(HLS_MEDIA_PATH.test('/torbox/hls/start')).toBe(false)
    expect(HLS_MEDIA_PATH.test(`/torbox/hls/${sid}`)).toBe(false)
    expect(HLS_MEDIA_PATH.test(`/torbox/stream/1/2`)).toBe(false)
    expect(HLS_MEDIA_PATH.test(`/torbox/hls/${sid}/seg_00042.ts/../../admin`)).toBe(false)
    expect(HLS_MEDIA_PATH.test(`/admin/torbox/hls/${sid}/playlist.m3u8`)).toBe(false)
  })
})
