/**
 * Reads a remote video file's keyframe index (Matroska Cues / MP4 sample
 * tables) with a handful of small HTTP range requests — never the media data.
 *
 * The VOD HLS transcoder needs this to publish a complete playlist up front:
 * with the video stream copied (not re-encoded), segments can only start on
 * keyframes, so the segment boundaries have to be known keyframe times.
 */

import { logger } from './logger'

export interface KeyframeIndex {
  /** Presentation times (seconds) of the first video track's keyframes, ascending. */
  keyframes: number[]
  /** Total duration in seconds. */
  duration: number
  container: 'matroska' | 'mp4'
}

const HEAD_BYTES = 256 * 1024
const MAX_INDEX_BYTES = 64 * 1024 * 1024
const FETCH_TIMEOUT_MS = 8000

class RangeReader {
  size: number | null = null
  constructor(private url: string, private signal: AbortSignal) {}

  async read(offset: number, length: number): Promise<Buffer> {
    const res = await fetch(this.url, {
      headers: { Range: `bytes=${offset}-${offset + length - 1}` },
      signal: this.signal,
    })
    if (res.status !== 206 && !(res.status === 200 && offset === 0)) {
      await res.body?.cancel()
      throw new Error(`range request returned HTTP ${res.status}`)
    }
    const total = res.headers.get('content-range')?.match(/\/(\d+)$/)?.[1]
    if (total) this.size = Number(total)
    if (res.status === 200) {
      // Server ignored the Range header; read only what we asked for.
      const reader = res.body!.getReader()
      const chunks: Buffer[] = []
      let got = 0
      while (got < length) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(Buffer.from(value))
        got += value.length
      }
      await reader.cancel()
      return Buffer.concat(chunks).subarray(0, length)
    }
    return Buffer.from(await res.arrayBuffer())
  }
}

const indexCache = new Map<string, KeyframeIndex>()
const INDEX_CACHE_MAX = 200

/**
 * @param cacheKey - Stable identity of the file (torrent + file id); the
 *   signed URL changes on every request.
 * @returns null when the container isn't Matroska/MP4, the index is missing,
 *   or anything goes wrong — callers fall back to a growing (event) playlist.
 */
export async function fetchKeyframeIndex(url: string, cacheKey?: string): Promise<KeyframeIndex | null> {
  const hit = cacheKey ? indexCache.get(cacheKey) : undefined
  if (hit) return hit
  const index = await readIndex(url)
  if (index && cacheKey) {
    if (indexCache.size >= INDEX_CACHE_MAX) indexCache.delete(indexCache.keys().next().value!)
    indexCache.set(cacheKey, index)
  }
  return index
}

async function readIndex(url: string): Promise<KeyframeIndex | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const reader = new RangeReader(url, controller.signal)
    const head = await reader.read(0, HEAD_BYTES)
    let index: KeyframeIndex | null = null
    if (head.readUInt32BE(0) === 0x1a45dfa3) index = await readMatroska(reader, head)
    else if (head.toString('latin1', 4, 8) === 'ftyp') index = await readMp4(reader, head)
    if (!index || index.keyframes.length < 2 || !(index.duration > 0)) return null
    return index
  } catch (err: unknown) {
    logger.warn('Keyframe index read failed', { error: err instanceof Error ? err.message : String(err) })
    return null
  } finally {
    clearTimeout(timer)
  }
}

// ---------------------------------------------------------------------------
// Matroska
// ---------------------------------------------------------------------------

const MKV = {
  Segment: 0x18538067,
  SeekHead: 0x114d9b74,
  Seek: 0x4dbb,
  SeekID: 0x53ab,
  SeekPosition: 0x53ac,
  Info: 0x1549a966,
  TimestampScale: 0x2ad7b1,
  Duration: 0x4489,
  Tracks: 0x1654ae6b,
  TrackEntry: 0xae,
  TrackNumber: 0xd7,
  TrackType: 0x83,
  Cues: 0x1c53bb6b,
  CuePoint: 0xbb,
  CueTime: 0xb3,
  CueTrackPositions: 0xb7,
  CueTrack: 0xf7,
  Cluster: 0x1f43b675,
} as const

interface EbmlElement {
  id: number
  /** Offset of the element's payload within the buffer. */
  dataStart: number
  /** Payload size; null = unknown size (live-style Segment/Cluster). */
  size: number | null
}

function readVint(buf: Buffer, pos: number, keepMarker: boolean): { value: number; length: number; allOnes: boolean } | null {
  if (pos >= buf.length) return null
  const first = buf[pos]
  let length = 1
  while (length <= 8 && !(first & (0x80 >> (length - 1)))) length++
  if (length > 8 || pos + length > buf.length) return null
  let value = keepMarker ? first : first & (0xff >> length)
  let allOnes = (first & (0xff >> length)) === 0xff >> length
  for (let i = 1; i < length; i++) {
    value = value * 256 + buf[pos + i]
    if (buf[pos + i] !== 0xff) allOnes = false
  }
  return { value, length, allOnes }
}

function readElementHeader(buf: Buffer, pos: number): EbmlElement | null {
  const id = readVint(buf, pos, true)
  if (!id) return null
  const size = readVint(buf, pos + id.length, false)
  if (!size) return null
  return { id: id.value, dataStart: pos + id.length + size.length, size: size.allOnes ? null : size.value }
}

function* children(buf: Buffer, start: number, end: number): Generator<EbmlElement> {
  let pos = start
  while (pos < end) {
    const el = readElementHeader(buf, pos)
    if (!el || el.size === null || el.dataStart + el.size > end) return
    yield el
    pos = el.dataStart + el.size
  }
}

function readUint(buf: Buffer, el: EbmlElement): number {
  let v = 0
  for (let i = 0; i < (el.size ?? 0); i++) v = v * 256 + buf[el.dataStart + i]
  return v
}

function readFloat(buf: Buffer, el: EbmlElement): number {
  if (el.size === 4) return buf.readFloatBE(el.dataStart)
  if (el.size === 8) return buf.readDoubleBE(el.dataStart)
  return 0
}

async function readMatroska(reader: RangeReader, head: Buffer): Promise<KeyframeIndex | null> {
  const ebml = readElementHeader(head, 0)
  if (!ebml || ebml.size === null) return null
  const segment = readElementHeader(head, ebml.dataStart + ebml.size)
  if (!segment || segment.id !== MKV.Segment) return null
  const segmentStart = segment.dataStart

  const positions = new Map<number, number>()
  let timestampScale = 1_000_000
  let durationTicks = 0
  let videoTrack: number | null = null
  let cues: { buf: Buffer; el: EbmlElement } | null = null

  const parseInfo = (buf: Buffer, el: EbmlElement) => {
    for (const c of children(buf, el.dataStart, el.dataStart + el.size!)) {
      if (c.id === MKV.TimestampScale) timestampScale = readUint(buf, c)
      else if (c.id === MKV.Duration) durationTicks = readFloat(buf, c)
    }
  }
  const parseTracks = (buf: Buffer, el: EbmlElement) => {
    for (const entry of children(buf, el.dataStart, el.dataStart + el.size!)) {
      if (entry.id !== MKV.TrackEntry) continue
      let num: number | null = null
      let type: number | null = null
      for (const c of children(buf, entry.dataStart, entry.dataStart + entry.size!)) {
        if (c.id === MKV.TrackNumber) num = readUint(buf, c)
        else if (c.id === MKV.TrackType) type = readUint(buf, c)
      }
      if (type === 1 && num !== null && videoTrack === null) videoTrack = num
    }
  }

  // Top-level elements that fit in the initial read; stop at the first Cluster.
  let pos = segmentStart
  while (pos < head.length) {
    const el = readElementHeader(head, pos)
    if (!el || el.id === MKV.Cluster || el.size === null) break
    const end = el.dataStart + el.size
    if (end > head.length) break
    if (el.id === MKV.SeekHead) {
      for (const seek of children(head, el.dataStart, end)) {
        if (seek.id !== MKV.Seek) continue
        let seekId = 0
        let seekPos = -1
        for (const c of children(head, seek.dataStart, seek.dataStart + seek.size!)) {
          if (c.id === MKV.SeekID) seekId = readUint(head, c)
          else if (c.id === MKV.SeekPosition) seekPos = readUint(head, c)
        }
        if (seekPos >= 0 && !positions.has(seekId)) positions.set(seekId, segmentStart + seekPos)
      }
    } else if (el.id === MKV.Info) parseInfo(head, el)
    else if (el.id === MKV.Tracks) parseTracks(head, el)
    else if (el.id === MKV.Cues) cues = { buf: head, el }
    pos = end
  }

  const fetchElement = async (offset: number): Promise<{ buf: Buffer; el: EbmlElement } | null> => {
    const hdr = await reader.read(offset, 16)
    const h = readElementHeader(hdr, 0)
    if (!h || h.size === null || h.size > MAX_INDEX_BYTES) return null
    const buf = await reader.read(offset, h.dataStart + h.size)
    const el = readElementHeader(buf, 0)
    return el && el.dataStart + (el.size ?? 0) <= buf.length ? { buf, el } : null
  }

  if (videoTrack === null && positions.has(MKV.Tracks)) {
    const t = await fetchElement(positions.get(MKV.Tracks)!)
    if (t?.el.id === MKV.Tracks) parseTracks(t.buf, t.el)
  }
  if (durationTicks === 0 && positions.has(MKV.Info)) {
    const i = await fetchElement(positions.get(MKV.Info)!)
    if (i?.el.id === MKV.Info) parseInfo(i.buf, i.el)
  }
  if (!cues && positions.has(MKV.Cues)) {
    const c = await fetchElement(positions.get(MKV.Cues)!)
    if (c?.el.id === MKV.Cues) cues = c
  }
  if (!cues || videoTrack === null) return null

  const toSeconds = timestampScale / 1e9
  const times = new Set<number>()
  const { buf, el } = cues
  for (const point of children(buf, el.dataStart, el.dataStart + el.size!)) {
    if (point.id !== MKV.CuePoint) continue
    let time: number | null = null
    let forVideo = false
    for (const c of children(buf, point.dataStart, point.dataStart + point.size!)) {
      if (c.id === MKV.CueTime) time = readUint(buf, c)
      else if (c.id === MKV.CueTrackPositions) {
        for (const p of children(buf, c.dataStart, c.dataStart + c.size!)) {
          if (p.id === MKV.CueTrack && readUint(buf, p) === videoTrack) forVideo = true
        }
      }
    }
    if (time !== null && forVideo) times.add(time)
  }

  return {
    keyframes: [...times].sort((a, b) => a - b).map((t) => t * toSeconds),
    duration: durationTicks * toSeconds,
    container: 'matroska',
  }
}

// ---------------------------------------------------------------------------
// MP4 / MOV
// ---------------------------------------------------------------------------

interface Box {
  type: string
  start: number
  dataStart: number
  end: number
}

function* boxes(buf: Buffer, start: number, end: number): Generator<Box> {
  let pos = start
  while (pos + 8 <= end) {
    let size = buf.readUInt32BE(pos)
    const type = buf.toString('latin1', pos + 4, pos + 8)
    let header = 8
    if (size === 1) {
      if (pos + 16 > end) return
      size = Number(buf.readBigUInt64BE(pos + 8))
      header = 16
    } else if (size === 0) {
      size = end - pos
    }
    if (size < header || pos + size > end) return
    yield { type, start: pos, dataStart: pos + header, end: pos + size }
    pos += size
  }
}

function findBox(buf: Buffer, parent: { dataStart: number; end: number }, path: string[]): Box | null {
  let scope: { dataStart: number; end: number } = parent
  let found: Box | null = null
  for (const type of path) {
    found = null
    for (const b of boxes(buf, scope.dataStart, scope.end)) {
      if (b.type === type) {
        found = b
        break
      }
    }
    if (!found) return null
    scope = found
  }
  return found
}

async function readMp4(reader: RangeReader, head: Buffer): Promise<KeyframeIndex | null> {
  // Walk top-level boxes by header only until `moov` turns up (it's often
  // after a multi-GB `mdat`).
  let moov: Buffer | null = null
  let pos = 0
  for (let i = 0; i < 64; i++) {
    const hdr = pos + 16 <= head.length ? head.subarray(pos, pos + 16) : await reader.read(pos, 16)
    if (hdr.length < 8) break
    let size = hdr.readUInt32BE(0)
    const type = hdr.toString('latin1', 4, 8)
    if (size === 1) size = Number(hdr.readBigUInt64BE(8))
    else if (size === 0) size = (reader.size ?? pos) - pos
    if (size < 8) break
    if (type === 'moov') {
      if (size > MAX_INDEX_BYTES) return null
      moov = pos + size <= head.length ? head.subarray(pos, pos + size) : await reader.read(pos, size)
      break
    }
    pos += size
    if (reader.size !== null && pos >= reader.size) break
  }
  if (!moov) return null

  const root = { dataStart: 8, end: moov.length }
  const mvhd = findBox(moov, root, ['mvhd'])
  if (!mvhd) return null
  const mvhdV1 = moov[mvhd.dataStart] === 1
  const movieTimescale = moov.readUInt32BE(mvhd.dataStart + (mvhdV1 ? 20 : 12))
  const movieDuration = mvhdV1
    ? Number(moov.readBigUInt64BE(mvhd.dataStart + 24))
    : moov.readUInt32BE(mvhd.dataStart + 16)

  for (const trak of boxes(moov, root.dataStart, root.end)) {
    if (trak.type !== 'trak') continue
    const hdlr = findBox(moov, trak, ['mdia', 'hdlr'])
    if (!hdlr || moov.toString('latin1', hdlr.dataStart + 8, hdlr.dataStart + 12) !== 'vide') continue

    const mdhd = findBox(moov, trak, ['mdia', 'mdhd'])
    const stbl = findBox(moov, trak, ['mdia', 'minf', 'stbl'])
    if (!mdhd || !stbl) return null
    const timescale = moov.readUInt32BE(mdhd.dataStart + (moov[mdhd.dataStart] === 1 ? 20 : 12))
    const stts = findBox(moov, stbl, ['stts'])
    const stss = findBox(moov, stbl, ['stss'])
    const ctts = findBox(moov, stbl, ['ctts'])
    if (!stts || !stss || !timescale) return null

    const sync: number[] = []
    const syncCount = moov.readUInt32BE(stss.dataStart + 4)
    for (let i = 0; i < syncCount; i++) sync.push(moov.readUInt32BE(stss.dataStart + 8 + i * 4))

    // Composition offset per sample, run-length coded.
    const cttsRuns: Array<[number, number]> = []
    if (ctts) {
      const signed = moov[ctts.dataStart] === 1
      const n = moov.readUInt32BE(ctts.dataStart + 4)
      for (let i = 0; i < n; i++) {
        const p = ctts.dataStart + 8 + i * 8
        cttsRuns.push([moov.readUInt32BE(p), signed ? moov.readInt32BE(p + 4) : moov.readUInt32BE(p + 4)])
      }
    }

    // Edit list: an empty edit delays the track; a media_time trims its start.
    let shift = 0
    const elst = findBox(moov, trak, ['edts', 'elst'])
    if (elst) {
      const v1 = moov[elst.dataStart] === 1
      const n = moov.readUInt32BE(elst.dataStart + 4)
      const entrySize = v1 ? 20 : 12
      for (let i = 0; i < n; i++) {
        const p = elst.dataStart + 8 + i * entrySize
        const segDuration = v1 ? Number(moov.readBigUInt64BE(p)) : moov.readUInt32BE(p)
        const mediaTime = v1 ? Number(moov.readBigInt64BE(p + 8)) : moov.readInt32BE(p + 4)
        if (mediaTime === -1) {
          shift += segDuration / movieTimescale
          continue
        }
        shift -= mediaTime / timescale
        break
      }
    }

    const keyframes: number[] = []
    const sttsCount = moov.readUInt32BE(stts.dataStart + 4)
    let sample = 1
    let dts = 0
    let syncIdx = 0
    let cttsRun = 0
    let cttsLeft = cttsRuns[0]?.[0] ?? 0
    let cttsSample = 1
    const cttsAt = (s: number): number => {
      while (cttsSample < s && cttsRun < cttsRuns.length) {
        const step = Math.min(s - cttsSample, cttsLeft)
        cttsSample += step
        cttsLeft -= step
        if (cttsLeft === 0) {
          cttsRun++
          cttsLeft = cttsRuns[cttsRun]?.[0] ?? 0
        }
      }
      return cttsRuns[cttsRun]?.[1] ?? 0
    }
    for (let i = 0; i < sttsCount && syncIdx < sync.length; i++) {
      const count = moov.readUInt32BE(stts.dataStart + 8 + i * 8)
      const delta = moov.readUInt32BE(stts.dataStart + 12 + i * 8)
      while (syncIdx < sync.length && sync[syncIdx] < sample + count) {
        const s = sync[syncIdx++]
        const sDts = dts + (s - sample) * delta
        keyframes.push((sDts + cttsAt(s)) / timescale + shift)
      }
      dts += count * delta
      sample += count
    }

    return {
      keyframes: keyframes.sort((a, b) => a - b),
      duration: movieDuration / movieTimescale,
      container: 'mp4',
    }
  }
  return null
}
