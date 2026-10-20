import { useQuery } from '@tanstack/react-query'
import {
  AUTHORS_CHOICE_MOVIES,
  AUTHORS_CHOICE_TV,
  AUTHORS_CHOICE_DOCUMENTARIES,
  AUTHORS_CHOICE_ANIME,
  type AuthorsChoiceItem,
} from '@/Data/authorsChoice'
import { fetchMediaSummaries } from '@/lib/api'
import { Media } from '@/lib/config'
import { MediaRow } from './MediaRow'

interface Props {
  onMediaClick: (media: Media) => void
  mode?: 'movie' | 'tv' | 'documentary' | 'anime' | 'all'
}

/** Posters in the row. */
const ROW_SIZE = 12
/** Asked for beyond the row, so a title TMDB no longer has doesn't leave a gap. */
const SPARE = 2

const TITLES: Record<NonNullable<Props['mode']>, string> = {
  movie: "Author's Choice: Movies",
  tv: "Author's Choice: TV Shows",
  documentary: "Author's Choice: Documentaries",
  anime: "Author's Choice: Anime",
  all: "Author's Choice",
}

/** Fisher–Yates — `sort(() => Math.random() - 0.5)` is biased toward the original order. */
function shuffled<T>(items: T[]): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/** The hand-picked titles this row shows, best first — only what fits in the row is fetched. */
function picksFor(mode: NonNullable<Props['mode']>): AuthorsChoiceItem[] {
  switch (mode) {
    case 'movie':
      return AUTHORS_CHOICE_MOVIES
    case 'tv':
      return AUTHORS_CHOICE_TV
    case 'documentary':
      return AUTHORS_CHOICE_DOCUMENTARIES
    case 'anime':
      return AUTHORS_CHOICE_ANIME
    default:
      // A taste of each list
      return shuffled([
        ...AUTHORS_CHOICE_MOVIES.slice(0, 5),
        ...AUTHORS_CHOICE_TV.slice(0, 5),
        ...AUTHORS_CHOICE_DOCUMENTARIES.slice(0, 5),
        ...AUTHORS_CHOICE_ANIME.slice(0, 5),
      ])
  }
}

export function AuthorsChoiceSection({ onMediaClick, mode = 'movie' }: Props) {
  // One batched request for the row's posters, cached for the session: the
  // list only changes with a deploy. (It used to fetch full details —
  // credits, similar titles, images — for every title in the list, all 60
  // movies of it, to show 12.)
  const { data: media = [], isPending } = useQuery({
    queryKey: ['authorsChoice', mode],
    queryFn: async () => (await fetchMediaSummaries(picksFor(mode).slice(0, ROW_SIZE + SPARE))).slice(0, ROW_SIZE),
    staleTime: Infinity,
    gcTime: 60 * 60 * 1000,
  })

  return (
    <MediaRow
      title={TITLES[mode]}
      strapline="Hand-picked recommendations by the creator of StreamVault"
      media={media}
      isPending={isPending}
      onMediaClick={onMediaClick}
    />
  )
}
