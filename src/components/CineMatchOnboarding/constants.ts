import type { CuratedTitle } from './types'

export const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000'
export const POSTER_BASE = 'https://image.tmdb.org/t/p/w342'
export const MIN_SELECTIONS = 5

// These seed the CineMatch recommendation engine on first login.
export const CURATED_TITLES: CuratedTitle[] = [
  // Action
  { tmdbId: 155,    mediaType: 'movie', title: 'The Dark Knight',         genre: 'Action',    posterPath: '/qJ2tW6WMUDux911r6m7haRef0WH.jpg' },
  { tmdbId: 76341,  mediaType: 'movie', title: 'Mad Max: Fury Road',      genre: 'Action',    posterPath: '/8tZYtuWezp8JbcsvHYO0O46tFbo.jpg' },
  { tmdbId: 245891, mediaType: 'movie', title: 'John Wick',               genre: 'Action',    posterPath: '/fZPSd91yGE9fCcCe6OoQr6E3Bev.jpg' },
  { tmdbId: 299534, mediaType: 'movie', title: 'Avengers: Endgame',       genre: 'Action',    posterPath: '/or06FN3Dka5tukK1e9sl16pB3iy.jpg' },
  // Sci-Fi
  { tmdbId: 27205,  mediaType: 'movie', title: 'Inception',               genre: 'Sci-Fi',   posterPath: '/ljsZTbVsrQSqZgWeep2B1QiDKuh.jpg' },
  { tmdbId: 157336, mediaType: 'movie', title: 'Interstellar',            genre: 'Sci-Fi',   posterPath: '/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg' },
  { tmdbId: 438631, mediaType: 'movie', title: 'Dune',                    genre: 'Sci-Fi',   posterPath: '/gDzOcq0pfeCeqMBwKIJlSmQpjkZ.jpg' },
  { tmdbId: 603,    mediaType: 'movie', title: 'The Matrix',              genre: 'Sci-Fi',   posterPath: '/f89U3ADr1oiB1s9GkdPOEpXUk5H.jpg' },
  { tmdbId: 335984, mediaType: 'movie', title: 'Blade Runner 2049',       genre: 'Sci-Fi',   posterPath: '/gajva2L0rPYkEWjzgFlBXCAVBE5.jpg' },
  // Drama
  { tmdbId: 238,    mediaType: 'movie', title: 'The Godfather',           genre: 'Drama',    posterPath: '/3bhkrj58Vtu7enYsRolD1fZdja1.jpg' },
  { tmdbId: 278,    mediaType: 'movie', title: 'The Shawshank Redemption',genre: 'Drama',    posterPath: '/q6y0Go1tsGEsmtFryDOJo3dEmqu.jpg' },
  { tmdbId: 496243, mediaType: 'movie', title: 'Parasite',                genre: 'Drama',    posterPath: '/7IiTTgloJzvGI1TAYymCfbfl3vT.jpg' },
  { tmdbId: 13,     mediaType: 'movie', title: 'Forrest Gump',            genre: 'Drama',    posterPath: '/saHP97rTPS5eLmrLQEcANmKrsFl.jpg' },
  { tmdbId: 87108,  mediaType: 'tv',    title: 'Chernobyl',               genre: 'Drama',    posterPath: '/hlLXt2tOPT6RRnjiUmoxyG1LTFi.jpg' },
  // Thriller
  { tmdbId: 22970,  mediaType: 'movie', title: 'Shutter Island',          genre: 'Thriller', posterPath: '/zZZe5wn0udlhMtdlDjN4NB72R6e.jpg' },
  { tmdbId: 680,    mediaType: 'movie', title: 'Pulp Fiction',            genre: 'Thriller', posterPath: '/plnlrtBUULT0rh3Xsjmpubiso3L.jpg' },
  // Horror
  { tmdbId: 419430, mediaType: 'movie', title: 'Get Out',                 genre: 'Horror',   posterPath: '/tFXcEccSQMf3lfhfXKSU9iRBpa3.jpg' },
  // Romance
  { tmdbId: 313369, mediaType: 'movie', title: 'La La Land',              genre: 'Romance',  posterPath: '/uDO8zWDhfWwoFdKS4fzkUJt0Rf0.jpg' },
  { tmdbId: 597,    mediaType: 'movie', title: 'Titanic',                 genre: 'Romance',  posterPath: '/9xjZS2rlVxm8SFx8kPC3aIGCOYQ.jpg' },
  // Comedy / Sitcom
  { tmdbId: 2316,   mediaType: 'tv',    title: 'The Office',              genre: 'Comedy',   posterPath: '/qWnJzyZhyy74gjpSjIXWmuk0ifX.jpg' },
  { tmdbId: 48891,  mediaType: 'tv',    title: 'Brooklyn Nine-Nine',      genre: 'Comedy',   posterPath: '/A3SymGlOHefSKbz1bCOz56moupS.jpg' },
  { tmdbId: 1668,   mediaType: 'tv',    title: 'Friends',                 genre: 'Comedy',   posterPath: '/f496cm9enuEsZkSPzCwnTESEK5s.jpg' },
  // Animation
  { tmdbId: 129,    mediaType: 'movie', title: 'Spirited Away',           genre: 'Animation',posterPath: '/39wmItIWsg5sZMyRUHLkWBcuVCM.jpg' },
  { tmdbId: 324857, mediaType: 'movie', title: 'Into the Spider-Verse',   genre: 'Animation',posterPath: '/iiZZdoQBEYBv6id8su7ImL0oCbD.jpg' },
  { tmdbId: 862,    mediaType: 'movie', title: 'Toy Story',               genre: 'Animation',posterPath: '/uXDfjJbdP4ijW5hWSBrPrlKpxab.jpg' },
  // Crime
  { tmdbId: 1396,   mediaType: 'tv',    title: 'Breaking Bad',            genre: 'Crime',    posterPath: '/ggFHVNu6YYI5L9pCfOacjizRGt.jpg' },
  { tmdbId: 60574,  mediaType: 'tv',    title: 'Peaky Blinders',          genre: 'Crime',    posterPath: '/vUUqzWa2LnHIVqkaKVlVGkVcZIW.jpg' },
  { tmdbId: 63351,  mediaType: 'tv',    title: 'Narcos',                  genre: 'Crime',    posterPath: '/rTmal9fDbwh5F0waol2hq35U4ah.jpg' },
  // Fantasy / Epic
  { tmdbId: 1399,   mediaType: 'tv',    title: 'Game of Thrones',         genre: 'Fantasy',  posterPath: '/u3bZgnGQ9T01sWNhyveQz0wH0Hl.jpg' },
  { tmdbId: 66732,  mediaType: 'tv',    title: 'Stranger Things',         genre: 'Sci-Fi',   posterPath: '/uOOtwVbSr4QDjAGIifLDwpb2Pdl.jpg' },
  // Anime
  { tmdbId: 1429,   mediaType: 'tv',    title: 'Attack on Titan',         genre: 'Anime',    posterPath: '/hTP1DtLGFamjfu8WqjnuQdP1n4i.jpg' },
  { tmdbId: 372058, mediaType: 'movie', title: 'Your Name',               genre: 'Anime',    posterPath: '/q719jXXEzOoYaps6babgKnONONX.jpg' },
]

export const GENRE_COLORS: Record<string, string> = {
  'Action':    'bg-red-500/80',
  'Sci-Fi':    'bg-blue-500/80',
  'Drama':     'bg-purple-500/80',
  'Thriller':  'bg-orange-500/80',
  'Horror':    'bg-red-800/80',
  'Romance':   'bg-pink-500/80',
  'Comedy':    'bg-yellow-500/80',
  'Animation': 'bg-green-500/80',
  'Crime':     'bg-zinc-500/80',
  'Fantasy':   'bg-indigo-500/80',
  'Anime':     'bg-rose-500/80',
}
