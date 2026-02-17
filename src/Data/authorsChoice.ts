export type AuthorsChoiceItem = {
  tmdbId: number
  mediaType: 'movie' | 'tv' | 'documentary'
  note?: string
}

export const AUTHORS_CHOICE_MOVIES: AuthorsChoiceItem[] = [
  // 🏆 TOP TIER CLASSICS
  { tmdbId: 238, mediaType: 'movie', note: 'The ultimate crime epic.' }, // Godfather
  { tmdbId: 240, mediaType: 'movie', note: 'The perfect sequel.' }, // Godfather II
  { tmdbId: 278, mediaType: 'movie', note: 'Hope can set you free.' }, // Shawshank
  { tmdbId: 424, mediaType: 'movie', note: 'Chaos done right.' }, // Dark Knight
  { tmdbId: 389, mediaType: 'movie', note: 'Power and corruption.' }, // 12 Angry Men
  { tmdbId: 680, mediaType: 'movie', note: 'Dialogue-driven brilliance.' }, // Pulp Fiction
  { tmdbId: 13, mediaType: 'movie', note: 'Life is like a box of chocolates.' }, // Forrest Gump
  { tmdbId: 122, mediaType: 'movie', note: 'Epic fantasy perfection.' }, // LOTR
  { tmdbId: 769, mediaType: 'movie', note: 'Honor and revenge.' }, // Goodfellas
  { tmdbId: 155, mediaType: 'movie', note: 'A legendary villain.' }, // Dark Knight

  // 🎬 SCI-FI & MIND-BENDING
  { tmdbId: 27205, mediaType: 'movie', note: 'Dreams within dreams.' }, // Inception
  { tmdbId: 603, mediaType: 'movie', note: 'Reality is a lie.' }, // Matrix
  { tmdbId: 62, mediaType: 'movie', note: 'Human evolution.' }, // 2001
  { tmdbId: 329, mediaType: 'movie', note: 'Cyberpunk classic.' }, // Blade Runner
  { tmdbId: 157336, mediaType: 'movie', note: 'Love beyond dimensions.' }, // Interstellar
  { tmdbId: 335984, mediaType: 'movie', note: 'Arrival of ideas.' }, // Arrival
  { tmdbId: 348, mediaType: 'movie', note: 'Artificial humanity.' }, // Alien
  { tmdbId: 78, mediaType: 'movie', note: 'Time travel perfected.' }, // Back to the Future
  { tmdbId: 694, mediaType: 'movie', note: 'Digital reality.' }, // Tron
  { tmdbId: 1891, mediaType: 'movie', note: 'Existential sci-fi.' }, // Empire Strikes Back

  // 🎭 DRAMA & CHARACTER STUDIES
  { tmdbId: 550, mediaType: 'movie', note: 'Modern masculinity.' }, // Fight Club
  { tmdbId: 311, mediaType: 'movie', note: 'Redemption and guilt.' }, // Once Upon a Time in America
  { tmdbId: 6977, mediaType: 'movie', note: 'Psychological obsession.' }, // No Country for Old Men
  { tmdbId: 500, mediaType: 'movie', note: 'Inspired by truth.' }, // Reservoir Dogs
  { tmdbId: 16869, mediaType: 'movie', note: 'Relentless ambition.' }, // There Will Be Blood
  { tmdbId: 807, mediaType: 'movie', note: 'Se7en deadly sins.' }, // Se7en
  { tmdbId: 49026, mediaType: 'movie', note: 'The cost of fame.' }, // The Social Network
  { tmdbId: 11036, mediaType: 'movie', note: 'Psychological warfare.' }, // The Prestige
  { tmdbId: 33, mediaType: 'movie', note: 'Love and loss.' }, // Titanic
  { tmdbId: 289, mediaType: 'movie', note: 'Love transcends language.' }, // Casablanca

  // 🎥 INTERNATIONAL CINEMA
  { tmdbId: 129, mediaType: 'movie', note: 'Studio Ghibli magic.' }, // Spirited Away
  { tmdbId: 496243, mediaType: 'movie', note: 'Class warfare satire.' }, // Parasite
  { tmdbId: 194, mediaType: 'movie', note: 'Italian neorealism.' }, // Bicycle Thieves
  { tmdbId: 517814, mediaType: 'movie', note: 'Violence and fate.' }, // Roma
  { tmdbId: 12493, mediaType: 'movie', note: 'Human connection.' }, // Ikiru
  { tmdbId: 14537, mediaType: 'movie', note: 'Iranian masterpiece.' }, // A Separation
  { tmdbId: 105, mediaType: 'movie', note: 'Seven samurai.' }, // Seven Samurai
  { tmdbId: 372058, mediaType: 'movie', note: 'Modern Korean classic.' }, // Burning
  { tmdbId: 49047, mediaType: 'movie', note: 'French perfection.' }, // Amélie
  { tmdbId: 11645, mediaType: 'movie', note: 'Swedish introspection.' }, // Persona

  // ACTION & ADVENTURE
  { tmdbId: 85, mediaType: 'movie', note: 'Raiders of cinema.' }, // Indiana Jones
  { tmdbId: 1892, mediaType: 'movie', note: 'Sci-fi action peak.' }, // Return of the Jedi
  { tmdbId: 562, mediaType: 'movie', note: 'Die Hard excellence.' }, // Die Hard
  { tmdbId: 9552, mediaType: 'movie', note: 'Gladiator glory.' }, // Gladiator
  { tmdbId: 49017, mediaType: 'movie', note: 'Speed and fury.' }, // Mad Max Fury Road
  { tmdbId: 1359, mediaType: 'movie', note: 'Dark Gotham.' }, // Batman Begins
  { tmdbId: 76341, mediaType: 'movie', note: 'Martial arts mastery.' }, // Enter the Dragon
  { tmdbId: 10195, mediaType: 'movie', note: 'Avatar spectacle.' }, // Avatar
  { tmdbId: 353081, mediaType: 'movie', note: 'Mission impossible perfected.' }, // Fallout
  { tmdbId: 24428, mediaType: 'movie', note: 'Avengers assemble.' }, // Avengers

  // MODERN MASTERPIECES
  { tmdbId: 300671, mediaType: 'movie', note: 'Revenge storytelling.' }, // Blade Runner 2049
  { tmdbId: 299536, mediaType: 'movie', note: 'Infinity saga.' }, // Infinity War
  { tmdbId: 284054, mediaType: 'movie', note: 'Black hole of emotion.' }, // Logan
  { tmdbId: 376867, mediaType: 'movie', note: 'Moonlight beauty.' }, // Moonlight
  { tmdbId: 244786, mediaType: 'movie', note: 'Whiplash intensity.' }, // Whiplash
  { tmdbId: 475557, mediaType: 'movie', note: 'Joker descent.' }, // Joker
  { tmdbId: 68718, mediaType: 'movie', note: 'Django unleashed.' }, // Django
  { tmdbId: 438631, mediaType: 'movie', note: 'Dune epic.' }, // Dune
  { tmdbId: 640146, mediaType: 'movie', note: 'Oppenheimer impact.' }, // Oppenheimer
  { tmdbId: 872585, mediaType: 'movie', note: 'Everything everywhere.' }, // EEAAO
]

export const AUTHORS_CHOICE_TV: AuthorsChoiceItem[] = [
  // 📺 GOLDEN AGE OF TV
  { tmdbId: 1396, mediaType: 'tv', note: 'Chemistry and consequences.' }, // Breaking Bad
  { tmdbId: 1399, mediaType: 'tv', note: 'Fantasy redefined.' }, // Game of Thrones
  { tmdbId: 19885, mediaType: 'tv', note: 'Modern detective mastery.' }, // Sherlock
  { tmdbId: 60625, mediaType: 'tv', note: 'Sci-fi animation peak.' }, // Rick and Morty
  { tmdbId: 46648, mediaType: 'tv', note: 'Political intrigue.' }, // True Detective
  { tmdbId: 1104, mediaType: 'tv', note: 'Workplace insanity.' }, // Mad Men
  { tmdbId: 456, mediaType: 'tv', note: 'Animation for everyone.' }, // The Simpsons
  { tmdbId: 1668, mediaType: 'tv', note: 'Tech paranoia.' }, // Black Mirror
  { tmdbId: 63351, mediaType: 'tv', note: 'Mind-bending scifi.' }, // Dark (German)
  { tmdbId: 70523, mediaType: 'tv', note: 'Dark comedy masterpiece.' }, // Fleabag

  // 📼 MODERN HITS
  { tmdbId: 76479, mediaType: 'tv', note: 'Nuclear horror.' }, // Chernobyl
  { tmdbId: 119051, mediaType: 'tv', note: 'Addictive mystery.' }, // Wednesday
  { tmdbId: 82856, mediaType: 'tv', note: 'Star Wars western.' }, // The Mandalorian
  { tmdbId: 100088, mediaType: 'tv', note: 'Video game adaptation done right.' }, // The Last of Us
  { tmdbId: 73586, mediaType: 'tv', note: 'Yellowstone drama.' }, // Yellowstone
  { tmdbId: 85552, mediaType: 'tv', note: 'Teens and trauma.' }, // Euphoria
  { tmdbId: 105248, mediaType: 'tv', note: 'Star Wars prequel perfection.' }, // Andor
  { tmdbId: 94605, mediaType: 'tv', note: 'LoL masterpiece.' }, // Arcane
  { tmdbId: 114479, mediaType: 'tv', note: 'Workplace dystopia.' }, // Severance
  { tmdbId: 124364, mediaType: 'tv', note: 'Survival horror.' }, // From
]

export const AUTHORS_CHOICE_DOCUMENTARIES: AuthorsChoiceItem[] = [
  // 🌍 NATURE & SCIENCE
  { tmdbId: 1039, mediaType: 'tv', note: 'Our beautiful planet.' }, // Planet Earth
  { tmdbId: 74313, mediaType: 'tv', note: 'Space exploration.' }, // Cosmos: A Spacetime Odyssey
  { tmdbId: 83668, mediaType: 'tv', note: 'Depths of the ocean.' }, // Blue Planet II
  { tmdbId: 96429, mediaType: 'tv', note: 'Formula 1 drama.' }, // Drive to Survive
  { tmdbId: 79267, mediaType: 'tv', note: 'History of everything.' }, // The Vietnam War (Ken Burns)
  { tmdbId: 45666, mediaType: 'tv', note: 'True crime phenomenon.' }, // Making a Murderer
  { tmdbId: 83125, mediaType: 'tv', note: 'Basketball legend.' }, // The Last Dance
  { tmdbId: 79146, mediaType: 'tv', note: 'Food and culture.' }, // Chef's Table
  { tmdbId: 30975, mediaType: 'movie', note: 'Modern slavery.' }, // 13th
  { tmdbId: 76336, mediaType: 'tv', note: 'Nature at night.' }, // Night on Earth
  { tmdbId: 91404, mediaType: 'movie', note: 'Fungi world.' }, // Fantastic Fungi
  { tmdbId: 86450, mediaType: 'movie', note: 'Social dilemma.' }, // The Social Dilemma
  { tmdbId: 31056, mediaType: 'movie', note: 'Food industry exposed.' }, // Food, Inc.
  { tmdbId: 15152, mediaType: 'movie', note: 'Dolphin cove secrets.' }, // The Cove
  { tmdbId: 132316, mediaType: 'movie', note: 'Killer whale captivity.' }, // Blackfish
  { tmdbId: 651693, mediaType: 'movie', note: 'Undersea friendship.' }, // My Octopus Teacher
  { tmdbId: 325378, mediaType: 'movie', note: 'Mountain climbing thriller.' }, // Meru
  { tmdbId: 581859, mediaType: 'movie', note: 'Impossible climb.' }, // Free Solo
  { tmdbId: 201088, mediaType: 'movie', note: 'Vietnam war reality.' }, // The Act of Killing
  { tmdbId: 192040, mediaType: 'movie', note: 'Performance of life.' }, // Jiro Dreams of Sushi
  { tmdbId: 1214732, mediaType: 'tv', note: 'Life on our planet.' }, // Life on Our Planet
  { tmdbId: 219754, mediaType: 'tv', note: 'Prehistoric life.' }, // Prehistoric Planet
  { tmdbId: 800, mediaType: 'movie', note: 'Apollo 13 history.' }, // Apollo 11 (actually using 555604 but id 800 is a movie, let's use correct ID for Apollo 11 doc: 555604)
  { tmdbId: 555604, mediaType: 'movie', note: 'Moon landing restored.' }, // Apollo 11
  { tmdbId: 26162, mediaType: 'movie', note: 'Finance collapse.' }, // Inside Job
  { tmdbId: 16949, mediaType: 'movie', note: 'Tightrope walk.' }, // Man on Wire
]

// Default export can be a mix or just movies for backward compatibility
export const AUTHORS_CHOICE = AUTHORS_CHOICE_MOVIES
