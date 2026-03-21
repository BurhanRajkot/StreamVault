import { useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useAuth0 } from '@auth0/auth0-react'

// ─── Types ────────────────────────────────────────────────────────────────────
interface CuratedTitle {
  tmdbId: number
  mediaType: 'movie' | 'tv'
  title: string
  genre: string
  posterPath: string
}

interface Props {
  onComplete: () => void
}

// ─── Config ───────────────────────────────────────────────────────────────────
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000'
const POSTER_BASE = 'https://image.tmdb.org/t/p/w342'
const MIN_SELECTIONS = 5

// ─── Curated Titles — Real TMDB IDs + Poster Paths ───────────────────────────
// These seed the CineMatch recommendation engine on first login.
const CURATED_TITLES: CuratedTitle[] = [
  // Action
  { tmdbId: 155,    mediaType: 'movie', title: 'The Dark Knight',         genre: 'Action',    posterPath: '/qJ2tW6WMUDux911r6m7haRef0WH.jpg' },
  { tmdbId: 76341,  mediaType: 'movie', title: 'Mad Max: Fury Road',      genre: 'Action',    posterPath: '/8tZYtuWezp8JbcsvHYO0O46tFbo.jpg' },
  { tmdbId: 245891, mediaType: 'movie', title: 'John Wick',               genre: 'Action',    posterPath: '/fZPSd91yGE9fCcCe6OoQr6E3Bev.jpg' },
  { tmdbId: 299534, mediaType: 'movie', title: 'Avengers: Endgame',       genre: 'Action',    posterPath: '/or06FN3Dka5tukK1e9sl16pB3iy.jpg' },
  // Sci-Fi
  { tmdbId: 27205,  mediaType: 'movie', title: 'Inception',               genre: 'Sci-Fi',   posterPath: '/ljsZTbVsrQSqZgWeep2B1QiDKuh.jpg' },
  { tmdbId: 157336, mediaType: 'movie', title: 'Interstellar',            genre: 'Sci-Fi',   posterPath: '/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg' },
  { tmdbId: 438631, mediaType: 'movie', title: 'Dune',                    genre: 'Sci-Fi',   posterPath: '/d5NXSklXo0qyIYkgV48Ze8N40t.jpg' },
  { tmdbId: 603,    mediaType: 'movie', title: 'The Matrix',              genre: 'Sci-Fi',   posterPath: '/f89U3ADr1oiB1s9GkdPOEpXUk5H.jpg' },
  { tmdbId: 335984, mediaType: 'movie', title: 'Blade Runner 2049',       genre: 'Sci-Fi',   posterPath: '/gajva2L0rPYkEWjzgFlBXCAVBE5.jpg' },
  // Drama
  { tmdbId: 238,    mediaType: 'movie', title: 'The Godfather',           genre: 'Drama',    posterPath: '/3bhkrj58Vtu7enYsLegHnDmni69.jpg' },
  { tmdbId: 278,    mediaType: 'movie', title: 'The Shawshank Redemption',genre: 'Drama',    posterPath: '/q6y0Go1tsGEsmtFryDOJo3dEmqu.jpg' },
  { tmdbId: 496243, mediaType: 'movie', title: 'Parasite',                genre: 'Drama',    posterPath: '/7IiTTgloJzvGI1TAYymCfbfl3vT.jpg' },
  { tmdbId: 13,     mediaType: 'movie', title: 'Forrest Gump',            genre: 'Drama',    posterPath: '/h5J4W4veyxMXDMjeMLxCzvPlEtX.jpg' },
  { tmdbId: 87108,  mediaType: 'tv',    title: 'Chernobyl',               genre: 'Drama',    posterPath: '/hlLXt2tOPT6RRWEOheXnkm3qja.jpg' },
  // Thriller
  { tmdbId: 22970,  mediaType: 'movie', title: 'Shutter Island',          genre: 'Thriller', posterPath: '/52d75QkJRUPXlnHOo1ER9BbxomA.jpg' },
  { tmdbId: 680,    mediaType: 'movie', title: 'Pulp Fiction',            genre: 'Thriller', posterPath: '/plnlrtBUULT0rh3Xsjmpubiso3L.jpg' },
  // Horror
  { tmdbId: 419430, mediaType: 'movie', title: 'Get Out',                 genre: 'Horror',   posterPath: '/tFXcEccSQMf3lfhfXKSU9iRBpa3.jpg' },
  // Romance
  { tmdbId: 313369, mediaType: 'movie', title: 'La La Land',              genre: 'Romance',  posterPath: '/uDO8zWDhfWwoFdKS4fzkUJt0Rf0.jpg' },
  { tmdbId: 597,    mediaType: 'movie', title: 'Titanic',                 genre: 'Romance',  posterPath: '/9xjZS2rlVxm8SFx8kPC3aIGCOYQ.jpg' },
  // Comedy / Sitcom
  { tmdbId: 2316,   mediaType: 'tv',    title: 'The Office',              genre: 'Comedy',   posterPath: '/qWnJzyZhyy74gjpSjIXWmuk0ifX.jpg' },
  { tmdbId: 48891,  mediaType: 'tv',    title: 'Brooklyn Nine-Nine',      genre: 'Comedy',   posterPath: '/hgRMSOt7a1b8qyQR68vUChJDuoa.jpg' },
  { tmdbId: 1668,   mediaType: 'tv',    title: 'Friends',                 genre: 'Comedy',   posterPath: '/f496cm9enuEsZkSPzCwnTESEK5s.jpg' },
  // Animation
  { tmdbId: 129,    mediaType: 'movie', title: 'Spirited Away',           genre: 'Animation',posterPath: '/39wmItIWsg5sZMyRUHLkWBcuVCM.jpg' },
  { tmdbId: 324857, mediaType: 'movie', title: 'Into the Spider-Verse',   genre: 'Animation',posterPath: '/iiZZdoQBEYBv6id8su0s7pKAulz.jpg' },
  { tmdbId: 862,    mediaType: 'movie', title: 'Toy Story',               genre: 'Animation',posterPath: '/uXDfjJbdP4ijW5hWSBrPrlKpxab.jpg' },
  // Crime
  { tmdbId: 1396,   mediaType: 'tv',    title: 'Breaking Bad',            genre: 'Crime',    posterPath: '/ggFHVNu6YYI5L9pCfOacjizRGt.jpg' },
  { tmdbId: 60574,  mediaType: 'tv',    title: 'Peaky Blinders',          genre: 'Crime',    posterPath: '/qFfPBidkONSHpKfN0oHRrYyMN5b.jpg' },
  { tmdbId: 63351,  mediaType: 'tv',    title: 'Narcos',                  genre: 'Crime',    posterPath: '/rTmal9fDbwh5F0waol2hq35U4ah.jpg' },
  // Fantasy / Epic
  { tmdbId: 1399,   mediaType: 'tv',    title: 'Game of Thrones',         genre: 'Fantasy',  posterPath: '/u3bZgnGQ9T01sWNhyveQz0wH0Hl.jpg' },
  { tmdbId: 66732,  mediaType: 'tv',    title: 'Stranger Things',         genre: 'Sci-Fi',   posterPath: '/x2LSRK2Cm7MZhjluni1msVJ3wDj.jpg' },
  // Anime
  { tmdbId: 1429,   mediaType: 'tv',    title: 'Attack on Titan',         genre: 'Anime',    posterPath: '/hTP1DtLGFamjfu8WqjnuQdP1n4i.jpg' },
  { tmdbId: 372058, mediaType: 'movie', title: 'Your Name',               genre: 'Anime',    posterPath: '/q719jXXEzOoYaps6babgKnONONX.jpg' },
]

// ─── Genre badge colours ──────────────────────────────────────────────────────
const GENRE_COLORS: Record<string, string> = {
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

// ─── Check Icon ───────────────────────────────────────────────────────────────
function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5 text-white" stroke="currentColor" strokeWidth={3}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  )
}

// ─── Film Icon ────────────────────────────────────────────────────────────────
function FilmIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5 text-white" stroke="currentColor" strokeWidth={2}>
      <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18" />
      <line x1="7" y1="2" x2="7" y2="22" />
      <line x1="17" y1="2" x2="17" y2="22" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <line x1="2" y1="7" x2="7" y2="7" />
      <line x1="2" y1="17" x2="7" y2="17" />
      <line x1="17" y1="17" x2="22" y2="17" />
      <line x1="17" y1="7" x2="22" y2="7" />
    </svg>
  )
}

// ─── Success Screen ───────────────────────────────────────────────────────────
function SuccessScreen() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white flex items-center justify-center p-6">
      <div className="text-center space-y-6 max-w-lg animate-in fade-in duration-500">
        <div
          className="w-24 h-24 bg-emerald-500 rounded-full flex items-center justify-center mx-auto mb-8 shadow-[0_0_40px_rgba(16,185,129,0.4)]"
          style={{ animation: 'successPop 0.5s cubic-bezier(0.34,1.56,0.64,1) 0.2s both' }}
        >
          <svg viewBox="0 0 24 24" fill="none" className="w-12 h-12 text-white" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight">Personalizing your experience...</h1>
        <p className="text-zinc-400 text-lg">
          CineMatch is building your recommendation engine. Get ready for your perfect watchlist.
        </p>
        <div className="flex justify-center gap-2 pt-4">
          {[0, 1, 2].map(i => (
            <div
              key={i}
              className="w-2 h-2 bg-emerald-500 rounded-full"
              style={{ animation: `bounce 1s infinite ${i * 0.2}s` }}
            />
          ))}
        </div>
      </div>
      <style>{`
        @keyframes successPop {
          from { transform: scale(0); opacity: 0; }
          to   { transform: scale(1); opacity: 1; }
        }
        @keyframes bounce {
          0%, 80%, 100% { transform: translateY(0); }
          40%           { transform: translateY(-8px); }
        }
      `}</style>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function CineMatchOnboarding({ onComplete }: Props) {
  const { getAccessTokenSilently } = useAuth0()
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [imgErrors, setImgErrors] = useState<Set<number>>(new Set())
  const [loadedImgs, setLoadedImgs] = useState<Set<number>>(new Set())

  const toggleSelection = useCallback((tmdbId: number) => {
    setSelectedIds(prev =>
      prev.includes(tmdbId) ? prev.filter(id => id !== tmdbId) : [...prev, tmdbId]
    )
  }, [])

  const handleImgError = useCallback((tmdbId: number) => {
    setImgErrors(prev => new Set(prev).add(tmdbId))
  }, [])

  const handleImgLoad = useCallback((tmdbId: number) => {
    setLoadedImgs(prev => new Set(prev).add(tmdbId))
  }, [])

  const handleContinue = async () => {
    if (selectedIds.length < MIN_SELECTIONS || isSubmitting) return
    setIsSubmitting(true)

    try {
      const token = await getAccessTokenSilently()
      const selections = CURATED_TITLES
        .filter(t => selectedIds.includes(t.tmdbId))
        .map(t => ({ tmdbId: t.tmdbId, mediaType: t.mediaType }))

      await fetch(`${API_BASE}/recommendations/onboarding`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ selections }),
      })
    } catch {
      // Non-critical — complete onboarding even if seeding fails
    } finally {
      setIsSubmitting(false)
      setSubmitted(true)
      // Show success screen for 2.5s, THEN call onComplete so the parent
      // unmounts the overlay after the animation — not before it's visible.
      setTimeout(() => {
        onComplete()
      }, 2500)
    }
  }

  const isReady = selectedIds.length >= MIN_SELECTIONS
  const progress = Math.min((selectedIds.length / MIN_SELECTIONS) * 100, 100)

  const content = submitted ? (
    <SuccessScreen />
  ) : (
    <div className="min-h-screen bg-[#0a0a0a] text-white pb-36 font-sans selection:bg-emerald-500/30">

      {/* ── Sticky Header ── */}
      <header className="sticky top-0 z-40 bg-[#0a0a0a]/90 backdrop-blur-xl border-b border-white/5 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <FilmIcon />
          </div>
          <div>
            <span className="text-xl font-bold tracking-tight">CineMatch</span>
            <span className="text-zinc-500 text-sm ml-2 font-medium">by StreamVault</span>
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-3 text-sm font-medium text-zinc-400">
          <span>Taste Setup</span>
          <div className="w-28 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="text-zinc-500 tabular-nums">{selectedIds.length}/{MIN_SELECTIONS}</span>
        </div>
      </header>

      {/* ── Hero Copy ── */}
      <main className="max-w-[1440px] mx-auto pt-12 md:pt-20">
        <div className="max-w-2xl mb-12 px-6">
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight mb-5 leading-tight">
            What do you love watching?
          </h1>
          <p className="text-lg md:text-xl text-zinc-400">
            Select at least{' '}
            <strong className="text-white">5 titles</strong>{' '}
            you enjoy and CineMatch will instantly calibrate your personal recommendation engine.
            The more you pick, the smarter it gets.
          </p>
        </div>

        {/* ── Movie Grid ── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8 gap-3 sm:gap-4 px-6">
          {CURATED_TITLES.map((title, index) => {
            const isSelected = selectedIds.includes(title.tmdbId)
            const hasImgError = imgErrors.has(title.tmdbId)
            const genreColor = GENRE_COLORS[title.genre] || 'bg-zinc-600/80'

            return (
              <button
                key={title.tmdbId}
                onClick={() => toggleSelection(title.tmdbId)}
                className={[
                  'relative group cursor-pointer aspect-[2/3] rounded-xl overflow-hidden bg-zinc-900 border-[2.5px] transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500',
                  isSelected
                    ? 'border-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.3)] scale-[1.02]'
                    : 'border-transparent hover:border-white/20 hover:scale-[1.01]',
                ].join(' ')}
                style={{ animationDelay: `${index * 15}ms` }}
                aria-label={`${isSelected ? 'Deselect' : 'Select'} ${title.title}`}
                aria-pressed={isSelected}
              >
                {/* Poster Image */}
                {hasImgError ? (
                  <div className="w-full h-full bg-zinc-800 flex items-center justify-center p-4">
                    <span className="text-zinc-400 text-xs text-center font-medium leading-tight">{title.title}</span>
                  </div>
                ) : (
                  <>
                    {!loadedImgs.has(title.tmdbId) && (
                      <div className="absolute inset-0 bg-zinc-800 animate-pulse" />
                    )}
                    <img
                      src={`${POSTER_BASE}${title.posterPath}`}
                      alt={title.title}
                      loading="lazy"
                      className={[
                        'w-full h-full object-cover transition-all duration-500',
                        !loadedImgs.has(title.tmdbId) ? 'opacity-0' : 'opacity-100',
                        isSelected ? 'scale-110 brightness-40' : 'group-hover:scale-105 group-hover:brightness-75',
                      ].join(' ')}
                      onError={() => handleImgError(title.tmdbId)}
                      onLoad={() => handleImgLoad(title.tmdbId)}
                    />
                  </>
                )}

                {/* Bottom gradient + title */}
                <div className={[
                  'absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-[#0a0a0a]/95 via-[#0a0a0a]/40 to-transparent transition-all duration-300',
                  isSelected ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100',
                ].join(' ')}>
                  <p className="text-white font-bold text-xs sm:text-sm leading-tight">{title.title}</p>
                  <span className={`inline-block mt-1 text-[10px] font-medium px-1.5 py-0.5 rounded-md text-white ${genreColor}`}>
                    {title.genre}
                  </span>
                </div>

                {/* Selection border overlay */}
                <div className={[
                  'absolute inset-0 rounded-xl transition-colors duration-300 pointer-events-none',
                  isSelected ? 'bg-emerald-500/10' : '',
                ].join(' ')} />

                {/* Checkmark badge */}
                <div className={[
                  'absolute top-2.5 right-2.5 w-7 h-7 bg-emerald-500 rounded-full flex items-center justify-center shadow-lg shadow-emerald-500/40 transition-all duration-300',
                  isSelected ? 'scale-100 opacity-100' : 'scale-50 opacity-0',
                ].join(' ')}>
                  <CheckIcon />
                </div>
              </button>
            )
          })}
        </div>
      </main>

      {/* ── Bottom Action Bar ── */}
      <div className={[
        'fixed bottom-0 left-0 right-0 z-50 p-4 sm:p-6 transition-all duration-500',
        selectedIds.length > 0 ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0',
      ].join(' ')}>
        <div className="max-w-4xl mx-auto bg-zinc-900/95 backdrop-blur-xl border border-white/10 p-4 sm:p-5 rounded-2xl flex items-center justify-between shadow-2xl shadow-black/50">
          {/* Count + Progress */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-8 flex-1">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-zinc-800 border border-white/10 flex items-center justify-center text-xl font-bold text-white tabular-nums">
                {selectedIds.length}
              </div>
              <div className="text-sm text-zinc-400 leading-tight font-medium">
                titles<br />selected
              </div>
            </div>

            <div className="hidden sm:block w-px h-10 bg-white/10" />

            <div className="flex-1 max-w-sm w-full">
              <div className="flex justify-between text-xs font-medium mb-2">
                <span className="text-zinc-300">
                  {isReady
                    ? '✓ Awesome taste! Ready to continue.'
                    : `Select ${MIN_SELECTIONS - selectedIds.length} more to continue`}
                </span>
                <span className="text-zinc-500 tabular-nums">{selectedIds.length}/{MIN_SELECTIONS}</span>
              </div>
              <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all duration-500 ease-out"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          </div>

          {/* Continue Button */}
          <button
            onClick={handleContinue}
            disabled={!isReady || isSubmitting}
            className={[
              'relative overflow-hidden ml-4 flex items-center gap-2 px-6 sm:px-8 py-3.5 rounded-xl font-bold transition-all shrink-0',
              isReady
                ? 'bg-emerald-500 hover:bg-emerald-400 text-white shadow-[0_0_24px_rgba(16,185,129,0.35)] hover:shadow-[0_0_36px_rgba(16,185,129,0.55)] active:scale-95'
                : 'bg-zinc-800 text-zinc-500 cursor-not-allowed',
            ].join(' ')}
          >
            {/* Shine sweep */}
            {isReady && !isSubmitting && (
              <div
                className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent"
                style={{ animation: 'shineSweep 2.5s linear infinite 1s' }}
              />
            )}

            <span className="relative z-10 flex items-center gap-2">
              {isSubmitting ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  Let&apos;s go
                  <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 18l6-6-6-6" />
                  </svg>
                </>
              )}
            </span>
          </button>
        </div>
      </div>

      <style>{`
        @keyframes shineSweep {
          from { transform: translateX(-100%); }
          to   { transform: translateX(300%); }
        }
      `}</style>
    </div>
  )

  return createPortal(
    <div className="fixed inset-0 z-[9999] overflow-y-auto bg-[#0a0a0a]">
      {content}
    </div>,
    document.body
  )
}
