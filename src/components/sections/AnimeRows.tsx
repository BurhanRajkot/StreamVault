import { useQuery } from '@tanstack/react-query'
import { fetchAnimeRow, type AnimeRowKind } from '@/lib/api'
import { Media } from '@/lib/config'
import { MediaRow } from './MediaRow'

const ROWS: { kind: AnimeRowKind; title: string }[] = [
  { kind: 'series', title: 'Popular Anime Series' },
  { kind: 'movies', title: 'Anime Movies' },
  { kind: 'top-rated', title: 'Top Rated Anime' },
  { kind: 'new', title: 'New Anime Releases' },
]

/** Posters in a row. */
const ROW_SIZE = 20

function AnimeRow({ kind, title, onMediaClick }: { kind: AnimeRowKind; title: string; onMediaClick: (media: Media) => void }) {
  const { data: media = [], isPending } = useQuery({
    queryKey: ['animeRow', kind],
    queryFn: async () => (await fetchAnimeRow(kind)).filter((m) => m.poster_path).slice(0, ROW_SIZE),
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
  })

  return <MediaRow title={title} media={media} isPending={isPending} onMediaClick={onMediaClick} />
}

/** The Anime tab's browse rows: series and films apart, the best rated, and the newest. */
export function AnimeRows({ onMediaClick }: { onMediaClick: (media: Media) => void }) {
  return (
    <>
      {ROWS.map(({ kind, title }) => (
        <AnimeRow key={kind} kind={kind} title={title} onMediaClick={onMediaClick} />
      ))}
    </>
  )
}
