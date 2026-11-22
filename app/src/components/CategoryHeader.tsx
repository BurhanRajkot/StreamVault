import { useLayoutEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { useScrolled } from '@app/lib/hooks'
import { spring } from '@app/lib/motion'
import { Logo } from './Logo'

/** The phone's browse categories — the home page's modes, and the F1 archive. */
export type Category = 'home' | 'movie' | 'tv' | 'anime' | 'documentary' | 'f1'

const CATEGORIES: { id: Category; label: string; to: string }[] = [
  { id: 'home', label: 'For You', to: '/' },
  { id: 'movie', label: 'Movies', to: '/movies' },
  { id: 'tv', label: 'Shows', to: '/tv' },
  { id: 'anime', label: 'Anime', to: '/anime' },
  { id: 'documentary', label: 'Docs', to: '/documentaries' },
  { id: 'f1', label: 'F1', to: '/f1' },
]

/**
 * The phone's header: logo and categories, clear over a hero (`overHero`),
 * frosted glass once scrolled — or from the start on a page without one.
 */
export function CategoryHeader({ active, overHero = true }: { active: Category; overHero?: boolean }) {
  const scrolled = useScrolled(40)
  const nav = useRef<HTMLElement>(null)

  // The row is wider than a phone: bring the current category into view (F1 sits last)
  useLayoutEffect(() => {
    const row = nav.current
    const pill = row?.querySelector<HTMLElement>('[aria-current="page"]')
    if (!row || !pill) return
    const overflow = pill.offsetLeft + pill.offsetWidth + 16 - (row.scrollLeft + row.clientWidth)
    if (overflow > 0) row.scrollLeft += overflow
  }, [active])

  return (
    <header
      className={cn(
        'fixed inset-x-0 top-0 z-30 pt-safe transition-[background-color,backdrop-filter,box-shadow] duration-300 lg:hidden',
        scrolled || !overHero ? 'material-bar' : 'bg-gradient-to-b from-black/60 via-black/25 to-transparent'
      )}
    >
      <div className="flex h-11 items-center px-4">
        <Logo />
      </div>
      <nav ref={nav} className="no-scrollbar relative flex gap-2 overflow-x-auto px-4 pb-2.5 pt-1" aria-label="Categories">
        {CATEGORIES.map((c) => {
          const isActive = c.id === active
          return (
            <Link
              key={c.id}
              to={c.to}
              replace
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'relative flex h-8 shrink-0 items-center rounded-full px-3.5 text-[14px] font-semibold transition-colors',
                isActive ? 'text-black' : 'glass-button text-white'
              )}
            >
              {isActive && <motion.span layoutId="category-pill" transition={spring} className="absolute inset-0 -z-10 rounded-full bg-white" />}
              {c.label}
            </Link>
          )
        })}
      </nav>
    </header>
  )
}
