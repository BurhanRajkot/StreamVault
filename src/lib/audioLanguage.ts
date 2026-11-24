/**
 * Which language a Premium film or episode plays in.
 *
 * Every title plays in English, as it always did — except one whose
 * original language is Hindi (The Family Man, Jawan, Panchayat...), which
 * plays in Hindi: an English dub of a Hindi show is nobody's first choice.
 * Anime stays as it is (English). The viewer can switch the language in the
 * player's settings; that choice is kept per title, so the next episode
 * plays in it too.
 *
 * A release's languages come from its name ("Hindi", "Hin.Tam.Tel.Eng",
 * "Dual Audio [Hindi + English]") and from the tags Torrentio puts under
 * it (🇮🇳, 🇬🇧, "Multi Audio" — the backend reads those into `languages`).
 * Inside a file, Real-Debrid's media info names each audio track's
 * language, and the player picks the wanted one (lib/localStream converts
 * it in the app; Real-Debrid's transcode carries it on the website).
 */

import type { DebridAudioTrack, DebridReadyPlayback, DebridRelease } from './debridApi'
import { isLikelyNonEnglishRelease } from './debridApi'

/** ISO 639-1, e.g. "en", "hi". */
export type AudioLanguage = string

export const DEFAULT_AUDIO_LANGUAGE: AudioLanguage = 'en'

/** Original languages a title plays in rather than English. */
const ORIGINAL_AUDIO_LANGUAGES = new Set<AudioLanguage>(['hi'])

/** Torrentio's single 🇮🇳 covers every Indian language; these are what it may stand for. */
const INDIAN_LANGUAGES = new Set<AudioLanguage>(['hi', 'ta', 'te', 'ml', 'kn', 'bn', 'mr', 'pa', 'gu'])

const ANIMATION_GENRE = 16

interface TitleLanguageInfo {
  id: number
  original_language?: string
  genres?: { id: number }[]
  genre_ids?: number[]
}

function isAnime(media: TitleLanguageInfo): boolean {
  const genres = media.genres?.map((g) => g.id) ?? media.genre_ids ?? []
  return genres.includes(ANIMATION_GENRE) && media.original_language === 'ja'
}

const storageKey = (kind: string, id: number) => `sv:audio-lang:${kind}:${id}`

/** The language a title plays in: the viewer's own pick for it, else its original language when that's Hindi, else English. */
export function audioLanguageFor(media: TitleLanguageInfo, kind: 'movie' | 'tv'): AudioLanguage {
  try {
    const picked = localStorage.getItem(storageKey(kind, media.id))
    if (picked && /^[a-z]{2}$/.test(picked)) return picked
  } catch {
    // No storage: the title's own language
  }
  if (isAnime(media)) return DEFAULT_AUDIO_LANGUAGE
  const original = media.original_language
  return original && ORIGINAL_AUDIO_LANGUAGES.has(original) ? original : DEFAULT_AUDIO_LANGUAGE
}

/** Keep the viewer's language pick for this title. */
export function rememberAudioLanguage(kind: 'movie' | 'tv', id: number, lang: AudioLanguage): void {
  try {
    localStorage.setItem(storageKey(kind, id), lang)
  } catch {
    // Not kept: this play still uses it
  }
}

// ---------------------------------------------------------------------------
// A release's languages
// ---------------------------------------------------------------------------

/** Language words release names use. Short tags only where they can't be part of a title (no "BEN", "MAL"). */
const NAME_LANGUAGES: [RegExp, AudioLanguage][] = [
  [/\b(Hindi|HIN)\b/i, 'hi'],
  [/\b(Tamil|TAM)\b/i, 'ta'],
  [/\b(Telugu|TEL)\b/i, 'te'],
  [/\bMalayalam\b/i, 'ml'],
  [/\bKannada\b/i, 'kn'],
  [/\bBengali\b/i, 'bn'],
  [/\bMarathi\b/i, 'mr'],
  [/\b(ENG|English)\b/i, 'en'],
  [/\b(ITA|iTALiAN)\b/i, 'it'],
  [/\b(FRENCH|TRUEFRENCH|VFF|VFQ|VF2)\b/i, 'fr'],
  [/\b(GER|GERMAN)\b/i, 'de'],
  [/\b(SPA|SPANISH|ESP|Castellano|Latino)\b/i, 'es'],
  [/\b(RUS|Russian)\b/i, 'ru'],
  [/\bUKR\b/i, 'uk'],
  [/\b(POL|Polish)\b/i, 'pl'],
  [/\b(KOR|Korean)\b/i, 'ko'],
  [/\b(JAP|JPN|Japanese)\b/i, 'ja'],
]

/** "ESub", "Eng Subs", "MSubs": subtitles, not audio. */
const SUBTITLE_MENTION_RE = /\b(?:ENG|English|Hindi)[ ._-]?(?:Sub(?:s|titles?)?|SDH)\b/gi

/** The languages a release name declares (ISO 639-1), plus "multi" for MULTi/Dual Audio. */
export function nameLanguages(name: string): Set<AudioLanguage> {
  const text = name.replace(SUBTITLE_MENTION_RE, ' ')
  const langs = new Set<AudioLanguage>()
  for (const [re, lang] of NAME_LANGUAGES) if (re.test(text)) langs.add(lang)
  if (/\b(Dual|MULTi)([ ._-]?Audio)?\b/i.test(text)) langs.add('multi')
  return langs
}

/**
 * Everything known about a release's languages: its name's, and the tags
 * the backend read from Torrentio ("in" = some Indian language, "multi").
 */
export function releaseLanguages(release: Pick<DebridRelease, 'name' | 'languages'>): Set<AudioLanguage> {
  const langs = nameLanguages(release.name)
  for (const lang of release.languages ?? []) langs.add(lang)
  // A named Indian language says which one Torrentio's 🇮🇳 meant
  if (langs.has('in') && [...langs].some((l) => INDIAN_LANGUAGES.has(l))) langs.delete('in')
  return langs
}

/**
 * How well a release fits the wanted language — 0 best:
 *   English: 0 = English or not said (the usual case), 1 = other languages only.
 *   Others:  0 = has it, 1 = may have it (Torrentio's 🇮🇳 for an Indian
 *   language, or several audio tracks), 2 = doesn't say (often English),
 *   3 = other languages only.
 */
export function releaseLanguageRank(release: Pick<DebridRelease, 'name' | 'languages'>, want: AudioLanguage): number {
  const langs = releaseLanguages(release)
  if (want === DEFAULT_AUDIO_LANGUAGE) {
    if (langs.has('en') || langs.has('multi')) return 0
    const others = [...langs].length > 0
    return others || isLikelyNonEnglishRelease(release.name) ? 1 : 0
  }
  if (langs.has(want)) return 0
  if (langs.has('multi') || (langs.has('in') && INDIAN_LANGUAGES.has(want))) return 1
  if (langs.size === 0 && !isLikelyNonEnglishRelease(release.name)) return 2
  return 3
}

/** The release surely has this language — named, or (for an Indian language) Torrentio's 🇮🇳 alone. */
export function releaseHasLanguage(release: Pick<DebridRelease, 'name' | 'languages'>, lang: AudioLanguage): boolean {
  const langs = releaseLanguages(release)
  return langs.has(lang) || (INDIAN_LANGUAGES.has(lang) && langs.has('in'))
}

// ---------------------------------------------------------------------------
// The audio tracks of a file
// ---------------------------------------------------------------------------

/** ISO 639-2 (what Real-Debrid's media info gives) → ISO 639-1. */
const ISO_639_2: Record<string, string> = {
  eng: 'en', hin: 'hi', tam: 'ta', tel: 'te', mal: 'ml', kan: 'kn', ben: 'bn', mar: 'mr', pan: 'pa', guj: 'gu', urd: 'ur',
  jpn: 'ja', kor: 'ko', chi: 'zh', zho: 'zh', spa: 'es', fre: 'fr', fra: 'fr', ger: 'de', deu: 'de', ita: 'it', rus: 'ru',
  ukr: 'uk', pol: 'pl', por: 'pt', ara: 'ar', tur: 'tr', tha: 'th', ind: 'id', vie: 'vi', dut: 'nl', nld: 'nl',
}

/** A track's language as ISO 639-1 — null when the file doesn't say ("und"). */
export function trackLanguage(track: Pick<DebridAudioTrack, 'langIso' | 'lang'>): AudioLanguage | null {
  const iso = (track.langIso || '').toLowerCase()
  if (iso.length === 2) return iso
  if (ISO_639_2[iso]) return ISO_639_2[iso]
  const byName = Object.entries(LANGUAGE_NAMES).find(([, name]) => name.toLowerCase() === (track.lang || '').toLowerCase())
  return byName ? byName[0] : null
}

const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English', hi: 'Hindi', ta: 'Tamil', te: 'Telugu', ml: 'Malayalam', kn: 'Kannada', bn: 'Bengali', mr: 'Marathi',
  pa: 'Punjabi', gu: 'Gujarati', ur: 'Urdu', ja: 'Japanese', ko: 'Korean', zh: 'Chinese', es: 'Spanish', fr: 'French',
  de: 'German', it: 'Italian', ru: 'Russian', uk: 'Ukrainian', pl: 'Polish', pt: 'Portuguese', ar: 'Arabic', tr: 'Turkish',
  th: 'Thai', id: 'Indonesian', vi: 'Vietnamese', nl: 'Dutch',
}

/** "Hindi" — a language's name, by ISO 639-1 code. */
export function languageName(lang: AudioLanguage): string {
  return LANGUAGE_NAMES[lang] ?? lang.toUpperCase()
}

/** "5.1", "Stereo" — how many channels, as people say it. */
export function channelLabel(channels: number | null): string | null {
  if (channels === null || !Number.isFinite(channels)) return null
  if (channels <= 1) return 'Mono'
  if (channels <= 2) return 'Stereo'
  if (channels > 5 && channels < 6) return '5.1'
  if (channels > 7 && channels < 8) return '7.1'
  return channels === 6 ? '5.1' : channels === 8 ? '7.1' : `${channels} ch`
}

/**
 * The track to play for `want`: the file's own track in that language;
 * else, for anything but English, the file's first track (a Hindi release
 * often leaves its tracks unlabelled, and puts its own language first);
 * else whatever Real-Debrid chose.
 */
export function pickAudioTrack(tracks: DebridAudioTrack[], want: AudioLanguage, current: string | null): string | null {
  const match = tracks.find((t) => trackLanguage(t) === want)
  if (match) return match.id
  if (want !== DEFAULT_AUDIO_LANGUAGE && tracks[0]) return tracks[0].id
  return current ?? tracks[0]?.id ?? null
}

/** The same file, set to play `trackId` — Real-Debrid's transcode of that track too, when the backend gave one. */
export function withAudioTrack(playback: DebridReadyPlayback, trackId: string): DebridReadyPlayback {
  const media = playback.media
  if (!media || media.selectedAudio === trackId || !media.audioTracks.some((t) => t.id === trackId)) return playback
  return {
    ...playback,
    media: { ...media, selectedAudio: trackId },
    hls: playback.hlsAudio?.[trackId] ?? playback.hls,
  }
}

/** The same file, set to play its track in `want` (see pickAudioTrack). */
export function withAudioLanguage(playback: DebridReadyPlayback, want: AudioLanguage): DebridReadyPlayback {
  const media = playback.media
  if (!media || media.audioTracks.length < 2) return playback
  const id = pickAudioTrack(media.audioTracks, want, media.selectedAudio)
  return id ? withAudioTrack(playback, id) : playback
}
