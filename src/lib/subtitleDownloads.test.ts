import { describe, expect, it } from 'bun:test'
import { bestPerLanguage, type SubtitleFile } from './subtitleDownloads'

const file = (over: Partial<SubtitleFile>): SubtitleFile => ({
  url: 'https://subtitles.vidy.st/download?id=x',
  display: 'English',
  language: 'en',
  format: 'srt',
  ...over,
})

describe('bestPerLanguage', () => {
  it('keeps one file per language: trusted, then not for the hearing impaired, then most downloaded', () => {
    const langs = bestPerLanguage([
      file({ url: 'https://a/1', downloadCount: 900, isHearingImpaired: true, isTrusted: true }),
      file({ url: 'https://a/2', downloadCount: 10, isTrusted: true }),
      file({ url: 'https://a/3', downloadCount: 99_999, isTrusted: false }),
      file({ url: 'https://a/4', display: 'French', language: 'fr', downloadCount: 5 }),
    ])
    expect(langs.map((l) => l.display)).toEqual(['English', 'French'])
    expect(langs[0].file.url).toBe('https://a/2')
  })

  it('puts the viewer’s own language first, then English, then A–Z', () => {
    const langs = bestPerLanguage(
      [
        file({ display: 'Spanish', language: 'es' }),
        file({ display: 'Arabic', language: 'ar' }),
        file({ display: 'English', language: 'en' }),
        file({ display: 'Hindi', language: 'hi' }),
      ],
      ['hi-IN']
    )
    expect(langs.map((l) => l.language)).toEqual(['hi', 'en', 'ar', 'es'])
  })
})
