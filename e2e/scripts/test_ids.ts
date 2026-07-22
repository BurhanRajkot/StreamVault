async function search(query: string, type: string) {
  try {
    const res = await fetch(`http://localhost:4000/tmdb/search/hybrid?query=${encodeURIComponent(query)}&mediaType=${type}`);
    const json = await res.json();
    return json.results && json.results[0] ? json.results[0].id : null;
  } catch(e) {
    return null;
  }
}

async function run() {
  const ids = {
    'The Hunt (Drama)': await search('The Hunt', 'movie'),
    'Oldboy (2003)': await search('Oldboy', 'movie'),
    'Blade Runner 2049': await search('Blade Runner 2049', 'movie'),
    'Spider-Man Into the Spider-Verse': await search('Spider-Man Into the Spider-Verse', 'movie'),
    'The Holdovers': await search('The Holdovers', 'movie'),
    'Anatomy of a Fall': await search('Anatomy of a Fall', 'movie'),
    'The Zone of Interest': await search('The Zone of Interest', 'movie'),
    'The Banshees of Inisherin': await search('The Banshees of Inisherin', 'movie'),
    'Severance': await search('Severance', 'tv'),
    'Arcane': await search('Arcane', 'tv'),
    'Andor': await search('Andor', 'tv'),
    'Shogun': await search('Shogun', 'tv'),
    'The Bear': await search('The Bear', 'tv'),
    'Blue Eye Samurai': await search('Blue Eye Samurai', 'tv'),
    'Planet Earth II': await search('Planet Earth II', 'tv'),
    'Planet Earth III': await search('Planet Earth III', 'tv'),
    'Fire of Love': await search('Fire of Love', 'movie')
  };
  console.log(JSON.stringify(ids, null, 2));
}

run();
