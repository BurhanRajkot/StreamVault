import { useEffect, useMemo, useState, type ReactNode } from 'react'
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
import { usePremiumIntent } from '@app/lib/premiumHeadStart'
import { isTv } from '@app/native/platform'
import { Button } from './kit'
import { TitleLink, backdropSrcSet, kindOf, titleOf, tmdbImg, yearOf, type MediaKind } from './media'

const ADVANCE_MS = 8000

/** The phone hero's card: a poster, as large as the screen allows below the header. */
const PHONE_CARD = 'hero-card'
/** The wide hero's box — its placeholder has to be exactly this, or the rows jump when it arrives. */
const WIDE_HERO = 'relative h-[min(88vh,52vw)] min-h-[520px] w-full overflow-hidden'

/**
 * Fetch and decode a slide's picture before it's needed, so its crossfade is
 * from one sharp image to the next — not to a blurry stand-in that then
 * snaps sharp while a multi-megapixel JPEG decodes mid-fade.
 */
function warmImage(src: string, srcSet?: string) {
  const img = new Image()
  img.decoding = 'async'
  if (srcSet) {
    img.sizes = '100vw'
    img.srcset = srcSet
  }
  img.src = src
  img.decode().catch(() => {})
}

/**
 * The featured titles: full-bleed artwork that crossfades to the next title
 * every few seconds; a finger swipes between them, a mouse picks one from the dots.
 */
export function HeroCarousel({ items, fallbackKind }: { items: Media[]; fallbackKind?: MediaKind }) {
  const wide = useIsWide()
  const slides = useMemo(() => items.filter((m) => m.backdrop_path && m.poster_path).slice(0, 6), [items])
  const [index, setIndex] = useState(0)
  /** Which way the last change went: a swipe to the next title slides it in from the right. */
  const [direction, setDirection] = useState<1 | -1>(1)
  const [paused, setPaused] = useState(false)
  const current = slides[index % Math.max(1, slides.length)]
  const kind = current ? kindOf(current, fallbackKind) : 'movie'

  // The logo comes with the full details; warm the next one too
  const { data: details } = useTitleDetails(current ? kind : null, current?.id ?? 0)
  const next = slides[(index + 1) % Math.max(1, slides.length)]
  useTitleDetails(next ? kindOf(next, fallbackKind) : null, next?.id ?? 0)

  // The next slide's artwork, ready before it's up
  useEffect(() => {
    if (!next || next === current) return
    if (wide) warmImage(tmdbImg(next.backdrop_path, 'w1280'), backdropSrcSet(next.backdrop_path))
    else warmImage(tmdbImg(next.poster_path, 'w780'))
  }, [next, current, wide])

  useEffect(() => {
    if (paused || slides.length < 2) return
    // A hidden window (minimized, another app on top) holds the current title
    const timer = setInterval(() => {
      if (document.hidden) return
      setDirection(1)
      setIndex((i) => (i + 1) % slides.length)
    }, ADVANCE_MS)
    return () => clearInterval(timer)
  }, [index, paused, slides.length])

  // Placeholders the hero's exact size (the phone's with room for its dots), so nothing under it moves when it arrives
  if (!current)
    return wide ? (
      <div className={cn('skeleton', WIDE_HERO)} />
    ) : (
      <div className="px-4 pb-6 pt-[calc(var(--sat)+100px)]" aria-hidden="true">
        <div className={cn('skeleton mx-auto rounded-[16px]', PHONE_CARD)} />
        <div className="mt-4 h-[6px]" />
      </div>
    )

  const go = (i: number, dir?: 1 | -1) => {
    setDirection(dir ?? (i >= index ? 1 : -1))
    setIndex((i + slides.length) % slides.length)
  }
  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.x < -50 || info.velocity.x < -400) go(index + 1, 1)
    else if (info.offset.x > 50 || info.velocity.x > 400) go(index - 1, -1)
  }
  const dots = (
    <div className="flex justify-center gap-[7px]">
      {slides.map((s, i) => (
        <button
          key={s.id}
          onClick={() => go(i)}
          aria-label={`Show ${titleOf(s)}`}
          aria-current={i === index}
          className={cn('h-[6px] rounded-full transition-all duration-300', i === index ? 'w-[18px] bg-white' : 'w-[6px] bg-white/30 hover:bg-white/50')}
        />
      ))}
    </div>
  )

  if (!wide)
    return (
      <PhoneHero
        media={current}
        kind={kind}
        direction={direction}
        dots={dots}
        onDragStart={() => setPaused(true)}
        onDragEnd={(e, info) => {
          setPaused(false)
          onDragEnd(e, info)
        }}
      />
    )

  const logo = details && details.id === current.id ? deriveMediaDisplay(details, kind).logoImage : null

  return (
    <section className={WIDE_HERO} aria-roledescription="carousel">
      <div className="absolute inset-0">
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
            <img src={tmdbImg(current.backdrop_path, 'w300')} alt="" className="absolute inset-0 h-full w-full object-cover" />
            <img
              src={tmdbImg(current.backdrop_path, 'w1280')}
              srcSet={backdropSrcSet(current.backdrop_path)}
              sizes="100vw"
              alt=""
              draggable={false}
              decoding="async"
              fetchPriority="high"
              className="absolute inset-0 h-full w-full object-cover"
            />
          </motion.div>
        </AnimatePresence>
        {/* Legibility: the copy sits on the dark side */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black via-transparent to-black/30" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black/90 via-black/40 to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-black via-black/70 to-transparent" />
      </div>

      <HeroCopy key={current.id} media={current} kind={kind} logo={logo} />

      <div className="absolute bottom-[calc(4vw+80px)] right-12">{dots}</div>
    </section>
  )
}

function HeroCopy({ media, kind, logo }: { media: Media; kind: MediaKind; logo: string | null }) {
  const navigate = useNavigate()
  const intent = usePremiumIntent({ kind, id: media.id })
  const { isFavorited, toggleFavorite } = useFavorites()
  const [logoReady, setLogoReady] = useState(false)
  const inList = isFavorited(media.id, kind)
  const genres = genreNames(media.genre_ids ?? genreIdsOf(media), 2)
  const year = yearOf(media)
  const meta = [kind === 'tv' ? 'Series' : 'Film', year, genres.join(', ')].filter(Boolean).join(' · ')

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5, delay: 0.15 }}
      className="pointer-events-none absolute bottom-[calc(4vw+64px)] left-0 flex max-w-[min(44rem,50%)] flex-col items-start px-12 text-left"
    >
      {/* A TV's remote skips the title: More Info goes to the same page, and it's one press less between Play and the top bar */}
      {/*
       * The title's box keeps one height whether it holds the name or the
       * logo, and the logo crossfades over the name once it has loaded —
       * swapping one for the other made the copy jump as each slide's logo arrived.
       */}
      <TitleLink item={media} kind={kind} tabIndex={isTv ? -1 : undefined} className="pointer-events-auto mb-4 grid h-36 w-full items-end justify-items-start">
        {logo && (
          <img
            src={logo}
            alt={titleOf(media)}
            onLoad={() => setLogoReady(true)}
            className={cn(
              'col-start-1 row-start-1 max-h-36 max-w-[min(28rem,100%)] object-contain object-left drop-shadow-[0_2px_16px_rgb(0_0_0/0.5)] transition-opacity duration-300 ease-out',
              !logoReady && 'opacity-0'
            )}
          />
        )}
        <h1
          aria-hidden={logoReady || undefined}
          className={cn(
            'col-start-1 row-start-1 line-clamp-2 text-[clamp(2.75rem,4.2vw,4.25rem)] font-bold leading-[1.05] tracking-[-0.02em] text-white transition-opacity duration-300 ease-out',
            logoReady && 'opacity-0'
          )}
        >
          {titleOf(media)}
        </h1>
      </TitleLink>
      <p className="mb-4 text-[15px] font-medium text-white/70">{meta}</p>
      <p className="mb-6 line-clamp-3 max-w-[36rem] text-[15px] leading-relaxed text-white/75">{media.overview}</p>
      <div className="pointer-events-auto flex items-center gap-3">
        <Button size="lg" onClick={() => navigate(`/watch/${kind}/${media.id}`)} {...intent} data-tv-autofocus className="px-8">
          <Play className="fill-current" /> Play
        </Button>
        <motion.button
          whileTap={{ scale: 0.92 }}
          onClick={() => toggleFavorite(media.id, kind, media.genre_ids)}
          aria-label={inList ? 'Remove from My List' : 'Add to My List'}
          className="glass-button flex h-[50px] shrink-0 items-center justify-center gap-2 rounded-full px-6 text-[17px] font-semibold text-white"
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.span key={String(inList)} initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.5, opacity: 0 }} transition={spring}>
              {inList ? <Check className="h-[22px] w-[22px]" strokeWidth={2.4} /> : <Plus className="h-[22px] w-[22px]" strokeWidth={2.4} />}
            </motion.span>
          </AnimatePresence>
          <span>My List</span>
        </motion.button>
        <TitleLink
          item={media}
          kind={kind}
          className="glass-button press flex h-[50px] items-center gap-2 rounded-full px-6 text-[17px] font-semibold text-white"
        >
          <Info className="h-5 w-5" /> More Info
        </TitleLink>
      </div>
    </motion.div>
  )
}

/**
 * The phone's hero: the featured title's poster as a card, its colours
 * washed behind it; swipe for the next. The poster carries the title, so no
 * logo is laid over it — just the genres and the two buttons.
 */
/** The phone's next poster comes in from the side it was swiped from, and the last one leaves the other way. */
const slide = {
  enter: (dir: 1 | -1) => ({ opacity: 0, x: `${dir * 18}%` }),
  center: { opacity: 1, x: '0%' },
  exit: (dir: 1 | -1) => ({ opacity: 0, x: `${dir * -18}%` }),
}

function PhoneHero({
  media,
  kind,
  direction,
  dots,
  onDragStart,
  onDragEnd,
}: {
  media: Media
  kind: MediaKind
  direction: 1 | -1
  dots: ReactNode
  onDragStart: () => void
  onDragEnd: (e: unknown, info: PanInfo) => void
}) {
  const navigate = useNavigate()
  const intent = usePremiumIntent({ kind, id: media.id })
  const { isFavorited, toggleFavorite } = useFavorites()
  const inList = isFavorited(media.id, kind)
  const genres = genreNames(media.genre_ids ?? genreIdsOf(media), 3)

  return (
    <section className="relative overflow-hidden px-4 pb-6 pt-[calc(var(--sat)+100px)]" aria-roledescription="carousel">
      {/* The poster's colours, blurred once into a wash (a still image, not a live blur) */}
      <AnimatePresence initial={false}>
        <motion.img
          key={media.id}
          src={tmdbImg(media.poster_path, 'w185')}
          alt=""
          aria-hidden="true"
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.55 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6 }}
          className="pointer-events-none absolute inset-x-0 top-0 h-[80%] w-full scale-125 object-cover blur-[60px]"
        />
      </AnimatePresence>
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/30 via-black/40 to-black" />

      <motion.div
        // The card goes with the finger (it used to give 14% of the way and felt stuck), then springs home as the next one slides in
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.4}
        dragTransition={{ bounceStiffness: 420, bounceDamping: 36 }}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        className={cn('relative mx-auto overflow-hidden rounded-[16px] shadow-[0_24px_60px_-18px_rgb(0_0_0/0.9),inset_0_0_0_var(--hairline)_rgb(255_255_255/0.12)]', PHONE_CARD)}
      >
        <AnimatePresence initial={false} custom={direction}>
          <motion.div
            key={media.id}
            className="absolute inset-0"
            custom={direction}
            variants={slide}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ x: { type: 'spring', stiffness: 380, damping: 40 }, opacity: { duration: 0.3, ease: 'easeOut' } }}
          >
            <TitleLink item={media} kind={kind} aria-label={titleOf(media)} draggable={false} className="absolute inset-0 block">
              <img src={tmdbImg(media.poster_path, 'w185')} alt="" draggable={false} className="absolute inset-0 h-full w-full object-cover" />
              <img src={tmdbImg(media.poster_path, 'w780')} alt="" draggable={false} fetchPriority="high" className="absolute inset-0 h-full w-full object-cover" />
            </TitleLink>
          </motion.div>
        </AnimatePresence>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[45%] bg-gradient-to-t from-black via-black/70 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 flex flex-col items-center px-4 pb-4">
          {genres.length > 0 && (
            <p className="mb-3 flex items-center gap-2 text-[13px] font-medium text-white/85">
              {genres.map((g, i) => (
                <span key={g} className="flex items-center gap-2">
                  {i > 0 && <span className="h-[3px] w-[3px] rounded-full bg-white/50" />}
                  {g}
                </span>
              ))}
            </p>
          )}
          <div className="flex w-full gap-2.5">
            {/* A short phone's card is ~260px wide: no wrapping "My / List" */}
            <Button onClick={() => navigate(`/watch/${kind}/${media.id}`)} {...intent} className="h-11 min-w-0 flex-1 whitespace-nowrap px-3">
              <Play className="fill-current" /> Play
            </Button>
            <Button variant="glass" onClick={() => toggleFavorite(media.id, kind, media.genre_ids)} className="h-11 min-w-0 flex-1 whitespace-nowrap px-3">
              {inList ? <Check strokeWidth={2.6} /> : <Plus strokeWidth={2.6} />} My List
            </Button>
          </div>
        </div>
      </motion.div>
      <div className="relative mt-4">{dots}</div>
    </section>
  )
}
