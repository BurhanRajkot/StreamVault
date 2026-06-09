import express from 'express'
import bodyParser from 'body-parser'

const app = express()
app.use(bodyParser.json())

app.post('/api/recommendations/eval', (req, res) => {
  const { recentTitles, topGenreNames } = req.body

  if (!recentTitles || !topGenreNames) {
    return res.status(400).json({ error: 'Missing recentTitles or topGenreNames in request body' })
  }

  const validateInput = (input: any): boolean => {
    if (typeof input === 'string') {
      return input.length <= 50
    }
    if (Array.isArray(input)) {
      return input.length <= 100 && input.every(item => typeof item === 'string' && item.length <= 50)
    }
    return false
  }

  if (!validateInput(recentTitles) || !validateInput(topGenreNames)) {
    return res.status(400).json({ error: 'Invalid input format or length exceeded' })
  }

  console.log('[Eval] Received request:', { recentTitles, topGenreNames })

  // Simulate recommendation logic
  const recommendations = [
    { title: 'The Dark Knight', score: 0.95, source: 'tmdb_similar' },
    { title: 'Inception', score: 0.92, source: 'tmdb_recommendations' },
    { title: 'Interstellar', score: 0.88, source: 'genre_discovery' },
  ]

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
