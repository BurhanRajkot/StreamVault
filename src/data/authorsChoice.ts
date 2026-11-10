export type AuthorsChoiceItem = {
  tmdbId: number
  mediaType: 'movie' | 'tv'
  note?: string
}

export const AUTHORS_CHOICE_MOVIES: AuthorsChoiceItem[] = [
  // 🏆 TOP TIER CLASSICS
  { tmdbId: 238, mediaType: 'movie', note: 'The ultimate crime epic.' }, // Godfather
  { tmdbId: 240, mediaType: 'movie', note: 'The perfect sequel.' }, // Godfather II
  { tmdbId: 278, mediaType: 'movie', note: 'Hope can set you free.' }, // Shawshank
  { tmdbId: 424, mediaType: 'movie', note: 'Humanity in the darkest hour.' }, // Schindler's List
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
  { tmdbId: 78, mediaType: 'movie', note: 'Cyberpunk classic.' }, // Blade Runner
  { tmdbId: 157336, mediaType: 'movie', note: 'Love beyond dimensions.' }, // Interstellar
  { tmdbId: 329865, mediaType: 'movie', note: 'Arrival of ideas.' }, // Arrival
  { tmdbId: 348, mediaType: 'movie', note: 'Artificial humanity.' }, // Alien
  { tmdbId: 105, mediaType: 'movie', note: 'Time travel perfected.' }, // Back to the Future
  { tmdbId: 97, mediaType: 'movie', note: 'Digital reality.' }, // Tron
  { tmdbId: 1891, mediaType: 'movie', note: 'Existential sci-fi.' }, // Empire Strikes Back

  // 🎭 DRAMA & CHARACTER STUDIES
  { tmdbId: 550, mediaType: 'movie', note: 'Modern masculinity.' }, // Fight Club
  { tmdbId: 311, mediaType: 'movie', note: 'Redemption and guilt.' }, // Once Upon a Time in America
  { tmdbId: 6977, mediaType: 'movie', note: 'Psychological obsession.' }, // No Country for Old Men
  { tmdbId: 500, mediaType: 'movie', note: 'Inspired by truth.' }, // Reservoir Dogs
  { tmdbId: 7345, mediaType: 'movie', note: 'Relentless ambition.' }, // There Will Be Blood
  { tmdbId: 807, mediaType: 'movie', note: 'Se7en deadly sins.' }, // Se7en
  { tmdbId: 37799, mediaType: 'movie', note: 'The cost of fame.' }, // The Social Network
  { tmdbId: 1124, mediaType: 'movie', note: 'Psychological warfare.' }, // The Prestige
  { tmdbId: 597, mediaType: 'movie', note: 'Love and loss.' }, // Titanic
  { tmdbId: 289, mediaType: 'movie', note: 'Love transcends language.' }, // Casablanca

  // 🎥 INTERNATIONAL CINEMA
  { tmdbId: 129, mediaType: 'movie', note: 'Studio Ghibli magic.' }, // Spirited Away
  { tmdbId: 496243, mediaType: 'movie', note: 'Class warfare satire.' }, // Parasite
  { tmdbId: 5156, mediaType: 'movie', note: 'Italian neorealism.' }, // Bicycle Thieves
  { tmdbId: 426426, mediaType: 'movie', note: 'Violence and fate.' }, // Roma
  { tmdbId: 3782, mediaType: 'movie', note: 'Human connection.' }, // Ikiru
  { tmdbId: 60243, mediaType: 'movie', note: 'Iranian masterpiece.' }, // A Separation
  { tmdbId: 346, mediaType: 'movie', note: 'Seven samurai.' }, // Seven Samurai
  { tmdbId: 491584, mediaType: 'movie', note: 'Modern Korean classic.' }, // Burning
  { tmdbId: 194, mediaType: 'movie', note: 'French perfection.' }, // Amélie
  { tmdbId: 797, mediaType: 'movie', note: 'Swedish introspection.' }, // Persona

  // ACTION & ADVENTURE
  { tmdbId: 85, mediaType: 'movie', note: 'Raiders of cinema.' }, // Indiana Jones
  { tmdbId: 1892, mediaType: 'movie', note: 'Sci-fi action peak.' }, // Return of the Jedi
  { tmdbId: 562, mediaType: 'movie', note: 'Die Hard excellence.' }, // Die Hard
  { tmdbId: 98, mediaType: 'movie', note: 'Gladiator glory.' }, // Gladiator
  { tmdbId: 76341, mediaType: 'movie', note: 'Speed and fury.' }, // Mad Max Fury Road
  { tmdbId: 272, mediaType: 'movie', note: 'Dark Gotham.' }, // Batman Begins
  { tmdbId: 9461, mediaType: 'movie', note: 'Martial arts mastery.' }, // Enter the Dragon
  { tmdbId: 19995, mediaType: 'movie', note: 'Avatar spectacle.' }, // Avatar
  { tmdbId: 353081, mediaType: 'movie', note: 'Mission impossible perfected.' }, // Fallout
  { tmdbId: 24428, mediaType: 'movie', note: 'Avengers assemble.' }, // Avengers

  // MODERN MASTERPIECES
  { tmdbId: 335984, mediaType: 'movie', note: 'Revenge storytelling.' }, // Blade Runner 2049
  { tmdbId: 299536, mediaType: 'movie', note: 'Infinity saga.' }, // Infinity War
  { tmdbId: 263115, mediaType: 'movie', note: 'Black hole of emotion.' }, // Logan
  { tmdbId: 376867, mediaType: 'movie', note: 'Moonlight beauty.' }, // Moonlight
  { tmdbId: 244786, mediaType: 'movie', note: 'Whiplash intensity.' }, // Whiplash
  { tmdbId: 475557, mediaType: 'movie', note: 'Joker descent.' }, // Joker
  { tmdbId: 68718, mediaType: 'movie', note: 'Django unleashed.' }, // Django
  { tmdbId: 438631, mediaType: 'movie', note: 'Dune epic.' }, // Dune
  { tmdbId: 872585, mediaType: 'movie', note: 'Oppenheimer impact.' }, // Oppenheimer
  { tmdbId: 545611, mediaType: 'movie', note: 'Everything everywhere.' }, // EEAAO
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
  { tmdbId: 42009, mediaType: 'tv', note: 'Tech paranoia.' }, // Black Mirror
  { tmdbId: 70523, mediaType: 'tv', note: 'Mind-bending scifi.' }, // Dark (German)
  { tmdbId: 67070, mediaType: 'tv', note: 'Dark comedy masterpiece.' }, // Fleabag

  // 📼 MODERN HITS
  { tmdbId: 87108, mediaType: 'tv', note: 'Nuclear horror.' }, // Chernobyl
  { tmdbId: 119051, mediaType: 'tv', note: 'Addictive mystery.' }, // Wednesday
  { tmdbId: 82856, mediaType: 'tv', note: 'Star Wars western.' }, // The Mandalorian
  { tmdbId: 100088, mediaType: 'tv', note: 'Video game adaptation done right.' }, // The Last of Us
  { tmdbId: 73586, mediaType: 'tv', note: 'Yellowstone drama.' }, // Yellowstone
  { tmdbId: 85552, mediaType: 'tv', note: 'Teens and trauma.' }, // Euphoria
  { tmdbId: 83867, mediaType: 'tv', note: 'Star Wars prequel perfection.' }, // Andor
  { tmdbId: 94605, mediaType: 'tv', note: 'LoL masterpiece.' }, // Arcane
  { tmdbId: 95396, mediaType: 'tv', note: 'Workplace dystopia.' }, // Severance
  { tmdbId: 124364, mediaType: 'tv', note: 'Survival horror.' }, // From
]

export const AUTHORS_CHOICE_DOCUMENTARIES: AuthorsChoiceItem[] = [
  // 🌍 NATURE & SCIENCE
  { tmdbId: 1044, mediaType: 'tv', note: 'Our beautiful planet.' }, // Planet Earth
  { tmdbId: 58474, mediaType: 'tv', note: 'Space exploration.' }, // Cosmos: A Spacetime Odyssey
  { tmdbId: 74313, mediaType: 'tv', note: 'Depths of the ocean.' }, // Blue Planet II
  { tmdbId: 87083, mediaType: 'tv', note: 'Formula 1 drama.' }, // Drive to Survive
  { tmdbId: 46434, mediaType: 'tv', note: 'History of everything.' }, // The Vietnam War (Ken Burns)
  { tmdbId: 64439, mediaType: 'tv', note: 'True crime phenomenon.' }, // Making a Murderer
  { tmdbId: 79525, mediaType: 'tv', note: 'Basketball legend.' }, // The Last Dance
  { tmdbId: 62391, mediaType: 'tv', note: 'Food and culture.' }, // Chef's Table
  { tmdbId: 407806, mediaType: 'movie', note: 'Modern slavery.' }, // 13th
  { tmdbId: 97861, mediaType: 'tv', note: 'Nature at night.' }, // Night on Earth
  { tmdbId: 656690, mediaType: 'movie', note: 'Social dilemma.' }, // The Social Dilemma
  { tmdbId: 18570, mediaType: 'movie', note: 'Food industry exposed.' }, // Food, Inc.
  { tmdbId: 23128, mediaType: 'movie', note: 'Dolphin cove secrets.' }, // The Cove
  { tmdbId: 158999, mediaType: 'movie', note: 'Killer whale captivity.' }, // Blackfish
  { tmdbId: 682110, mediaType: 'movie', note: 'Undersea friendship.' }, // My Octopus Teacher
  { tmdbId: 318279, mediaType: 'movie', note: 'Mountain climbing thriller.' }, // Meru
  { tmdbId: 515042, mediaType: 'movie', note: 'Impossible climb.' }, // Free Solo
  { tmdbId: 123678, mediaType: 'movie', note: 'Vietnam war reality.' }, // The Act of Killing
  { tmdbId: 95171, mediaType: 'tv', note: 'Prehistoric life.' }, // Prehistoric Planet
  { tmdbId: 549559, mediaType: 'movie', note: 'Moon landing, restored.' }, // Apollo 11
  { tmdbId: 44639, mediaType: 'movie', note: 'Finance collapse.' }, // Inside Job
]

/** Series and films interleaved, since only the first dozen make the row. */
export const AUTHORS_CHOICE_ANIME: AuthorsChoiceItem[] = [
  // 🏆 ESSENTIALS
  { tmdbId: 31911, mediaType: 'tv', note: 'Equivalent exchange.' }, // Fullmetal Alchemist: Brotherhood
  { tmdbId: 129, mediaType: 'movie', note: 'Ghibli at its peak.' }, // Spirited Away
  { tmdbId: 1429, mediaType: 'tv', note: 'Humanity behind the walls.' }, // Attack on Titan
  { tmdbId: 372058, mediaType: 'movie', note: 'Two lives, one comet.' }, // Your Name.
  { tmdbId: 209867, mediaType: 'tv', note: 'What comes after the quest.' }, // Frieren: Beyond Journey's End
  { tmdbId: 13916, mediaType: 'tv', note: 'A notebook that kills.' }, // Death Note
  { tmdbId: 128, mediaType: 'movie', note: 'Nature fights back.' }, // Princess Mononoke
  { tmdbId: 30991, mediaType: 'tv', note: 'See you, space cowboy.' }, // Cowboy Bebop
  { tmdbId: 149, mediaType: 'movie', note: 'Neo-Tokyo is about to explode.' }, // Akira
  { tmdbId: 46298, mediaType: 'tv', note: 'The best shōnen arc ever written.' }, // Hunter x Hunter
  { tmdbId: 42509, mediaType: 'tv', note: 'Time travel done right.' }, // Steins;Gate
  { tmdbId: 12477, mediaType: 'movie', note: 'War through a child’s eyes.' }, // Grave of the Fireflies

  // ⚔️ MODERN HITS
  { tmdbId: 95479, mediaType: 'tv', note: 'Curses and sorcerers.' }, // Jujutsu Kaisen
  { tmdbId: 85937, mediaType: 'tv', note: 'Breathtaking animation.' }, // Demon Slayer
  { tmdbId: 378064, mediaType: 'movie', note: 'Bullying and redemption.' }, // A Silent Voice
  { tmdbId: 88803, mediaType: 'tv', note: 'Vikings and vengeance.' }, // Vinland Saga
  { tmdbId: 916224, mediaType: 'movie', note: 'Doors to disaster.' }, // Suzume
  { tmdbId: 65930, mediaType: 'tv', note: 'Heroes in training.' }, // My Hero Academia

  // 🧠 CLASSICS & CULT
  { tmdbId: 890, mediaType: 'tv', note: 'Mecha, deconstructed.' }, // Neon Genesis Evangelion
  { tmdbId: 10494, mediaType: 'movie', note: 'Fame turns to paranoia.' }, // Perfect Blue
  { tmdbId: 31724, mediaType: 'tv', note: 'A prince’s chess game.' }, // Code Geass
  { tmdbId: 9323, mediaType: 'movie', note: 'The ghost in the machine.' }, // Ghost in the Shell
  { tmdbId: 4935, mediaType: 'movie', note: 'A walking castle.' }, // Howl's Moving Castle
  { tmdbId: 8392, mediaType: 'movie', note: 'A forest spirit next door.' }, // My Neighbor Totoro
  { tmdbId: 508883, mediaType: 'movie', note: 'Miyazaki’s farewell.' }, // The Boy and the Heron

  // 🏴‍☠️ LONG RUNNERS
  { tmdbId: 37854, mediaType: 'tv', note: 'The grand line awaits.' }, // One Piece
  { tmdbId: 31910, mediaType: 'tv', note: 'Believe it.' }, // Naruto Shippūden
]

// Default export can be a mix or just movies for backward compatibility
export const AUTHORS_CHOICE = AUTHORS_CHOICE_MOVIES
