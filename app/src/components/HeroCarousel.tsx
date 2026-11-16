import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion, type PanInfo } from 'framer-motion'
import { Check, Info, Play, Plus, Star } from 'lucide-react'
import type { Media } from '@/lib/config'
import { genreNames } from '@/lib/genres'
import { deriveMediaDisplay } from '@/lib/mediaDisplay'
import { cn, genreIdsOf } from '@/lib/utils'
import { useFavorites } from '@/context/FavoritesContext'
import { useTitleDetails } from '@app/lib/useTitle'
import { useAmbient } from '@app/lib/ambient'
import { useIsWide } from '@app/lib/hooks'
import { EASE_OUT, spring, stagger } from '@app/lib/motion'
import { kindOf, titleOf, tmdbImg, yearOf, type MediaKind } from './media'

const ADVANCE_MS = 9000

/**
 * The featured titles: a full-bleed, slowly drifting backdrop that crossfades
 * to the next title every few seconds; a finger swipes between them, a mouse
 * picks one from the bars.
 */
export function HeroCarousel({ items, fallbackKind }: { items: Media[]; fallbackKind?: MediaKind }) {
  const wide = useIsWide()
  const slides = useMemo(() => items.filter((m) => m.backdrop_path && m.poster_path).slice(0, 6), [items])
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const current = slides[index % Math.max(1, slides.length)]
  const kind = current ? kindOf(current, fallbackKind) : 'movie'

  // The logo and certification come with the full details; warm the next one too
  const { data: details } = useTitleDetails(current ? kind : null, current?.id ?? 0)
  const next = slides[(index + 1) % Math.max(1, slides.length)]
  useTitleDetails(next ? kindOf(next, fallbackKind) : null, next?.id ?? 0)

  useAmbient(current ? tmdbImg(current.backdrop_path, 'w300') : null)

  useEffect(() => {
    if (paused || slides.length < 2) return
    // A hidden window (minimized, another app on top) holds the current title
    const timer = setInterval(() => {
      if (!document.hidden) setIndex((i) => (i + 1) % slides.length)
    }, ADVANCE_MS)
    return () => clearInterval(timer)
  }, [index, paused, slides.length])

  if (!current) return <div className="skeleton h-[72vh] max-h-[660px] w-full lg:h-[min(90vh,56vw)] lg:max-h-none" />

  const go = (i: number) => setIndex((i + slides.length) % slides.length)
  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.x < -50 || info.velocity.x < -400) go(index + 1)
    else if (info.offset.x > 50 || info.velocity.x > 400) go(index - 1)
  }
  const logo = details && details.id === current.id ? deriveMediaDisplay(details, kind).logoImage : null

  return (
    <section
      className="relative h-[74vh] max-h-[680px] min-h-[480px] w-full overflow-hidden lg:h-[min(92vh,57vw)] lg:max-h-none lg:min-h-[560px]"
      aria-roledescription="carousel"
    >
      <motion.div
        className="absolute inset-0"
        drag={wide ? false : 'x'}
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.18}
        onDragStart={() => setPaused(true)}
        onDragEnd={(e, info) => {
          setPaused(false)
          onDragEnd(e, info)
        }}
      >
        <AnimatePresence initial={false}>
          <motion.div
            key={current.id}
            className="absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.1, ease: 'easeInOut' }}
          >
            {/* A small copy at once; the full-size image covers it as it arrives */}
            <img src={tmdbImg(wide ? current.backdrop_path : current.poster_path, 'w300')} alt="" className="absolute inset-0 h-full w-full scale-[1.14] object-cover" />
            <motion.img
              src={wide ? tmdbImg(current.backdrop_path, 'original') : tmdbImg(current.poster_path, 'w780')}
              alt=""
              draggable={false}
              fetchPriority="high"
              initial={{ scale: 1.14 }}
              animate={{ scale: 1.02 }}
              transition={{ duration: ADVANCE_MS / 1000 + 2, ease: 'linear' }}
              className={cn('absolute inset-0 h-full w-full object-cover', index % 2 ? 'origin-[70%_30%]' : 'origin-[30%_40%]')}
            />
          </motion.div>
        </AnimatePresence>
        {/* Legibility: the copy sits on the dark side */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-background via-background/35 to-black/40 lg:via-transparent lg:to-black/30" />
        <div className="pointer-events-none absolute inset-0 hidden bg-gradient-to-r from-background/95 via-background/50 to-transparent lg:block" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-background to-transparent" />
      </motion.div>

      <HeroCopy key={current.id} media={current} kind={kind} logo={logo} />

      {/* Where we are — and, with a mouse, a jump to any of them */}
      <div className="absolute inset-x-0 bottom-[max(1.25rem,calc(var(--sab)+0.5rem))] flex justify-center gap-1.5 lg:bottom-auto lg:left-auto lg:right-12 lg:top-[calc(var(--topbar-h)+1.5rem)] lg:gap-2">
        {slides.map((s, i) => (
          <button
            key={s.id}
            onClick={() => go(i)}
            aria-label={`Show ${titleOf(s)}`}
            className={cn('relative h-1.5 overflow-hidden rounded-full bg-white/25 transition-all duration-500 lg:h-1', i === index ? 'w-7 lg:w-12' : 'w-1.5 lg:w-6 lg:hover:bg-white/50')}
          >
            {i === index && (
              <motion.span
                key={`${s.id}-${paused}`}
                className="absolute inset-y-0 left-0 rounded-full bg-white"
                initial={{ width: paused ? '100%' : '0%' }}
                animate={{ width: '100%' }}
                transition={{ duration: paused ? 0 : ADVANCE_MS / 1000, ease: 'linear' }}
              />
            )}
          </button>
        ))}
      </div>
    </section>
  )
}

function HeroCopy({ media, kind, logo }: { media: Media; kind: MediaKind; logo: string | null }) {
  const navigate = useNavigate()
  const { isFavorited, toggleFavorite } = useFavorites()
  const inList = isFavorited(media.id, kind)
  const genres = genreNames(media.genre_ids ?? genreIdsOf(media), 3)
  const year = yearOf(media)
  const rise = { hidden: { opacity: 0, y: 22 }, show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: EASE_OUT } } }

  return (
    <motion.div
      variants={stagger(0.08, 0.15)}
      initial="hidden"
      animate="show"
      className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center px-5 pb-[calc(max(1.25rem,var(--sab))+2.25rem)] text-center lg:bottom-[14%] lg:max-w-[min(46rem,52%)] lg:items-start lg:px-12 lg:pb-0 lg:text-left"
    >
      <motion.div variants={rise} className="mb-3 lg:mb-4">
        {logo ? (
          <img src={logo} alt={titleOf(media)} className="max-h-24 max-w-[78vw] object-contain drop-shadow-[0_4px_24px_rgb(0_0_0/0.6)] lg:max-h-36 lg:max-w-[min(30rem,100%)] lg:object-left" />
        ) : (
          <h1 className="font-display text-[34px] font-extrabold leading-[1.02] tracking-tight text-white drop-shadow-lg lg:text-[clamp(2.75rem,4.4vw,4.75rem)]">{titleOf(media)}</h1>
        )}
      </motion.div>
      <motion.div variants={rise} className="mb-4 flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1 text-[12.5px] font-medium text-white/75 lg:justify-start lg:text-[14px]">
        {media.vote_average > 0 && (
          <span className="flex items-center gap-1 font-bold text-amber-300">
            <Star className="h-3.5 w-3.5 fill-current" /> {media.vote_average.toFixed(1)}
          </span>
        )}
        {year && <span>{year}</span>}
        <span>{kind === 'tv' ? 'Series' : 'Film'}</span>
        {genres.map((g) => (
          <span key={g} className="before:mr-2.5 before:text-white/35 before:content-['•']">
            {g}
          </span>
        ))}
      </motion.div>
      <motion.p variants={rise} className="mb-6 hidden max-w-[38rem] text-[15px] leading-relaxed text-white/75 lg:line-clamp-3">
        {media.overview}
      </motion.p>
      <motion.div variants={rise} className="pointer-events-auto flex w-full max-w-sm gap-2.5 lg:w-auto lg:max-w-none lg:gap-3">
        <motion.button
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.95 }}
          transition={spring}
          onClick={() => navigate(`/watch/${kind}/${media.id}`)}
          className="flex flex-1 items-center justify-center gap-2 rounded-full bg-white px-6 py-3 text-[15px] font-bold text-black shadow-[0_10px_40px_-10px_rgb(255_255_255/0.5)] lg:flex-none lg:px-9 lg:py-3.5 lg:text-[16px]"
        >
          <Play className="h-5 w-5 fill-current" /> Play
        </motion.button>
        <motion.button
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.95 }}
          transition={spring}
          onClick={() => toggleFavorite(media.id, kind, media.genre_ids)}
          className="glass flex flex-1 items-center justify-center gap-2 rounded-full px-5 py-3 text-[15px] font-bold text-white lg:flex-none lg:px-7 lg:py-3.5"
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.span key={String(inList)} initial={{ scale: 0.4, rotate: -90, opacity: 0 }} animate={{ scale: 1, rotate: 0, opacity: 1 }} exit={{ scale: 0.4, opacity: 0 }} transition={spring}>
              {inList ? <Check className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
            </motion.span>
          </AnimatePresence>
          My List
        </motion.button>
        <Link
          to={`/title/${kind}/${media.id}`}
          aria-label="More info"
          className="glass press flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-white transition-transform hover:scale-105 lg:h-[52px] lg:w-auto lg:gap-2 lg:px-6 lg:text-[15px] lg:font-bold"
        >
          <Info className="h-5 w-5" /> <span className="hidden lg:inline">More Info</span>
        </Link>
      </motion.div>
    </motion.div>
  )
}
