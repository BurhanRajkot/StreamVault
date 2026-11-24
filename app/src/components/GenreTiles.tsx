import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { BROWSE_GENRES, fetchGenreArt, type BrowseGenre } from '@app/lib/extras'
import { item, stagger } from '@app/lib/motion'
import { FadeImg, tmdbImg } from './media'

/** Browse by genre: a tile per genre over a well-known title of it, as Apple TV's search starts. */
export function GenreTiles() {
  const { data: art } = useQuery({ queryKey: ['app-genre-art'], queryFn: fetchGenreArt, staleTime: 24 * 60 * 60 * 1000 })
  return (
    <section className="mb-10">
      <h2 className="mb-3 text-[20px] font-bold leading-[25px] tracking-[-0.012em] lg:text-[22px]">Browse by Genre</h2>
      <motion.ul variants={stagger(0.02)} initial="hidden" animate="show" className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 lg:gap-4 xl:grid-cols-6">
        {BROWSE_GENRES.map((genre) => (
          <motion.li key={genre.slug} variants={item}>
            <GenreTile genre={genre} art={art?.[genre.slug]} />
          </motion.li>
        ))}
      </motion.ul>
    </section>
  )
}

function GenreTile({ genre, art }: { genre: BrowseGenre; art?: string }) {
  return (
    <Link
      to={genre.to ?? `/browse/${genre.slug}`}
      className="group/genre press relative flex aspect-[16/9] items-end overflow-hidden rounded-[12px] bg-fill ring-1 ring-white/[0.08] outline-none focus-visible:ring-2 focus-visible:ring-tint"
    >
      {art && (
        <FadeImg
          src={tmdbImg(art, 'w300')}
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 [@media(hover:hover)]:group-hover/genre:scale-[1.06]"
        />
      )}
      {genre.to && <span className={`absolute inset-0 ${genre.slug === 'anime' ? 'bg-gradient-to-br from-[#5b2bd6] to-[#c2185b]' : 'bg-gradient-to-br from-[#0f766e] to-[#1e3a8a]'}`} />}
      <span className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-black/5" />
      <span className="relative px-3 pb-2.5 text-[16px] font-bold leading-tight tracking-[-0.01em] text-white drop-shadow lg:px-4 lg:pb-3 lg:text-[18px]">{genre.name}</span>
    </Link>
  )
}
