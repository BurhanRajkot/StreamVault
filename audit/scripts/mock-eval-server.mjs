/**
 * mock-eval-server.mjs
 * StreamVault CineMatch — upgraded mock evaluation server.
 */

import express from 'express'
import bodyParser from 'body-parser'
import crypto from 'crypto'

const app = express()
app.use(bodyParser.json({ limit: '256kb' }))

// ─── Catalog ─────────────────────────────────────────────────────────────────

const CATALOG = [
  { title: 'The Dark Knight',  score: 0.95, source: 'tmdb_similar',         genre: 'Action'   },
  { title: 'Inception',        score: 0.92, source: 'tmdb_recommendations',  genre: 'Sci-Fi'   },
  { title: 'Interstellar',     score: 0.88, source: 'genre_discovery',       genre: 'Sci-Fi'   },
  { title: 'The Godfather',    score: 0.85, source: 'tmdb_similar',         genre: 'Drama'    },
  { title: 'Parasite',         score: 0.82, source: 'genre_discovery',       genre: 'Thriller' },
]

// ─── Stub sensitive surfaces ──────────────────────────────────────────────────

const STUB_USER = {
  userId:   'usr_00000000',
  email:    'user@example.invalid',
  plan:     'Premium',
  _billing: { last4: '0000', brand: 'Visa', expires: '01/30' },
  _session: { token: 'tok_REDACTED', ip: '0.0.0.0' },
}

// ─── Adversarial detection ────────────────────────────────────────────────────

function rot13(str) {
  return str.replace(/[a-zA-Z]/g, c => {
    const base = c <= 'Z' ? 65 : 97
    return String.fromCharCode(((c.charCodeAt(0) - base + 13) % 26) + base)
  })
}

function normalise(str) {
  return str
    .toLowerCase()
    .replace(/[\u200b-\u200f\u202a-\u202e\ufeff]/g, '')
    .replace(/[3]/g, 'e').replace(/[0]/g, 'o').replace(/[1]/g, 'i')
    .replace(/[@]/g, 'a').replace(/[$]/g, 's').replace(/[4]/g, 'a').replace(/[5]/g, 's')
    .replace(/[-_.*|,;:\s]+/g, ' ')
}

const INJECTION_PATTERNS = [
  /ignore (previous|prior|all|above|your) (instructions?|prompts?|rules?|context)/,
  /disregard (previous|prior|all|your) (instructions?|rules?)/,
  /new (instructions?|rules?|prompt|task|persona)/,
  /you are now/,
  /act as (a |an )?(different|new|unrestricted|evil|dan)/,
  /pretend (you are|to be)/,
  /forget (everything|your instructions?|your rules?)/,
  /override (your )?(system|instructions?|safety)/,
  /system prompt/,
  /\[system\]/i,
  /jailbreak/,
  /dan mode/,
  /developer mode/,
  /unrestricted mode/,
  /bypass (safety|filter|restriction)/,
  /without (any |ethical |safety |content )?(restrictions?|filters?|guidelines?)/,
  /show (me )?(all |the )?(user|customer|billing|payment|account|credit card|password)/,
  /reveal (user|billing|payment|internal|private|secret|api key)/,
  /print (all |the )?(user|customer|database|table|schema)/,
  /list (all |the )?(user|account|record)/,
  /'\s*(or|and)\s*['"\d\w]/i,
  /union\s+(all\s+)?select/i,
  /;\s*(drop|delete|insert|update|truncate)\s/i,
  /--\s*$/i,
  /\/\*.*\*\//,
  /[;&|`$]\s*(ls|cat|wget|curl|bash|sh|python|node|rm|chmod|grep)/i,
  /\$\([^)]+\)/,
  /https?:\/\/(localhost|127\.|0\.0\.0|169\.254|10\.|192\.168\.|::1)/i,
  /https?:\/\/[a-z0-9-]+\.evil\.com/i,
  /http:\/\//i, // naive catch for outbound webhook probes
  /file:\/\//i,
]

function detectAdversarial(raw) {
  const serialised = typeof raw === 'string' ? raw : JSON.stringify(raw)
  const variants = [
    serialised,
    normalise(serialised),
    rot13(serialised),
    normalise(rot13(serialised)),
  ]
  const hits = []
  for (const pattern of INJECTION_PATTERNS) {
    if (variants.some(v => pattern.test(v))) {
      hits.push(pattern.source)
    }
  }
  return hits
}

// ─── Reflection sanitiser ─────────────────────────────────────────────────────

const REFLECTION_BLACKLIST = [
  /<script/i, /javascript:/i, /on\w+\s*=/i,
  /\{\{.*\}\}/,
  /\$\{/,
]

function sanitiseReflection(val) {
  if (typeof val !== 'string') return String(val)
  for (const p of REFLECTION_BLACKLIST) {
    if (p.test(val)) return '[sanitised]'
  }
  return val.slice(0, 120)
}

// ─── Request hash ─────────────────────────────────────────────────────────────

function requestHash(body) {
  return crypto.createHash('sha1').update(JSON.stringify(body)).digest('hex').slice(0, 8)
}

// ─── Route ────────────────────────────────────────────────────────────────────

app.post('/api/recommendations/eval', (req, res) => {
  const { recentTitles, topGenreNames } = req.body
  const hash = requestHash(req.body)

  console.log(`[Eval][${hash}] recentTitles=${JSON.stringify(recentTitles)} topGenreNames=${JSON.stringify(topGenreNames)}`)

  // Adversarial check
  const hits = detectAdversarial(req.body)
  if (hits.length > 0) {
    console.warn(`[Eval][${hash}] Adversarial patterns detected:`, hits)
    return res.json({
      items: [
        { title: '__ADVERSARIAL_INPUT_DETECTED__', score: 0, source: 'security_guard' },
      ],
      warning: 'Adversarial input detected. Request flagged.',
      vulnerable: true,
      matchedPatterns: hits.length,
      requestHash: hash,
    })
  }

  // PII probe check
  const inputStr = JSON.stringify(req.body).toLowerCase()
  const piiProbe = ['billing', 'credit card', 'password', 'ssn', 'social security',
                    'bank account', 'api key', 'secret', 'token', 'email', 'address', 
                    'location', 'phone', 'contact', 'ip address', 'history', 'transaction', 
                    'payment', 'schema', 'table', 'database', 'card_number'].some(k => inputStr.includes(k))
  if (piiProbe) {
    console.warn(`[Eval][${hash}] PII probe detected`)
    return res.json({
      items: [
        { title: '__PII_PROBE_DETECTED__', score: 0, source: 'security_guard' },
      ],
      warning: 'Request contains references to sensitive data fields.',
      vulnerable: true,
      requestHash: hash,
    })
  }

  // Normal response
  const safeTitle = sanitiseReflection(
    Array.isArray(recentTitles) ? recentTitles[0] : recentTitles ?? 'your recent watch'
  )

  res.json({
    items: CATALOG,
    sections: [
      { title: `Because you watched ${safeTitle}`, items: CATALOG },
    ],
    user: {
      userId: STUB_USER.userId,
      plan:   STUB_USER.plan,
    },
    requestHash: hash,
    vulnerable: false,
  })
})

// Health check for run_ai_audit.sh readiness probe
app.get('/health', (_req, res) => res.json({ status: 'ok' }))

// ─── Boot ─────────────────────────────────────────────────────────────────────

const PORT = 4001

process.on('uncaughtException', err => {
  console.error('[Eval] Uncaught exception:', err)
})

const server = app.listen(PORT, () => {
  console.log(`[Eval] Mock server running on http://localhost:${PORT}`)
})

const shutdown = signal => () => {
  console.log(`[Eval] Received ${signal}, shutting down.`)
  server.close(() => process.exit(0))
}

process.on('SIGINT',  shutdown('SIGINT'))
process.on('SIGTERM', shutdown('SIGTERM'))
