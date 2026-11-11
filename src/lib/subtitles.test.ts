import { describe, it, expect } from 'bun:test'
import {
  cueTextAt,
  languageLabel,
  organizeTracks,
  parseSubtitles,
  tracksFromAddon,
  type SubtitleTrack,
} from './subtitles'

const SRT = `1
00:00:01,000 --> 00:00:03,500
- Hello.
- Hi there.

2
00:01:02,250 --> 00:01:04,000
<i>Narration {\\an8}with tags</i>

3
00:01:03,000 --> 00:01:05,000
Overlapping line
`

describe('parseSubtitles', () => {
  it('parses SRT blocks, strips tags and keeps line breaks', () => {
    const cues = parseSubtitles(SRT)
    expect(cues).toHaveLength(3)
    expect(cues[0]).toEqual({ start: 1, end: 3.5, text: '- Hello.\n- Hi there.' })
    expect(cues[1].text).toBe('Narration with tags')
  })

  it('parses WebVTT, with headers, hourless timestamps and cue settings', () => {
    const vtt = `WEBVTT

NOTE a comment

00:05.000 --> 00:07.000 align:start position:10%
First

00:00:10.000 --> 00:00:12.000
&lt;Second&gt; &amp; third
`
    const cues = parseSubtitles(vtt)
    expect(cues).toEqual([
      { start: 5, end: 7, text: 'First' },
      { start: 10, end: 12, text: '<Second> & third' },
    ])
  })

  it('drops malformed and empty blocks, sorts by start', () => {
    const raw = `1
not a timestamp
Hello

2
00:00:09,000 --> 00:00:10,000
Later

3
00:00:02,000 --> 00:00:04,000
Earlier

4
00:00:05,000 --> 00:00:06,000
<i></i>
`
    const cues = parseSubtitles(raw)
    expect(cues.map((c) => c.text)).toEqual(['Earlier', 'Later'])
  })
})

describe('cueTextAt', () => {
  const cues = parseSubtitles(SRT)
  it('finds the active cue', () => {
    expect(cueTextAt(cues, 2)).toBe('- Hello.\n- Hi there.')
    expect(cueTextAt(cues, 3.5)).toBeNull()
    expect(cueTextAt(cues, 0.5)).toBeNull()
  })
  it('stacks overlapping cues', () => {
    expect(cueTextAt(cues, 63.5)).toBe('Narration with tags\nOverlapping line')
  })
})

describe('tracksFromAddon', () => {
  it('maps the addon response defensively', () => {
    const tracks = tracksFromAddon({
      subtitles: [
        { id: '1', url: 'https://subs5.strem.io/en/download/a', lang: 'eng', subtitleFileName: 'Movie.2010.CAM.srt' },
        { id: 1, url: 'https://subs5.strem.io/en/download/a2', lang: 'eng' }, // duplicate id (as number)
        { id: '2', url: 'http://insecure.example/b', lang: 'eng' }, // not https
        { id: '3', url: 'https://subs5.strem.io/en/download/c' }, // no lang
        { id: '4', url: 'https://subs5.strem.io/en/download/d', lang: 'pob', movieReleaseName: 'Movie.2010.BluRay' },
      ],
    })
    expect(tracks).toEqual([
      { id: '1', url: 'https://subs5.strem.io/en/download/a', lang: 'eng', label: 'English', release: 'Movie.2010.CAM' },
      { id: '4', url: 'https://subs5.strem.io/en/download/d', lang: 'pob', label: 'Portuguese (Brazil)', release: 'Movie.2010.BluRay' },
    ])
  })

  it('returns nothing for a shape it does not recognise', () => {
    expect(tracksFromAddon(null)).toEqual([])
    expect(tracksFromAddon({ subtitles: 'nope' })).toEqual([])
  })
})

describe('organizeTracks', () => {
  const track = (id: string, lang: string): SubtitleTrack => ({
    id,
    url: `https://subs5.strem.io/${id}`,
    lang,
    label: languageLabel(lang),
  })

  it('puts preferred languages first, caps each language, sorts the rest alphabetically', () => {
    const tracks = [
      track('f1', 'fre'),
      track('e1', 'eng'),
      track('e2', 'eng'),
      track('e3', 'eng'),
      track('e4', 'eng'),
      track('g1', 'ger'),
      track('h1', 'hin'),
    ]
    const ordered = organizeTracks(tracks, ['Hindi', 'English'])
    expect(ordered.map((t) => t.id)).toEqual(['h1', 'e1', 'e2', 'e3', 'f1', 'g1'])
  })
})

describe('languageLabel', () => {
  it('names common codes and falls back to the raw code', () => {
    expect(languageLabel('eng')).toBe('English')
    expect(languageLabel('pob')).toBe('Portuguese (Brazil)')
    expect(languageLabel('zz-not-a-code')).toBe('zz-not-a-code')
  })
})
