import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion, type PanInfo } from 'framer-motion'
import { Check, Info, Play, Plus } from 'lucide-react'
import type { Media } from '@/lib/config'
import { genreNames } from '@/lib/genres'
import { deriveMediaDisplay } from '@/lib/mediaDisplay'
import { cn, genreIdsOf } from '@/lib/utils'
import { useFavorites } from '@/context/FavoritesContext'
import { useTitleDetails } from '@app/lib/useTitle'
import { useIsWide } from '@app/lib/hooks'
import { spring } from '@app/lib/motion'
import { Button } from './kit'
import { TitleLink, kindOf, titleOf, tmdbImg, yearOf, type MediaKind } from './media'

const ADVANCE_MS = 8000

/**
 * The featured titles: full-bleed artwork that crossfades to the next title
 * every few seconds; a finger swipes between them, a mouse picks one from the dots.
 */
export function HeroCarousel({ items, fallbackKind }: { items: Media[]; fallbackKind?: MediaKind }) {
  const wide = useIsWide()
  const slides = useMemo(() => items.filter((m) => m.backdrop_path && m.poster_path).slice(0, 6), [items])
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const current = slides[index % Math.max(1, slides.length)]
  const kind = current ? kindOf(current, fallbackKind) : 'movie'

  // The logo comes with the full details; warm the next one too
  const { data: details } = useTitleDetails(current ? kind : null, current?.id ?? 0)
  const next = slides[(index + 1) % Math.max(1, slides.length)]
  useTitleDetails(next ? kindOf(next, fallbackKind) : null, next?.id ?? 0)

  useEffect(() => {
    if (paused || slides.length < 2) return
    // A hidden window (minimized, another app on top) holds the current title
    const timer = setInterval(() => {
      if (!document.hidden) setIndex((i) => (i + 1) % slides.length)
    }, ADVANCE_MS)
    return () => clearInterval(timer)
  }, [index, paused, slides.length])

  if (!current) return <div className="skeleton h-[70vh] max-h-[640px] w-full lg:h-[min(88vh,54vw)] lg:max-h-none" />

  const go = (i: number) => setIndex((i + slides.length) % slides.length)
  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.x < -50 || info.velocity.x < -400) go(index + 1)
    else if (info.offset.x > 50 || info.velocity.x > 400) go(index - 1)
  }
  const logo = details && details.id === current.id ? deriveMediaDisplay(details, kind).logoImage : null

  return (
    <section
      className="relative h-[72vh] max-h-[660px] min-h-[500px] w-full overflow-hidden lg:h-[min(90vh,56vw)] lg:max-h-none lg:min-h-[560px]"
      aria-roledescription="carousel"
    >
      <motion.div
        className="absolute inset-0"
        drag={wide ? false : 'x'}
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.12}
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
            transition={{ duration: 0.7, ease: 'easeInOut' }}
          >
            {/* A small copy at once; the full-size image covers it as it arrives */}
            <img src={tmdbImg(wide ? current.backdrop_path : current.poster_path, 'w300')} alt="" className="absolute inset-0 h-full w-full object-cover" />
            <img
              src={wide ? tmdbImg(current.backdrop_path, 'original') : tmdbImg(current.poster_path, 'w780')}
              alt=""
              draggable={false}
              fetchPriority="high"
              className="absolute inset-0 h-full w-full object-cover"
            />
          </motion.div>
        </AnimatePresence>
        {/* Legibility: the copy sits on the dark side */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black via-black/30 to-black/25 lg:via-transparent lg:to-black/20" />
        <div className="pointer-events-none absolute inset-0 hidden bg-gradient-to-r from-black/90 via-black/40 to-transparent lg:block" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-black via-black/70 to-transparent" />
      </motion.div>

      <HeroCopy key={current.id} media={current} kind={kind} logo={logo} />

      {/* Page dots — and, with a mouse, a jump to any title */}
      <div className="absolute inset-x-0 bottom-[max(1rem,calc(var(--sab)+0.25rem))] flex justify-center gap-[9px] lg:inset-x-auto lg:bottom-[12%] lg:right-12">
        {slides.map((s, i) => (
          <button
            key={s.id}
            onClick={() => go(i)}
            aria-label={`Show ${titleOf(s)}`}
            aria-current={i === index}
            className={cn('h-[7px] w-[7px] rounded-full transition-colors duration-300', i === index ? 'bg-white' : 'bg-white/30 hover:bg-white/50')}
          />
        ))}
      </div>
    </section>
  )
}

function HeroCopy({ media, kind, logo }: { media: Media; kind: MediaKind; logo: string | null }) {
  const navigate = useNavigate()
  const { isFavorited, toggleFavorite } = useFavorites()
  const inList = isFavorited(media.id, kind)
  const genres = genreNames(media.genre_ids ?? genreIdsOf(media), 2)
  const year = yearOf(media)
  const meta = [kind === 'tv' ? 'Series' : 'Film', year, genres.join(', ')].filter(Boolean).join(' · ')

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5, delay: 0.15 }}
      className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center px-5 pb-[calc(max(1rem,var(--sab))+2rem)] text-center lg:bottom-[12%] lg:max-w-[min(44rem,50%)] lg:items-start lg:px-12 lg:pb-0 lg:text-left"
    >
      <TitleLink item={media} kind={kind} className="pointer-events-auto mb-2.5 block lg:mb-4">
        {logo ? (
          <img src={logo} alt={titleOf(media)} className="max-h-[88px] max-w-[72vw] object-contain drop-shadow-[0_2px_16px_rgb(0_0_0/0.5)] lg:max-h-36 lg:max-w-[min(28rem,100%)] lg:object-left" />
        ) : (
          <h1 className="t-large text-white lg:text-[clamp(2.75rem,4.2vw,4.25rem)] lg:leading-[1.05]">{titleOf(media)}</h1>
        )}
      </TitleLink>
      <p className="t-footnote mb-4 font-medium text-white/70 lg:text-[15px]">{meta}</p>
      <p className="mb-6 hidden max-w-[36rem] text-[15px] leading-relaxed text-white/75 lg:line-clamp-3">{media.overview}</p>
      <div className="pointer-events-auto flex w-full max-w-[22rem] items-center gap-3 lg:w-auto lg:max-w-none">
        <Button size="lg" onClick={() => navigate(`/watch/${kind}/${media.id}`)} className="flex-1 lg:flex-none lg:px-8">
          <Play className="fill-current" /> Play
        </Button>
        <motion.button
          whileTap={{ scale: 0.92 }}
          onClick={() => toggleFavorite(media.id, kind, media.genre_ids)}
          aria-label={inList ? 'Remove from My List' : 'Add to My List'}
          className="glass-button flex h-[50px] w-[50px] shrink-0 items-center justify-center rounded-full text-white lg:w-auto lg:gap-2 lg:px-6 lg:text-[17px] lg:font-semibold"
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.span key={String(inList)} initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.5, opacity: 0 }} transition={spring}>
              {inList ? <Check className="h-[22px] w-[22px]" strokeWidth={2.4} /> : <Plus className="h-[22px] w-[22px]" strokeWidth={2.4} />}
            </motion.span>
          </AnimatePresence>
          <span className="hidden lg:inline">My List</span>
        </motion.button>
        <TitleLink
          item={media}
          kind={kind}
          className="glass-button press hidden h-[50px] items-center gap-2 rounded-full px-6 text-[17px] font-semibold text-white lg:flex"
        >
          <Info className="h-5 w-5" /> More Info
        </TitleLink>
      </div>
    </motion.div>
  )
}
