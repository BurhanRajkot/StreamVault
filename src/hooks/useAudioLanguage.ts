import { useCallback, useMemo, useState } from 'react'
import { audioBaseFor, audioLanguageChoices, audioLanguageFor, rememberAudioLanguage, type AudioLanguage } from '@/lib/audioLanguage'

interface TitleLanguageInfo {
  id: number
  original_language?: string
  genres?: { id: number }[]
  genre_ids?: number[]
}

/**
 * The language a title's Premium playback is in (lib/audioLanguage), and
 * the way to change it from the player — kept for the title, so the next
 * episode plays in it too.
 */
export function useAudioLanguage(media: TitleLanguageInfo, kind: 'movie' | 'tv') {
  const [picked, setPicked] = useState<{ key: string; lang: AudioLanguage } | null>(null)
  const key = `${kind}:${media.id}`
  const fallback = useMemo(() => audioLanguageFor(media, kind), [media, kind])
  const audioLanguage = picked?.key === key ? picked.lang : fallback
  const onAudioLanguageChange = useCallback(
    (lang: AudioLanguage) => {
      rememberAudioLanguage(kind, media.id, lang)
      setPicked({ key, lang })
    },
    [kind, media.id, key]
  )
  const audioBase = audioBaseFor(media)
  const languageChoices = useMemo(() => audioLanguageChoices(media), [media])
  return { audioLanguage, audioBase, languageChoices, onAudioLanguageChange }
}
