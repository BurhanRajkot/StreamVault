/**
 * Which language a Premium film or episode plays in.
 *
 * A title plays in its original language when that's Hindi (The Family
 * Man, Jawan, Panchayat...) or when it's anime (Japanese), and in English
 * otherwise. The other choice is always there — English for those, Hindi
 * for the rest — on the title page and in the player's settings; the pick is
 * kept per title, so the next episode plays in it too.
 *
 * Anime releases say it the other way round: one that names no language is
 * Japanese (SubsPlease, Erai-raws), the English ones say "Dual Audio",
 * "Multi-Dub" or "English Dub", and Torrentio's flags under them are mostly
 * subtitle languages — so anime has rules of its own (`animeAudio`).
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

const JAPANESE: AudioLanguage = 'ja'

/**
 * The language a title's releases are in when they don't say: Japanese for
 * anime, English for everything else.
 */
export function audioBaseFor(media: TitleLanguageInfo): AudioLanguage {
  return isAnime(media) ? JAPANESE : DEFAULT_AUDIO_LANGUAGE
}

/** The languages offered for a title, its own first: Japanese · English for anime, Hindi · English, English · Hindi. */
export function audioLanguageChoices(media: TitleLanguageInfo): AudioLanguage[] {
  if (isAnime(media)) return [JAPANESE, DEFAULT_AUDIO_LANGUAGE]
  return media.original_language === 'hi' ? ['hi', DEFAULT_AUDIO_LANGUAGE] : [DEFAULT_AUDIO_LANGUAGE, 'hi']
}

const storageKey = (kind: string, id: number) => `sv:audio-lang:${kind}:${id}`

/** The language a title plays in: the viewer's own pick for it, else its original language for anime and Hindi titles, else English. */
export function audioLanguageFor(media: TitleLanguageInfo, kind: 'movie' | 'tv'): AudioLanguage {
  try {
    const picked = localStorage.getItem(storageKey(kind, media.id))
    if (picked && /^[a-z]{2}$/.test(picked)) return picked
  } catch {
    // No storage: the title's own language
  }
  if (isAnime(media)) return JAPANESE
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
  // "Dubbed" says there's a dub, not which language: anime reads it (animeAudio)
  for (const lang of release.languages ?? []) if (lang !== 'dub') langs.add(lang)
  // A named Indian language says which one Torrentio's 🇮🇳 meant
  if (langs.has('in') && [...langs].some((l) => INDIAN_LANGUAGES.has(l))) langs.delete('in')
  return langs
}

/**
 * How well a release fits the wanted language — 0 best. `base` is the
 * language its releases are in when they don't say (audioBaseFor).
 *   The base language: 0 = has it or doesn't say (the usual case), 1 = other languages only.
 *   Others: 0 = has it, 1 = may have it (Torrentio's 🇮🇳 for an Indian
 *   language, or several audio tracks), 2 = doesn't say (so likely the
 *   base language), 3 = other languages only.
 */
export function releaseLanguageRank(
  release: Pick<DebridRelease, 'name' | 'languages'>,
  want: AudioLanguage,
  base: AudioLanguage = DEFAULT_AUDIO_LANGUAGE
): number {
  if (base === JAPANESE) return animeRank(release, want)
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

/**
 * The release has this language: named, Torrentio's 🇮🇳 alone for an Indian
 * language, or — for the base language — not said otherwise.
 */
export function releaseHasLanguage(
  release: Pick<DebridRelease, 'name' | 'languages'>,
  lang: AudioLanguage,
  base: AudioLanguage = DEFAULT_AUDIO_LANGUAGE
): boolean {
  if (base === JAPANESE) {
    const anime = animeAudio(release)
    if (lang === JAPANESE) return anime.japanese
    if (lang === DEFAULT_AUDIO_LANGUAGE) return anime.englishDub || anime.multi
  }
  if (lang === base) return releaseLanguageRank(release, lang, base) === 0
  const langs = releaseLanguages(release)
  return langs.has(lang) || (INDIAN_LANGUAGES.has(lang) && langs.has('in'))
}

// ---------------------------------------------------------------------------
// Anime
// ---------------------------------------------------------------------------

/** "Dual Audio", "Multi-Dub", "MULTi": the Japanese and a dub (usually English) in one file. */
const ANIME_MULTI_RE = /\b(Dual|Multi)[ ._-]?(Audio|Dub)\b|\bMULTi\b|\bDUAL\b/i
const ANIME_ENGLISH_DUB_RE = /\b(English|Eng)[ ._-]?Dub(bed)?\b|\bDub(bed)?[ ._-]?(English|Eng)\b/i
const ANIME_OTHER_DUB_RE = /\b(Ger|German|Ita|Italian|Fre|French|Spa|Spanish|Latino|Rus|Russian|Por|Portuguese|Hindi|Tamil|Telugu|Arabic)[ ._-]?Dub(bed)?\b/i
const JAPANESE_NAMED_RE = /\bJAP(anese)?\b|\bJPN\b/i
const CYRILLIC_RE = /[\u0400-\u04FF]/

/**
 * What an anime release has: the Japanese unless it says it's a dub (or is
 * a Russian release that doesn't name the Japanese), an English dub when it
 * says so. Torrentio's flags are subtitle languages here, so only its
 * "Dual/Multi Audio" and "Dubbed" tags count.
 */
export function animeAudio(release: Pick<DebridRelease, 'name' | 'languages'>): {
  japanese: boolean
  englishDub: boolean
  multi: boolean
} {
  const name = release.name
  const tags = release.languages ?? []
  const multi = ANIME_MULTI_RE.test(name) || tags.includes('multi')
  const flagged = tags.filter((t) => t.length === 2 && t !== 'in')
  const englishDub = ANIME_ENGLISH_DUB_RE.test(name) || (!multi && tags.includes('dub') && flagged.length === 1 && flagged[0] === 'en')
  const otherDub =
    ANIME_OTHER_DUB_RE.test(name) || (!multi && !englishDub && tags.includes('dub')) || (CYRILLIC_RE.test(name) && !JAPANESE_NAMED_RE.test(name))
  const japanese = multi || JAPANESE_NAMED_RE.test(name) || !(englishDub || otherDub)
  return { japanese, englishDub, multi }
}

/** Japanese: 0 = has it, 3 = a dub only. English: 0 = an English dub, 1 = dual audio, 2 = Japanese only, 3 = another dub. */
function animeRank(release: Pick<DebridRelease, 'name' | 'languages'>, want: AudioLanguage): number {
  const anime = animeAudio(release)
  if (want === JAPANESE) return anime.japanese ? 0 : 3
  if (want === DEFAULT_AUDIO_LANGUAGE) return anime.englishDub ? 0 : anime.multi ? 1 : anime.japanese ? 2 : 3
  return releaseLanguages(release).has(want) ? 0 : anime.multi ? 1 : 3
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
