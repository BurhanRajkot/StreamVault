import { useLayoutEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { useScrolled } from '@app/lib/hooks'
import { spring } from '@app/lib/motion'
import { Logo } from './Logo'

/** The phone's browse categories — the home page's modes. (F1 has its own tab.) */
export type Category = 'home' | 'movie' | 'tv' | 'anime' | 'documentary'

const CATEGORIES: { id: Category; label: string; to: string }[] = [
  { id: 'home', label: 'For You', to: '/' },
  { id: 'movie', label: 'Movies', to: '/movies' },
  { id: 'tv', label: 'Shows', to: '/tv' },
  { id: 'anime', label: 'Anime', to: '/anime' },
  { id: 'documentary', label: 'Docs', to: '/documentaries' },
]

/**
 * The phone's header: logo and categories, clear over a hero (`overHero`),
 * frosted glass once scrolled — or from the start on a page without one.
 */
export function CategoryHeader({ active, overHero = true }: { active: Category; overHero?: boolean }) {
  const scrolled = useScrolled(40)
  const nav = useRef<HTMLElement>(null)

  // The row can be wider than a phone: bring the current category into view
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
        scrolled || !overHero ? 'material-bar' : 'bg-gradient-to-b from-black/50 to-transparent'
      )}
    >
      <div className="flex h-12 items-center px-4">
        <Logo compact />
      </div>
      <nav ref={nav} className="no-scrollbar relative flex gap-2 overflow-x-auto px-4 pb-3 pt-0.5" aria-label="Categories">
        {CATEGORIES.map((c) => {
          const isActive = c.id === active
          return (
            <Link
              key={c.id}
              to={c.to}
              replace
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'relative flex h-[30px] shrink-0 items-center rounded-full px-3.5 text-[13.5px] font-semibold transition-colors',
                isActive ? 'text-black' : 'text-white/85 shadow-[inset_0_0_0_1px_rgb(255_255_255/0.28)] active:bg-white/10'
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
