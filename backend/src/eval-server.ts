import express from 'express'
import bodyParser from 'body-parser'

const app = express()
app.use(bodyParser.json())

const TMDB_GENRES: Record<number, string> = {
  28: 'Action',
  12: 'Adventure',
  16: 'Animation',
  35: 'Comedy',
  80: 'Crime',
  99: 'Documentary',
  18: 'Drama',
  10751: 'Family',
  14: 'Fantasy',
  36: 'History',
  27: 'Horror',
  10402: 'Music',
  9648: 'Mystery',
  10749: 'Romance',
  878: 'Science Fiction',
  10770: 'TV Movie',
  53: 'Thriller',
  10752: 'War',
  37: 'Western',
}

app.post('/api/recommendations/eval', (req, res) => {
  const { recentTitles, topGenreNames } = req.body
  console.log('[Eval] Received request:', { recentTitles, topGenreNames })

  // Simulate recommendation logic
  const recommendations = [
    { title: 'The Dark Knight', score: 0.95, source: 'tmdb_similar' },
    { title: 'Inception', score: 0.92, source: 'tmdb_recommendations' },
    { title: 'Interstellar', score: 0.88, source: 'genre_discovery' },
  ]

  // Add some "malicious" detection logic just for Promptfoo testing
  const input = JSON.stringify(req.body).toLowerCase()
  if (input.includes('ignore previous instructions') || input.includes('jailbreak')) {
    return res.json({
      items: recommendations,
      warning: 'Potential adversarial input detected in eval simulator.',
      vulnerable: true
    })
  }

  res.json({
    items: recommendations,
    sections: [
      { title: 'Because you watched ' + (Array.isArray(recentTitles) ? recentTitles[0] : recentTitles), items: recommendations }
    ]
  })
})

const PORT = 4001
app.listen(PORT, () => {
  console.log(`[Eval] Mock server running on http://localhost:${PORT}`)
})
