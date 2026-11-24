/**
 * A release's audio languages — from its name ("Hindi", "Hin.Tam.Tel.Eng",
 * "Dual Audio [Hindi + English]") and from the tags Torrentio lists under
 * it (🇮🇳, 🇬🇧 / 🇮🇳, "Multi Audio").
 *
 * The release search keeps (and puts first) the releases in the language
 * the viewer plays a title in — Hindi for a Hindi original such as The
 * Family Man, English otherwise. Mirrored in src/lib/audioLanguage.ts —
 * keep the two in step.
 */

/** Torrentio's tags under a result → ISO 639-1. Its 🇮🇳 covers every Indian language: "in". */
const TORRENTIO_TAGS: Record<string, string> = {
  '🇬🇧': 'en',
  '🇺🇸': 'en',
  '🇮🇳': 'in',
  '🇯🇵': 'ja',
  '🇰🇷': 'ko',
  '🇨🇳': 'zh',
  '🇹🇼': 'zh',
  '🇪🇸': 'es',
  '🇲🇽': 'es',
  '🇫🇷': 'fr',
  '🇩🇪': 'de',
  '🇮🇹': 'it',
  '🇷🇺': 'ru',
  '🇺🇦': 'uk',
  '🇵🇱': 'pl',
  '🇵🇹': 'pt',
  '🇧🇷': 'pt',
  '🇳🇱': 'nl',
  '🇹🇷': 'tr',
  '🇸🇦': 'ar',
  '🇹🇭': 'th',
  '🇻🇳': 'vi',
  '🇮🇩': 'id',
}

/**
 * The languages Torrentio tags a result with — the last line of its title,
 * e.g. "Multi Subs / 🇬🇧 / 🇮🇳" or "Dual Audio / 🇬🇧 / 🇮🇳". "Multi Subs"
 * is about subtitles and says nothing about the audio; "Dubbed" says there's
 * a dub ("dub"), which anime reads (animeAudio).
 */
export function torrentioLanguages(title: string | undefined): string[] {
  const lines = (title || '').split('\n')
  const last = lines[lines.length - 1] ?? ''
  if (lines.length < 2 || /👤|💾/.test(last)) return []
  const langs = new Set<string>()
  for (const part of last.split('/').map((p) => p.trim())) {
    if (/^(Dual|Multi) Audio$/i.test(part)) langs.add('multi')
    else if (/^Dubbed$/i.test(part)) langs.add('dub')
    else if (TORRENTIO_TAGS[part]) langs.add(TORRENTIO_TAGS[part])
  }
  return [...langs]
}

const INDIAN_LANGUAGES = new Set(['hi', 'ta', 'te', 'ml', 'kn', 'bn', 'mr', 'pa', 'gu'])

/** Language words release names use. Short tags only where they can't be part of a title (no "BEN", "MAL"). */
const NAME_LANGUAGES: [RegExp, string][] = [
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

/** The languages a release declares, by its name and its Torrentio tags. */
export function releaseLanguages(name: string, tagged: string[] = []): Set<string> {
  const text = name.replace(SUBTITLE_MENTION_RE, ' ')
  const langs = new Set<string>(tagged.filter((t) => t !== 'dub'))
  for (const [re, lang] of NAME_LANGUAGES) if (re.test(text)) langs.add(lang)
  if (/\b(Dual|MULTi)([ ._-]?Audio)?\b/i.test(text)) langs.add('multi')
  if (langs.has('in') && [...langs].some((l) => INDIAN_LANGUAGES.has(l))) langs.delete('in')
  return langs
}

/**
 * How well a release fits the wanted language — 0 best. English: 0 = says
 * English or nothing (the usual case), 1 = other languages only (also
 * `nonEnglish`, the name-based check). Others: 0 = has it, 1 = may have it
 * (🇮🇳 for an Indian language, several audio tracks), 2 = doesn't say,
 * 3 = other languages only.
 */
export function releaseLanguageRank(name: string, tagged: string[] | undefined, want: string, nonEnglish: boolean, base = 'en'): number {
  if (base === 'ja') return animeRank(name, tagged ?? [], want)
  const langs = releaseLanguages(name, tagged)
  if (want === 'en') {
    if (langs.has('en') || langs.has('multi')) return 0
    return langs.size > 0 || nonEnglish ? 1 : 0
  }
  if (langs.has(want)) return 0
  if (langs.has('multi') || (langs.has('in') && INDIAN_LANGUAGES.has(want))) return 1
  if (langs.size === 0 && !nonEnglish) return 2
  return 3
}

// ---------------------------------------------------------------------------
// Anime: a release that names no language is Japanese (SubsPlease,
// Erai-raws); the English ones say "Dual Audio", "Multi-Dub" or "English
// Dub"; Torrentio's flags under them are mostly subtitle languages.
// ---------------------------------------------------------------------------

const ANIME_MULTI_RE = /\b(Dual|Multi)[ ._-]?(Audio|Dub)\b|\bMULTi\b|\bDUAL\b/i
const ANIME_ENGLISH_DUB_RE = /\b(English|Eng)[ ._-]?Dub(bed)?\b|\bDub(bed)?[ ._-]?(English|Eng)\b/i
const ANIME_OTHER_DUB_RE = /\b(Ger|German|Ita|Italian|Fre|French|Spa|Spanish|Latino|Rus|Russian|Por|Portuguese|Hindi|Tamil|Telugu|Arabic)[ ._-]?Dub(bed)?\b/i
const JAPANESE_NAMED_RE = /\bJAP(anese)?\b|\bJPN\b/i
const CYRILLIC_RE = /[Ѐ-ӿ]/

/** Japanese: 0 = has it, 3 = a dub only. English: 0 = an English dub, 1 = dual audio, 2 = Japanese only, 3 = another dub. */
function animeRank(name: string, tags: string[], want: string): number {
  const multi = ANIME_MULTI_RE.test(name) || tags.includes('multi')
  const flagged = tags.filter((t) => t.length === 2 && t !== 'in')
  const englishDub = ANIME_ENGLISH_DUB_RE.test(name) || (!multi && tags.includes('dub') && flagged.length === 1 && flagged[0] === 'en')
  const otherDub =
    ANIME_OTHER_DUB_RE.test(name) || (!multi && !englishDub && tags.includes('dub')) || (CYRILLIC_RE.test(name) && !JAPANESE_NAMED_RE.test(name))
  const japanese = multi || JAPANESE_NAMED_RE.test(name) || !(englishDub || otherDub)
  if (want === 'ja') return japanese ? 0 : 3
  if (want === 'en') return englishDub ? 0 : multi ? 1 : japanese ? 2 : 3
  return releaseLanguages(name, tags).has(want) ? 0 : multi ? 1 : 3
}
