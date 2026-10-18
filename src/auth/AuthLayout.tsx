import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Check, Clapperboard } from 'lucide-react'

/** TMDB posters for the wall (paths checked against TMDB, 2026-10-18). */
const POSTERS = [
  'gEU2QniE6E77NI6lCU6MxlNBvIx', // Interstellar
  'udDclJoHjfjb8Ekgsd4FDteOkCU', // Joker
  'd5NXSklXo0qyIYkgV94XAgMIckC', // Dune
  'qJ2tW6WMUDux911r6m7haRef0WH', // The Dark Knight
  'pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK', // Fight Club
  '7WsyChQLEftFiDOVTGkv3hFpyyt', // Inception
  '7IiTTgloJzvGI1TAYymCfbfl3vT', // Parasite
  'or06FN3Dka5tukK1e9sl16pB3iy', // Avengers: Endgame
  'gajva2L0rPYkEWjzgFlBXCAVBE5', // Blade Runner 2049
  'hA2ple9q4qnwxp3hKVNhroipsir', // Mad Max: Fury Road
  'x2FJsf1ElAgr63Y3PNPtJrcmpoe', // Arrival
  'uDO8zWDhfWwoFdKS4fzkUJt0Rf0', // La La Land
  'eWdyYQreja6JGCzqHWXpWHDrrPo', // The Grand Budapest Hotel
  'iZf0KyrE25z1sage4SYFLCCrMi9', // 1917
  'pThyQovXQrw2m0s9x82twj48Jq4', // Knives Out
  'rrKH3VhHssGTCfPuaEQkxvEoElv', // Tenet
  '9cqNxx0GxF0bflZmeSMuL5tnGzr', // The Shawshank Redemption
  '7fn624j5lj3xTme2SgiLCeuedmO', // Whiplash
  'dwXmOYJVM1VIkkSXHY5zYSaLJLC', // The Lighthouse
  '4GFPuL14eXi66V96xBWY73Y9PfR', // Hereditary
  'f89U3ADr1oiB1s9GkdPOEpXUk5H', // The Matrix
  '9OkCLM73MIU2CrKZbqiT8Ln1wY2', // Goodfellas
  'vQWk5YBFWF4bZaofAbv0tShwBvQ', // Pulp Fiction
  'rSPw7tgCH9c6NqICZef4kZjFOQ5', // The Godfather
  '39wmItIWsg5sZMyRUHLkWBcuVCM', // Spirited Away
  'c24sv2weTHPsmDa7jEMN0m2P3RT', // Into the Spider-Verse
  'fai0rspsNeJCS69wHNjOdWxcI7P', // Star Wars
  'q719jXXEzOoYaps6babgKnONONX', // Your Name.
  '78lPtwv72eTNqFW9COBYI0dWDJa', // Iron Man
  'vuza0WqY239yBXOadKlGwJsZJFE', // The Truman Show
  'saHP97rTPS5eLmrLQEcANmKrsFl', // Forrest Gump
  'sF1U4EUQS8YHUYjNl3pMGNIQyr0', // Schindler's List
  'rCzpDGLbOoPwLjy3OAm5NUPOTrC', // The Lord of the Rings
  '2H1TmgdfNtsKlU9jKdeNyYL5y8T', // Inside Out
  'w7RDIgQM6bLT7JXtH4iUQd3Iwxm', // Seven
  'uS9m8OBk1A8eM9I042bx8XXpqAq', // The Silence of the Lambs
  'mFvoEwSfLqbcWwFsDjQebn9bzFe', // Up
  '2LqaLgk4Z226KkgPJuiOQ58wvrm', // The Incredibles
  'hbhFnRzzg6ZDmm8YAmxBnQpQIPh', // WALL·E
  'vqzNJRH4YyquRiWxCCOH0aXggHI', // Terminator 2
].map((path) => `https://image.tmdb.org/t/p/w342/${path}.jpg`)

const COLUMN_COUNT = 5

/**
 * Posters dealt round-robin into columns, each column tripled so its scroll
 * (one third of its height, then back) loops without a visible jump.
 */
const COLUMNS = Array.from({ length: COLUMN_COUNT }, (_, c) => {
  const column = POSTERS.filter((_, i) => i % COLUMN_COUNT === c)
  return [...column, ...column, ...column]
})

/** Slow on purpose: 120–160s per loop. Alternating direction, staggered starts. */
const COLUMN_MOTION = [
  { name: 'auth-wall-up', seconds: 120, offset: '-8%' },
  { name: 'auth-wall-down', seconds: 150, offset: '-20%' },
  { name: 'auth-wall-up', seconds: 130, offset: '-4%' },
  { name: 'auth-wall-down', seconds: 160, offset: '-28%' },
  { name: 'auth-wall-up', seconds: 140, offset: '-14%' },
]

const ACCOUNT_BENEFITS = [
  'Continue watching on any device',
  'Save titles to your list',
  'Recommendations that learn what you like',
]

/**
 * Sign-in / sign-up screen: a slowly scrolling poster wall beside the form on
 * large screens, the form alone (and scrollable — a fixed-height panel cut it
 * off on short phones) everywhere else.
 */
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen bg-[#020617] text-slate-100 selection:bg-blue-500/30">
      {/* Poster wall */}
      <div className="relative hidden flex-1 overflow-hidden lg:block" aria-hidden="true">
        <div className="absolute -inset-x-[5%] -inset-y-[10%] flex -rotate-[8deg] items-start gap-2.5">
          {COLUMNS.map((posters, c) => (
            <div
              key={c}
              className="flex flex-1 flex-col gap-2.5"
              style={{
                marginTop: COLUMN_MOTION[c].offset,
                animation: `${COLUMN_MOTION[c].name} ${COLUMN_MOTION[c].seconds}s linear infinite`,
                willChange: 'transform',
              }}
            >
              {posters.map((src, i) => (
                <img
                  key={i}
                  src={src}
                  alt=""
                  decoding="async"
                  className="aspect-[2/3] w-full rounded-[10px] object-cover shadow-[0_4px_20px_rgba(0,0,0,0.55)] ring-1 ring-white/5"
                />
              ))}
            </div>
          ))}
        </div>
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#020617_0%,transparent_14%,transparent_50%,rgba(2,6,23,0.7)_72%,#020617_100%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,#020617_0%,transparent_14%,transparent_84%,#020617_100%)]" />
        <div className="absolute inset-0 bg-[#020617]/25" />
      </div>

      {/* Form */}
      <div className="flex w-full flex-col justify-center px-6 py-12 sm:px-12 lg:w-[460px] xl:w-[520px] xl:px-14">
        <div className="mx-auto w-full max-w-[370px]">
          <Link to="/" className="mb-12 flex items-center gap-2.5" aria-label="StreamVault home">
            <Clapperboard className="h-7 w-7 text-blue-500" strokeWidth={2.5} />
            <span className="text-2xl font-bold tracking-tight text-white">
              Stream<span className="text-blue-500">Vault</span>
            </span>
          </Link>
          {children}
          <p className="mx-auto mt-8 max-w-[280px] text-center text-[11px] leading-relaxed text-slate-500">
            By continuing, you agree to our Terms of Service and Privacy Policy.
          </p>
        </div>
      </div>
    </div>
  )
}

/** The list of what an account adds, under the heading. */
export function BenefitList() {
  return (
    <ul className="mb-9 space-y-3">
      {ACCOUNT_BENEFITS.map((text) => (
        <li key={text} className="flex items-center gap-3 text-[15px] text-slate-300">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-500/15">
            <Check className="h-3 w-3 text-blue-400" strokeWidth={3} />
          </span>
          {text}
        </li>
      ))}
    </ul>
  )
}

/** The page's one primary action: white, full width. */
export function AuthButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="flex h-12 w-full items-center justify-center rounded-lg bg-white text-[15px] font-semibold text-black transition-colors hover:bg-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#020617]"
    >
      {children}
    </button>
  )
}
