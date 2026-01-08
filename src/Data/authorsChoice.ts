export type AuthorsChoiceItem = {
  tmdbId: number
  mediaType: 'movie' | 'tv'
  note?: string
}

export const AUTHORS_CHOICE: AuthorsChoiceItem[] = [
  {
    tmdbId: 238, // The Godfather
    mediaType: 'movie',
    note: 'Timeless storytelling and character depth.',
  },
  {
    tmdbId: 278, // Shawshank Redemption
    mediaType: 'movie',
    note: 'Hope, patience, and freedom.',
  },
  {
    tmdbId: 1396, // Breaking Bad
    mediaType: 'tv',
    note: 'One of the best-written character arcs ever.',
  },
  {
    tmdbId: 66732, // Stranger Things
    mediaType: 'tv',
    note: 'Nostalgia done right with great suspense.',
  },
]
