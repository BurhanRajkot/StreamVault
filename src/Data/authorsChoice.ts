export type AuthorsChoiceItem = {
  tmdbId: number
  mediaType: 'movie' | 'tv'
  note?: string
}

export const AUTHORS_CHOICE: AuthorsChoiceItem[] = [
  // 🎬 MOVIES
  {
    tmdbId: 238,
    mediaType: 'movie',
    note: 'Timeless storytelling and character depth.',
  }, // Godfather
  { tmdbId: 278, mediaType: 'movie', note: 'Hope, patience, and freedom.' }, // Shawshank
  { tmdbId: 240, mediaType: 'movie', note: 'Masterclass in crime cinema.' }, // Godfather II
  { tmdbId: 424, mediaType: 'movie', note: 'The psychology of chaos.' }, // Dark Knight
  { tmdbId: 680, mediaType: 'movie', note: 'Life, love, and destiny.' }, // Pulp Fiction
  { tmdbId: 13, mediaType: 'movie', note: 'Simple kindness goes far.' }, // Forrest Gump
  { tmdbId: 122, mediaType: 'movie', note: 'Epic fantasy done right.' }, // LOTR
  {
    tmdbId: 155,
    mediaType: 'movie',
    note: 'A villain that defined a generation.',
  }, // Dark Knight
  { tmdbId: 27205, mediaType: 'movie', note: 'Dreams inside dreams.' }, // Inception
  { tmdbId: 603, mediaType: 'movie', note: 'Reality questioned.' }, // Matrix

  // 📺 TV SHOWS
  {
    tmdbId: 1396,
    mediaType: 'tv',
    note: 'One of the best character arcs ever.',
  }, // Breaking Bad
  { tmdbId: 1399, mediaType: 'tv', note: 'Power, politics, and betrayal.' }, // Game of Thrones
  { tmdbId: 66732, mediaType: 'tv', note: 'Time, grief, and science fiction.' }, // Stranger Things
  { tmdbId: 1402, mediaType: 'tv', note: 'Crime, journalism, and realism.' }, // The Wire
  { tmdbId: 94605, mediaType: 'tv', note: 'Morality in a collapsing world.' }, // Arcane
  {
    tmdbId: 63174,
    mediaType: 'tv',
    note: 'Technology and its dark reflections.',
  }, // Black Mirror
  { tmdbId: 82856, mediaType: 'tv', note: 'The cost of ambition.' }, // The Boys
  { tmdbId: 1418, mediaType: 'tv', note: 'Mob life and mental health.' }, // Sopranos
  { tmdbId: 60625, mediaType: 'tv', note: 'Survival and human nature.' }, // Peaky Blinders
  { tmdbId: 456, mediaType: 'tv', note: 'Family, power, and legacy.' }, // Simpsons
]
