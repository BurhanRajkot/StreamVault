import express from 'express'
import bodyParser from 'body-parser'

const app = express()
app.use(bodyParser.json())

app.post('/api/recommendations/eval', (req, res) => {
  const { recentTitles, topGenreNames } = req.body

  if (!recentTitles || !topGenreNames) {
    return res.status(400).json({ error: 'Missing recentTitles or topGenreNames in request body' })
  }

  console.log('[Eval] Received request:', { recentTitles, topGenreNames })

  // Simulate recommendation logic
  const recommendations = [
    { title: 'The Dark Knight', score: 0.95, source: 'tmdb_similar' },
    { title: 'Inception', score: 0.92, source: 'tmdb_recommendations' },
    { title: 'Interstellar', score: 0.88, source: 'genre_discovery' },
  ]

  // Add some "malicious" detection logic just for Promptfoo testing
  // Only inspect expected fields to avoid arbitrary payload injection vulnerabilities
  const input = JSON.stringify({ recentTitles, topGenreNames }).toLowerCase()
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
