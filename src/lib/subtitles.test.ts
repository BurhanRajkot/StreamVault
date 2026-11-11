import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import {
  activeCues,
  DEFAULT_SUBTITLE_PREFS,
  formatSubtitleDelay,
  orderLanguages,
  parseSubtitles,
  readSubtitlePrefs,
  storeSubtitlePrefs,
  type SubtitleCue,
} from './subtitles'

const textOf = (cue: SubtitleCue) => cue.lines.map((l) => l.map((s) => s.text).join('')).join('\n')

describe('parseSubtitles — SubRip', () => {
  const srt =
    '\uFEFF1\r\n00:00:01,000 --> 00:00:03,500\r\nHello there.\r\n\r\n' +
    '2\r\n00:00:04,000 --> 00:00:06,000\r\n<i>Whispering,</i> <font color="#ff0">quietly</font>\r\nTom &amp; Jerry\r\n\r\n' +
    '3\r\n00:00:07,000 --> 00:00:08,000\r\n{\\an8}A SIGN ON THE WALL\r\n'

  it('reads times, lines and italics, dropping other tags', () => {
    const { cues } = parseSubtitles(srt)
    expect(cues).toHaveLength(3)
    expect(cues[0]).toMatchObject({ start: 1, end: 3.5, top: false })
    expect(cues[1].lines).toEqual([
      [
        { text: 'Whispering,', italic: true },
        { text: ' quietly', italic: false },
      ],
      [{ text: 'Tom & Jerry', italic: false }],
    ])
    expect(cues[2]).toMatchObject({ top: true })
    expect(textOf(cues[2])).toBe('A SIGN ON THE WALL')
  })

  it('never lets markup through as markup', () => {
    const { cues } = parseSubtitles('1\n00:00:01,000 --> 00:00:02,000\n<script>alert(1)</script>&lt;b&gt;\n')
    expect(textOf(cues[0])).toBe('alert(1)<b>')
  })

  it('skips broken blocks and sorts by start', () => {
    const { cues } = parseSubtitles(
      '2\n00:00:05,000 --> 00:00:06,000\nSecond\n\n1\n00:00:01,000 --> 00:00:02,000\nFirst\n\n3\nnot a time\nJunk\n\n4\n00:00:09,000 --> 00:00:08,000\nBackwards\n'
    )
    expect(cues.map(textOf)).toEqual(['First', 'Second'])
  })
})

describe('parseSubtitles — WebVTT', () => {
  it('reads short timestamps and ignores cue settings, headers and notes', () => {
    const vtt = 'WEBVTT\n\nNOTE made by hand\n\n00:01.000 --> 00:02.500 align:start line:0\n<v Bob>Hi</v>\n'
    const { cues } = parseSubtitles(vtt)
    expect(cues).toHaveLength(1)
    expect(cues[0]).toMatchObject({ start: 1, end: 2.5 })
    expect(textOf(cues[0])).toBe('Hi')
  })
})

describe('parseSubtitles — SubStation Alpha', () => {
  const ass = [
    '[Script Info]',
    'Title: Test',
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    'Dialogue: 0,0:00:01.50,0:00:03.00,Default,,0,0,0,,First line\\NSecond, with a comma',
    'Dialogue: 0,0:00:04.00,0:00:05.00,Sign,,0,0,0,,{\\an8\\i1}Top and italic{\\i0}',
    'Comment: 0,0:00:06.00,0:00:07.00,Default,,0,0,0,,Not shown',
    'Dialogue: 0,0:00:08.00,0:00:09.00,Default,,0,0,0,,{\\p1}m 0 0 l 100 0 100 100',
  ].join('\n')

  it('reads dialogue with its line breaks, placement and italics', () => {
    const { cues } = parseSubtitles(ass)
    expect(cues).toHaveLength(2)
    expect(cues[0]).toMatchObject({ start: 1.5, end: 3 })
    expect(textOf(cues[0])).toBe('First line\nSecond, with a comma')
    expect(cues[1]).toMatchObject({ top: true })
    expect(cues[1].lines[0]).toEqual([{ text: 'Top and italic', italic: true }])
  })
})

describe('parseSubtitles — clean-up', () => {
  it('drops advertising anywhere, and credits only at either end', () => {
    const cue = (n: number, text: string) => `${n}\n00:00:${String(n).padStart(2, '0')},000 --> 00:00:${String(n).padStart(2, '0')},900\n${text}\n`
    const srt = [
      cue(1, 'Subtitles by DramaFans'),
      cue(2, 'Hello.'),
      cue(3, 'The letter was translated by my brother.'),
      cue(4, 'Support us and become VIP member to remove all ads from www.OpenSubtitles.org'),
      cue(5, 'Goodbye.'),
      cue(6, 'Synced and corrected by someone'),
    ].join('\n')
    expect(parseSubtitles(srt).cues.map(textOf)).toEqual(['Hello.', 'The letter was translated by my brother.', 'Goodbye.'])
  })
})

describe('activeCues', () => {
  const track = parseSubtitles(
    [
      '1\n00:00:01,000 --> 00:00:02,000\nA\n',
      '2\n00:00:03,000 --> 00:00:10,000\nLong sign\n',
      '3\n00:00:04,000 --> 00:00:05,000\nB\n',
      '4\n00:00:06,000 --> 00:00:07,000\nC\n',
    ].join('\n')
  )

  it('finds the cues on screen, overlapping ones included, in start order', () => {
    expect(activeCues(track, 0.5)).toEqual([])
    expect(activeCues(track, 1).map(textOf)).toEqual(['A'])
    expect(activeCues(track, 2).map(textOf)).toEqual([]) // the end is exclusive
    expect(activeCues(track, 4.5).map(textOf)).toEqual(['Long sign', 'B'])
    expect(activeCues(track, 9).map(textOf)).toEqual(['Long sign'])
    expect(activeCues(track, 11)).toEqual([])
  })
})

describe('subtitle preferences', () => {
  const store = new Map<string, string>()
  beforeEach(() => {
    store.clear()
    globalThis.localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
      key: () => null,
      length: 0,
    } as Storage
  })
  afterEach(() => {
    // The test's stand-in goes away again
    delete (globalThis as { localStorage?: Storage }).localStorage
  })

  it('default to English, medium', () => {
    expect(readSubtitlePrefs()).toEqual(DEFAULT_SUBTITLE_PREFS)
  })

  it('remember subtitles turned off, and the language to turn back on', () => {
    storeSubtitlePrefs({ language: null, lastLanguage: 'spa', size: 'l' })
    expect(readSubtitlePrefs()).toEqual({ language: null, lastLanguage: 'spa', size: 'l' })
  })

  it('survive a garbled entry', () => {
    store.set('sv:player:subtitles', '{"language":"<img>","size":42')
    expect(readSubtitlePrefs()).toEqual(DEFAULT_SUBTITLE_PREFS)
    store.set('sv:player:subtitles', '{"language":"<img>","size":42}')
    expect(readSubtitlePrefs()).toEqual({ language: 'eng', lastLanguage: 'eng', size: 'm' })
  })
})

describe('orderLanguages', () => {
  it('puts the viewer’s language first, then English, then the rest by name', () => {
    const langs = [
      { code: 'eng', name: 'English' },
      { code: 'ara', name: 'Arabic' },
      { code: 'spa', name: 'Spanish' },
      { code: 'fre', name: 'French' },
    ]
    expect(orderLanguages(langs, 'spa').map((l) => l.code)).toEqual(['spa', 'eng', 'ara', 'fre'])
    expect(orderLanguages(langs, null).map((l) => l.code)).toEqual(['eng', 'ara', 'fre', 'spa'])
  })
})

describe('formatSubtitleDelay', () => {
  it('signs and trims the adjustment', () => {
    expect(formatSubtitleDelay(0)).toBe('0.0s')
    expect(formatSubtitleDelay(0.5)).toBe('+0.5s')
    expect(formatSubtitleDelay(-1.25)).toBe('−1.25s')
    expect(formatSubtitleDelay(2)).toBe('+2.0s')
  })
})
