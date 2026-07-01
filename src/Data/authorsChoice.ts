export type AuthorsChoiceItem = {
  tmdbId: number
  mediaType: 'movie' | 'tv' | 'documentary'
  note?: string
}

export const AUTHORS_CHOICE_MOVIES: AuthorsChoiceItem[] = [
  // 🔫 CRIME
  { tmdbId: 769, mediaType: 'movie', note: 'As far back as I can remember...' }, // Goodfellas
  { tmdbId: 238, mediaType: 'movie', note: 'The ultimate crime epic.' }, // The Godfather
  { tmdbId: 240, mediaType: 'movie', note: 'The perfect sequel.' }, // The Godfather Part II
  { tmdbId: 949, mediaType: 'movie', note: 'Cat and mouse masterclass.' }, // Heat
  { tmdbId: 598, mediaType: 'movie', note: 'Streets of Rio.' }, // City of God
  { tmdbId: 1422, mediaType: 'movie', note: 'Undercover tension.' }, // The Departed
  { tmdbId: 259693, mediaType: 'movie', note: 'Mobster reflections.' }, // The Irishman
  { tmdbId: 11423, mediaType: 'movie', note: 'A gripping pursuit.' }, // Memories of Murder

  // 🎭 DRAMA
  { tmdbId: 278, mediaType: 'movie', note: 'Hope can set you free.' }, // The Shawshank Redemption
  { tmdbId: 7345, mediaType: 'movie', note: 'Relentless ambition.' }, // There Will Be Blood
  { tmdbId: 423, mediaType: 'movie', note: 'Survival through art.' }, // The Pianist
  { tmdbId: 424, mediaType: 'movie', note: 'A light in the dark.' }, // Schindler's List
  { tmdbId: 497, mediaType: 'movie', note: 'Miracles in unexpected places.' }, // The Green Mile
  { tmdbId: 103663, mediaType: 'movie', note: 'Mass hysteria.' }, // The Hunt (Jagten, 2012)
  { tmdbId: 24478, mediaType: 'movie', note: 'Watching the watchers.' }, // The Lives of Others
  { tmdbId: 453, mediaType: 'movie', note: 'Genius and madness.' }, // A Beautiful Mind

  // 🧠 PSYCHOLOGICAL
  { tmdbId: 1014, mediaType: 'movie', note: 'Hollywood dreamscape.' }, // Mulholland Drive
  { tmdbId: 670, mediaType: 'movie', note: '15 years of vengeance.' }, // Oldboy (2003)
  { tmdbId: 10494, mediaType: 'movie', note: 'Blurring reality and illusion.' }, // Perfect Blue
  { tmdbId: 77, mediaType: 'movie', note: 'Memories can deceive.' }, // Memento
  { tmdbId: 103, mediaType: 'movie', note: 'Urban decay.' }, // Taxi Driver
  { tmdbId: 146233, mediaType: 'movie', note: 'How far would you go?' }, // Prisoners
  { tmdbId: 274, mediaType: 'movie', note: 'A chilling interrogation.' }, // The Silence of the Lambs
  { tmdbId: 44214, mediaType: 'movie', note: 'The price of perfection.' }, // Black Swan

  // 🛸 SCI-FI
  { tmdbId: 329, mediaType: 'movie', note: 'Tears in rain.' }, // Blade Runner
  { tmdbId: 335984, mediaType: 'movie', note: 'A sequel that surpasses.' }, // Blade Runner 2049
  { tmdbId: 157336, mediaType: 'movie', note: 'Love beyond dimensions.' }, // Interstellar
  { tmdbId: 329865, mediaType: 'movie', note: 'Language can save us.' }, // Arrival
  { tmdbId: 62, mediaType: 'movie', note: 'Human evolution.' }, // 2001: A Space Odyssey
  { tmdbId: 603, mediaType: 'movie', note: 'Reality is a lie.' }, // The Matrix
  { tmdbId: 9693, mediaType: 'movie', note: 'Hope in a barren world.' }, // Children of Men
  { tmdbId: 152601, mediaType: 'movie', note: 'Love in the digital age.' }, // Her

  // ⚔️ WAR
  { tmdbId: 857, mediaType: 'movie', note: 'The horrors of the beach.' }, // Saving Private Ryan
  { tmdbId: 28, mediaType: 'movie', note: 'Descent into madness.' }, // Apocalypse Now
  { tmdbId: 25237, mediaType: 'movie', note: 'Devastating reality.' }, // Come and See
  { tmdbId: 530915, mediaType: 'movie', note: 'One continuous journey.' }, // 1917
  { tmdbId: 600, mediaType: 'movie', note: 'The duality of man.' }, // Full Metal Jacket
  { tmdbId: 16541, mediaType: 'movie', note: 'The futility of war.' }, // Paths of Glory

  // 🎨 ANIMATION
  { tmdbId: 129, mediaType: 'movie', note: 'Studio Ghibli magic.' }, // Spirited Away
  { tmdbId: 128, mediaType: 'movie', note: 'Nature vs humanity.' }, // Princess Mononoke
  { tmdbId: 12477, mediaType: 'movie', note: 'Heartbreaking survival.' }, // Grave of the Fireflies
  { tmdbId: 324857, mediaType: 'movie', note: 'A visual revolution.' }, // Spider-Man: Into the Spider-Verse
  { tmdbId: 585, mediaType: 'movie', note: 'Love among the ruins.' }, // WALL-E
  { tmdbId: 10386, mediaType: 'movie', note: 'A boy and his robot.' }, // The Iron Giant

  // 🐉 FANTASY
  { tmdbId: 122, mediaType: 'movie', note: 'The return of the king.' }, // LOTR: The Return of the King
  { tmdbId: 1417, mediaType: 'movie', note: 'Dark fairytale.' }, // Pan's Labyrinth
  { tmdbId: 2493, mediaType: 'movie', note: 'As you wish.' }, // The Princess Bride
  { tmdbId: 673, mediaType: 'movie', note: 'Magic gets darker.' }, // Harry Potter and the Prisoner of Azkaban

  // 🏛️ MODERN MASTERPIECES
  { tmdbId: 496243, mediaType: 'movie', note: 'Class warfare satire.' }, // Parasite
  { tmdbId: 244786, mediaType: 'movie', note: 'Whiplash intensity.' }, // Whiplash
  { tmdbId: 640146, mediaType: 'movie', note: 'The bomb that changed everything.' }, // Oppenheimer
  { tmdbId: 872585, mediaType: 'movie', note: 'Everything everywhere.' }, // Everything Everywhere All At Once
  { tmdbId: 840430, mediaType: 'movie', note: 'A lesson in empathy.' }, // The Holdovers
  { tmdbId: 915935, mediaType: 'movie', note: 'A dissection of truth.' }, // Anatomy of a Fall
  { tmdbId: 1028757, mediaType: 'movie', note: 'The banality of evil.' }, // The Zone of Interest
  { tmdbId: 674324, mediaType: 'movie', note: 'The end of a friendship.' }, // The Banshees of Inisherin

  // 🎞️ CLASSICS
  { tmdbId: 15001, mediaType: 'movie', note: 'Rosebud.' }, // Citizen Kane
  { tmdbId: 289, mediaType: 'movie', note: "We'll always have Paris." }, // Casablanca
  { tmdbId: 389, mediaType: 'movie', note: 'Power of persuasion.' }, // 12 Angry Men
  { tmdbId: 947, mediaType: 'movie', note: 'Epic desert journey.' }, // Lawrence of Arabia
  { tmdbId: 437, mediaType: 'movie', note: 'Hollywood tragedy.' }, // Sunset Boulevard
  { tmdbId: 539, mediaType: 'movie', note: 'The shower scene.' }, // Psycho
  { tmdbId: 235, mediaType: 'movie', note: 'Voyeuristic suspense.' }, // Rear Window
  { tmdbId: 426, mediaType: 'movie', note: 'A dizzying obsession.' }, // Vertigo
  { tmdbId: 490, mediaType: 'movie', note: 'Chess with Death.' }, // The Seventh Seal

  // 🌍 FOREIGN CINEMA
  { tmdbId: 105, mediaType: 'movie', note: 'Seven samurai.' }, // Seven Samurai
  { tmdbId: 14780, mediaType: 'movie', note: 'Honor and hypocrisy.' }, // Harakiri
  { tmdbId: 12493, mediaType: 'movie', note: 'To live.' }, // Ikiru
  { tmdbId: 11700, mediaType: 'movie', note: 'The lone wolf.' }, // Yojimbo
  { tmdbId: 11216, mediaType: 'movie', note: 'A love letter to cinema.' }, // Cinema Paradiso
  { tmdbId: 637, mediaType: 'movie', note: 'Finding joy in the dark.' }, // Life Is Beautiful
  { tmdbId: 670, mediaType: 'movie', note: '15 years of vengeance.' }, // Oldboy
  { tmdbId: 77338, mediaType: 'movie', note: 'An unlikely friendship.' }, // The Intouchables
  { tmdbId: 46738, mediaType: 'movie', note: "A mother's secret." }, // Incendies
  { tmdbId: 290098, mediaType: 'movie', note: 'Twists and deception.' }, // The Handmaiden

  // 🔍 ALSO MISSING — MUST HAVES
  { tmdbId: 6977, mediaType: 'movie', note: 'No country for anyone.' }, // No Country for Old Men
  { tmdbId: 9693, mediaType: 'movie', note: 'Hope in a barren world.' }, // Children of Men
  { tmdbId: 503919, mediaType: 'movie', note: 'Descent into madness.' }, // The Lighthouse
  { tmdbId: 37165, mediaType: 'movie', note: 'We are all watching.' }, // The Truman Show
  { tmdbId: 152601, mediaType: 'movie', note: 'Love in the digital age.' }, // Her
  { tmdbId: 46738, mediaType: 'movie', note: "A mother's secret." }, // Incendies
  { tmdbId: 531428, mediaType: 'movie', note: 'A burning passion.' }, // Portrait of a Lady on Fire
  { tmdbId: 965150, mediaType: 'movie', note: 'Fading memories.' }, // Aftersun
  { tmdbId: 313369, mediaType: 'movie', note: "Here's to the fools who dream." }, // La La Land
  { tmdbId: 2661, mediaType: 'movie', note: 'Symmetrical perfection.' }, // The Grand Budapest Hotel
  { tmdbId: 1955, mediaType: 'movie', note: 'I am not an animal.' }, // The Elephant Man
  { tmdbId: 1091, mediaType: 'movie', note: 'Paranoia in the ice.' }, // The Thing
  { tmdbId: 348, mediaType: 'movie', note: 'In space, no one can hear you scream.' }, // Alien
  { tmdbId: 679, mediaType: 'movie', note: "This time it's war." }, // Aliens
  { tmdbId: 694, mediaType: 'movie', note: 'All work and no play.' }, // The Shining
  { tmdbId: 274, mediaType: 'movie', note: 'A chilling interrogation.' }, // The Silence of the Lambs
  { tmdbId: 1124, mediaType: 'movie', note: 'Are you watching closely?' }, // The Prestige
  { tmdbId: 77, mediaType: 'movie', note: 'Memories can deceive.' }, // Memento
  { tmdbId: 103663, mediaType: 'movie', note: 'Mass hysteria.' }, // The Hunt
  { tmdbId: 146233, mediaType: 'movie', note: 'How far would you go?' }, // Prisoners
  { tmdbId: 670, mediaType: 'movie', note: '15 years of vengeance.' }, // Oldboy
  { tmdbId: 11423, mediaType: 'movie', note: 'A gripping pursuit.' }, // Memories of Murder
]

export const AUTHORS_CHOICE_TV: AuthorsChoiceItem[] = [
  // 🌟 POPULAR PICKS
  { tmdbId: 119051, mediaType: 'tv', note: 'Addictive mystery.' }, // Wednesday
  { tmdbId: 73586, mediaType: 'tv', note: 'Yellowstone drama.' }, // Yellowstone
  { tmdbId: 124364, mediaType: 'tv', note: 'Survival horror.' }, // From

  // 📺 ESSENTIAL
  { tmdbId: 1396, mediaType: 'tv', note: 'Chemistry and consequences.' }, // Breaking Bad
  { tmdbId: 60059, mediaType: 'tv', note: 'The perfect spin-off.' }, // Better Call Saul
  { tmdbId: 1398, mediaType: 'tv', note: 'The don of television.' }, // The Sopranos
  { tmdbId: 1438, mediaType: 'tv', note: 'The streets of Baltimore.' }, // The Wire
  { tmdbId: 76479, mediaType: 'tv', note: 'Nuclear horror.' }, // Chernobyl
  { tmdbId: 4613, mediaType: 'tv', note: 'Brothers in arms.' }, // Band of Brothers
  { tmdbId: 54344, mediaType: 'tv', note: 'Profound grief and belief.' }, // The Leftovers
  { tmdbId: 63351, mediaType: 'tv', note: 'Mind-bending time travel.' }, // Dark
  { tmdbId: 76331, mediaType: 'tv', note: 'Corporate backstabbing.' }, // Succession
  { tmdbId: 1104, mediaType: 'tv', note: 'Advertising in the 60s.' }, // Mad Men
  { tmdbId: 46648, mediaType: 'tv', note: 'Time is a flat circle.' }, // True Detective

  // 📼 MODERN CLASSICS
  { tmdbId: 85576, mediaType: 'tv', note: 'Workplace dystopia.' }, // Severance
  { tmdbId: 100088, mediaType: 'tv', note: 'Endure and survive.' }, // The Last of Us
  { tmdbId: 94605, mediaType: 'tv', note: 'Animated perfection.' }, // Arcane
  { tmdbId: 83867, mediaType: 'tv', note: 'The spark of rebellion.' }, // Andor
  { tmdbId: 126308, mediaType: 'tv', note: 'Feudal Japan epic.' }, // Shōgun (2024)
  { tmdbId: 136315, mediaType: 'tv', note: 'Kitchen chaos.' }, // The Bear
  { tmdbId: 225180, mediaType: 'tv', note: 'A bloody path to revenge.' }, // Blue Eye Samurai
  { tmdbId: 94997, mediaType: 'tv', note: 'Fire and blood.' }, // House of the Dragon

  // 😂 COMEDY
  { tmdbId: 70523, mediaType: 'tv', note: 'Dark comedy masterpiece.' }, // Fleabag
  { tmdbId: 2316, mediaType: 'tv', note: 'Dunder Mifflin.' }, // The Office US
  { tmdbId: 8592, mediaType: 'tv', note: "Pawnee's finest." }, // Parks and Recreation
  { tmdbId: 48891, mediaType: 'tv', note: 'Nine-Nine!' }, // Brooklyn Nine-Nine
  { tmdbId: 61222, mediaType: 'tv', note: 'Hollywood melancholy.' }, // BoJack Horseman

  // 🚀 SCI-FI
  { tmdbId: 1668, mediaType: 'tv', note: 'Tech paranoia.' }, // Black Mirror
  { tmdbId: 86831, mediaType: 'tv', note: 'Animated sci-fi anthology.' }, // Love, Death + Robots
  { tmdbId: 63247, mediaType: 'tv', note: 'Violent delights.' }, // Westworld S1
]

export const AUTHORS_CHOICE_DOCUMENTARIES: AuthorsChoiceItem[] = [
  // 🌍 NATURE & SCIENCE
  { tmdbId: 68894, mediaType: 'tv', note: 'Nature in 4K.' }, // Planet Earth II
  { tmdbId: 202334, mediaType: 'tv', note: 'The natural world continues.' }, // Planet Earth III
  { tmdbId: 74313, mediaType: 'tv', note: 'Depths of the ocean.' }, // Blue Planet II
  { tmdbId: 55681, mediaType: 'tv', note: 'Space and time.' }, // Cosmos
  { tmdbId: 555604, mediaType: 'movie', note: 'Moon landing restored.' }, // Apollo 11

  // 🏆 SPORTS & ADVENTURE
  { tmdbId: 79525, mediaType: 'tv', note: 'Basketball legend.' }, // The Last Dance
  { tmdbId: 527641, mediaType: 'movie', note: 'Impossible climb.' }, // Free Solo
  { tmdbId: 682110, mediaType: 'movie', note: 'Undersea friendship.' }, // My Octopus Teacher
  { tmdbId: 83666, mediaType: 'movie', note: 'The pursuit of sushi perfection.' }, // Jiro Dreams of Sushi

  // 📜 HISTORY & SOCIETY
  { tmdbId: 46434, mediaType: 'tv', note: 'The full story of Vietnam.' }, // The Vietnam War (Ken Burns)
  { tmdbId: 44639, mediaType: 'movie', note: 'Finance collapse.' }, // Inside Job
  { tmdbId: 367858, mediaType: 'movie', note: 'Modern slavery.' }, // 13th
  { tmdbId: 652601, mediaType: 'movie', note: 'Social dilemma.' }, // The Social Dilemma
  { tmdbId: 490003, mediaType: 'movie', note: 'A beautiful neighborhood.' }, // Won't You Be My Neighbor?
  { tmdbId: 903737, mediaType: 'movie', note: 'A love letter to volcanoes.' }, // Fire of Love
]

// Default export can be a mix or just movies for backward compatibility
export const AUTHORS_CHOICE = AUTHORS_CHOICE_MOVIES
