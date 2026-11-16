import { useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth0 } from '@auth0/auth0-react'
import { toast } from 'sonner'
import { AnimatePresence, motion, useScroll, useTransform } from 'framer-motion'
import { ArrowLeft, Check, CheckCircle2, ChevronDown, Download, Loader2, Play, Plus, Share2, Star, ThumbsUp, Zap } from 'lucide-react'
import { DEBRID_SERVER_ID, defaultServer, serverOptions, type Media } from '@/lib/config'
import { logRecommendationInteraction } from '@/lib/api'
import { deriveMediaDisplay } from '@/lib/mediaDisplay'
import { useSeasonEpisodes } from '@/hooks/useSeasonEpisodes'
import { usePremiumAccess } from '@/hooks/usePremiumAccess'
import { useFavorites } from '@/context/FavoritesContext'
import { cn, genreIdsOf } from '@/lib/utils'
import { SITE_URL } from '@app/native/platform'
import { useSettings } from '@app/lib/settings'
import { useAmbient } from '@app/lib/ambient'
import { useIsWide, useScrolled } from '@app/lib/hooks'
import { EASE_OUT, item, spring, stagger } from '@app/lib/motion'
import { parseKind, useSeasons, useTitleDetails, type TitleKind } from '@app/lib/useTitle'
import { useDownloadAction, type DownloadTarget } from '@app/downloads/useDownloadAction'
import { useContinueWatching } from '@app/components/ContinueWatchingRow'
import { FadeImg, PosterGrid, tmdbImg } from '@app/components/media'
import { ServerChips } from '@app/components/ServerSheet'
import { DownloadOptionsSheet } from '@app/components/DownloadOptionsSheet'
import { Sheet } from '@app/components/Sheet'

export function TitleScreen() {
  const params = useParams()
  const kind = parseKind(params.type)
  const id = Number(params.id)
  const { data: media, isLoading, isError, refetch } = useTitleDetails(kind, id)

  if (!kind || !id) return null

  return (
    <div className="pb-tabbar">
      {media ? (
        <TitleBody key={`${kind}-${id}`} media={media} kind={kind} />
      ) : isLoading ? (
        <TitleSkeleton />
      ) : (
        <div className="flex min-h-[80dvh] flex-col items-center justify-center gap-3 px-8 text-center">
          <PhoneBar title="" />
          <p className="font-display text-[18px] font-extrabold">Couldn&apos;t load this title</p>
          <p className="text-[13px] text-white/55">{isError ? 'The server may be waking up.' : 'It may not exist.'} Trying again usually works.</p>
          <button onClick={() => void refetch()} className="press mt-2 rounded-full bg-white px-6 py-2.5 text-[13.5px] font-bold text-black">
            Try again
          </button>
        </div>
      )}
    </div>
  )
}

/** The phone's back button, and the title once you've scrolled past the artwork. */
function PhoneBar({ title }: { title: string }) {
  const navigate = useNavigate()
  const scrolled = useScrolled(260)
  return (
    <div
      className={cn(
        'fixed inset-x-0 top-0 z-30 flex items-center gap-2 px-3 pb-2 pt-[calc(var(--sat)+8px)] transition-[background-color,backdrop-filter] duration-300 lg:hidden',
        scrolled ? 'glass-strong' : 'bg-transparent'
      )}
    >
      <button
        onClick={() => (window.history.state?.idx > 0 ? navigate(-1) : navigate('/'))}
        aria-label="Back"
        className="press flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-md"
      >
        <ArrowLeft className="h-5 w-5" />
      </button>
      <AnimatePresence>
        {scrolled && title && (
          <motion.p initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} className="font-display truncate text-[16px] font-extrabold">
            {title}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  )
}

function TitleSkeleton() {
  return (
    <div>
      <PhoneBar title="" />
      <div className="skeleton h-[58vh] w-full lg:h-[88vh]" />
      <div className="-mt-32 space-y-3 px-4 lg:px-12">
        <div className="skeleton h-14 w-2/3 max-w-md rounded-xl" />
        <div className="skeleton h-4 w-1/2 max-w-sm rounded" />
        <div className="skeleton h-12 w-full max-w-sm rounded-full" />
      </div>
    </div>
  )
}

type Tab = 'episodes' | 'similar' | 'details'

function TitleBody({ media, kind }: { media: Media; kind: TitleKind }) {
  const navigate = useNavigate()
  const wide = useIsWide()
  const settings = useSettings()
  const { isAuthenticated, getAccessTokenSilently } = useAuth0()
  const { premium } = usePremiumAccess()
  const { isFavorited, toggleFavorite } = useFavorites()
  const display = useMemo(() => deriveMediaDisplay(media, kind), [media, kind])
  const { data: seasons = [] } = useSeasons(kind, media.id)
  const { data: continueEntries } = useContinueWatching()
  const progress = continueEntries?.find((e) => e.item.tmdbId === media.id && e.item.mediaType === kind)?.item

  useAmbient(tmdbImg(media.backdrop_path || media.poster_path, 'w300'))

  const [server, setServer] = useState(() => {
    const saved = progress?.server
    const preferred = saved || settings.defaultServer
    if (preferred === DEBRID_SERVER_ID) return premium ? DEBRID_SERVER_ID : defaultServer(kind)
    return preferred && serverOptions(kind).some((o) => o.id === preferred) ? preferred : defaultServer(kind)
  })
  const [season, setSeason] = useState(progress?.season ?? 1)
  const [seasonsOpen, setSeasonsOpen] = useState(false)
  const [download, setDownload] = useState<DownloadTarget | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [liked, setLiked] = useState(false)
  const [tab, setTab] = useState<Tab>(kind === 'tv' ? 'episodes' : 'similar')

  const activeSeason = seasons.some((s) => s.season_number === season) ? season : seasons[0]?.season_number ?? season
  const imdbId = media.imdb_id ?? media.external_ids?.imdb_id
  const inList = isFavorited(media.id, kind)
  const downloads = useDownloadAction()

  // Parallax: the artwork drifts and dims as the page scrolls over it
  const { scrollY } = useScroll()
  const artY = useTransform(scrollY, [0, 800], [0, wide ? 160 : 120])
  const artScale = useTransform(scrollY, [0, 800], [1.04, 1.16])
  const artOpacity = useTransform(scrollY, [0, wide ? 900 : 500], [1, wide ? 0.25 : 0.1])

  const play = (s?: number, e?: number) => {
    const qs = new URLSearchParams({ server })
    if (kind === 'tv') {
      qs.set('s', String(s ?? progress?.season ?? activeSeason))
      qs.set('e', String(e ?? progress?.episode ?? 1))
    }
    navigate(`/watch/${kind}/${media.id}?${qs}`)
  }

  const downloadTarget = (s?: number, e?: number, episodeName?: string): DownloadTarget => ({
    tmdbId: media.id,
    mediaType: kind,
    title: display.title,
    year: display.year,
    imdbId,
    season: kind === 'tv' ? s : undefined,
    episode: kind === 'tv' ? e : undefined,
    episodeName,
    posterUrl: tmdbImg(media.poster_path, 'w342'),
  })

  const like = async () => {
    const next = !liked
    setLiked(next)
    if (!next) return
    toast.success('Thanks — we’ll recommend more like this')
    try {
      const token = isAuthenticated ? await getAccessTokenSilently() : null
      await logRecommendationInteraction(token, { tmdbId: media.id, mediaType: kind, eventType: 'rate', rating: 5, genreIds: genreIdsOf(media) })
    } catch {
      /* a lost signal isn't worth an error */
    }
  }

  const share = async () => {
    const slug = display.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
    const url = `${SITE_URL}/watch/${kind}/${media.id}-${slug}`
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({ title: display.title, url })
        return
      }
      await navigator.clipboard.writeText(url)
      toast.success('Link copied')
    } catch {
      /* dismissed */
    }
  }

  const movieRecord = kind === 'movie' ? downloads.recordFor({ tmdbId: media.id, mediaType: 'movie' }) : undefined
  const resumeLabel = kind === 'tv' && progress ? `Resume S${progress.season ?? 1} · E${progress.episode ?? 1}` : progress ? 'Resume' : 'Play'
  const similar = (media.similar?.results ?? []).filter((m) => m.poster_path).slice(0, 18)
  const tabs: { id: Tab; label: string }[] = [
    ...(kind === 'tv' ? [{ id: 'episodes' as const, label: 'Episodes' }] : []),
    ...(similar.length ? [{ id: 'similar' as const, label: 'More Like This' }] : []),
    { id: 'details', label: 'Details' },
  ]
  const shownTab = tabs.some((t) => t.id === tab) ? tab : tabs[0].id
  const rise = { hidden: { opacity: 0, y: 24 }, show: { opacity: 1, y: 0, transition: { duration: 0.65, ease: EASE_OUT } } }

  return (
    <div>
      <PhoneBar title={display.title} />

      {/* Artwork: fixed behind a wide window, at the top of a phone's page */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[62vh] overflow-hidden lg:fixed lg:inset-0 lg:h-auto">
        <motion.div style={{ y: artY, scale: artScale, opacity: artOpacity }} className="absolute inset-0">
          {/* A small copy shows at once; the full-size one fades in over it */}
          <img src={tmdbImg(media.backdrop_path || media.poster_path, 'w300')} alt="" className="absolute inset-0 h-full w-full object-cover object-top" />
          <FadeImg src={tmdbImg(media.backdrop_path || media.poster_path, wide ? 'original' : 'w1280')} fetchPriority="high" className="relative h-full w-full object-cover object-top" />
        </motion.div>
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-black/30 lg:via-background/20" />
        <div className="absolute inset-0 hidden bg-gradient-to-r from-background via-background/70 to-transparent lg:block" />
      </div>

      {/* Headline */}
      <motion.section
        variants={stagger(0.07, 0.1)}
        initial="hidden"
        animate="show"
        className="relative z-10 flex flex-col px-4 pb-2 pt-[38vh] lg:min-h-[92vh] lg:max-w-[min(52rem,62%)] lg:justify-end lg:px-12 lg:pb-14 lg:pt-[calc(var(--topbar-h)+2rem)]"
      >
        <motion.div variants={rise} className="mb-3 lg:mb-5">
          {display.logoImage ? (
            <img src={display.logoImage} alt={display.title} className="max-h-24 max-w-[80%] object-contain object-left drop-shadow-[0_4px_24px_rgb(0_0_0/0.7)] lg:max-h-40 lg:max-w-[32rem]" />
          ) : (
            <h1 className="font-display text-[34px] font-extrabold leading-[1.02] tracking-tight drop-shadow-lg lg:text-[clamp(2.75rem,4.6vw,5rem)]">{display.title}</h1>
          )}
        </motion.div>

        <motion.div variants={rise} className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px] font-medium text-white/70 lg:text-[14.5px]">
          {display.rating > 0 && (
            <span className="flex items-center gap-1 font-bold text-amber-300">
              <Star className="h-4 w-4 fill-current" /> {display.rating.toFixed(1)}
            </span>
          )}
          {display.year && <span>{display.year}</span>}
          {display.contentRating !== 'NR' && <span className="rounded-md border border-white/30 px-1.5 text-[11px] font-bold leading-5">{display.contentRating}</span>}
          {display.durationStr && <span>{display.durationStr}</span>}
          <span className="rounded-md bg-white/15 px-1.5 text-[10.5px] font-extrabold leading-5 tracking-wider text-white">HD</span>
        </motion.div>

        {display.genres.length > 0 && (
          <motion.div variants={rise} className="mb-4 flex flex-wrap gap-1.5">
            {display.genres.slice(0, 4).map((g) => (
              <span key={g} className="rounded-full bg-white/[0.08] px-3 py-1 text-[11.5px] font-semibold text-white/80 ring-1 ring-inset ring-white/10 backdrop-blur-sm">
                {g}
              </span>
            ))}
          </motion.div>
        )}

        <motion.p
          variants={rise}
          onClick={() => setExpanded((v) => !v)}
          className={cn('mb-5 max-w-[42rem] cursor-pointer text-[14px] leading-relaxed text-white/80 lg:text-[15.5px]', !expanded && 'line-clamp-3')}
        >
          {display.description}
        </motion.p>

        {/* Play, download, list */}
        <motion.div variants={rise} className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center lg:gap-3">
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.96 }}
            transition={spring}
            onClick={() => play()}
            className="relative flex items-center justify-center gap-2.5 overflow-hidden rounded-full bg-white px-8 py-3.5 text-[15.5px] font-extrabold text-black shadow-[0_12px_40px_-12px_rgb(255_255_255/0.55)] lg:px-10 lg:text-[16px]"
          >
            <Play className="h-5 w-5 fill-current" /> {resumeLabel}
            {progress && (
              <span className="absolute inset-x-6 bottom-1.5 h-[3px] overflow-hidden rounded-full bg-black/15">
                <span className="block h-full rounded-full bg-primary" style={{ width: `${Math.round(progress.progress * 100)}%` }} />
              </span>
            )}
          </motion.button>
          {kind === 'movie' && (
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.96 }}
              transition={spring}
              onClick={() => (movieRecord?.status === 'done' ? navigate(`/offline/${encodeURIComponent(movieRecord.id)}`) : setDownload(downloadTarget()))}
              className="glass flex items-center justify-center gap-2 rounded-full px-7 py-3.5 text-[15px] font-bold text-white"
            >
              {movieRecord?.status === 'done' ? (
                <>
                  <CheckCircle2 className="h-5 w-5 text-emerald-400" /> Downloaded
                </>
              ) : movieRecord && movieRecord.status !== 'failed' ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" /> {movieRecord.total ? Math.round((movieRecord.bytes / movieRecord.total) * 100) : 0}%
                </>
              ) : (
                <>
                  <Download className="h-5 w-5" /> Download
                </>
              )}
            </motion.button>
          )}
          <div className="flex justify-center gap-2 sm:justify-start">
            <RoundAction label={inList ? 'In My List' : 'My List'} onClick={() => toggleFavorite(media.id, kind, genreIdsOf(media))} active={inList}>
              <AnimatePresence mode="wait" initial={false}>
                <motion.span key={String(inList)} initial={{ scale: 0.3, rotate: -90 }} animate={{ scale: 1, rotate: 0 }} exit={{ scale: 0.3 }} transition={spring}>
                  {inList ? <Check className="h-5 w-5" strokeWidth={2.6} /> : <Plus className="h-5 w-5" />}
                </motion.span>
              </AnimatePresence>
            </RoundAction>
            <RoundAction label="I like this" onClick={() => void like()} active={liked}>
              <motion.span animate={liked ? { scale: [1, 1.4, 1], rotate: [0, -15, 0] } : { scale: 1 }} transition={{ duration: 0.45 }}>
                <ThumbsUp className={cn('h-5 w-5', liked && 'fill-current')} />
              </motion.span>
            </RoundAction>
            <RoundAction label="Share" onClick={() => void share()}>
              <Share2 className="h-5 w-5" />
            </RoundAction>
          </div>
        </motion.div>

        {/* Where it plays — chosen before pressing Play, changeable again in the player */}
        <motion.div variants={rise} className="mt-5">
          <p className="mb-2 text-[10.5px] font-bold uppercase tracking-[0.16em] text-white/45">Play on</p>
          <ServerChips kind={kind} server={server} onPick={setServer} />
        </motion.div>
      </motion.section>

      {/* Below the fold */}
      <div className="relative z-10 bg-gradient-to-b from-transparent via-background/95 to-background pt-6 lg:via-background/90 lg:pt-10">
        <div className="px-4 lg:px-12">
          <div className="no-scrollbar mb-5 flex gap-6 overflow-x-auto border-b border-white/[0.08]">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn('font-display relative shrink-0 pb-3 text-[15px] font-extrabold transition-colors lg:text-[17px]', shownTab === t.id ? 'text-white' : 'text-white/45 hover:text-white/75')}
              >
                {t.label}
                {shownTab === t.id && <motion.span layoutId="title-tab" transition={spring} className="absolute inset-x-0 -bottom-px h-[3px] rounded-full bg-primary" />}
              </button>
            ))}
          </div>

          <AnimatePresence mode="wait">
            <motion.div key={shownTab} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.3, ease: EASE_OUT }}>
              {shownTab === 'episodes' && (
                <Episodes
                  media={media}
                  seasons={seasons}
                  season={activeSeason}
                  onSeason={setSeason}
                  onOpenSeasons={() => setSeasonsOpen(true)}
                  progress={progress}
                  onPlay={(e) => play(activeSeason, e)}
                  onDownload={(e, name) => setDownload(downloadTarget(activeSeason, e, name))}
                  downloads={downloads}
                />
              )}
              {shownTab === 'similar' && <PosterGrid items={similar} kind={kind} />}
              {shownTab === 'details' && <Details media={media} kind={kind} display={display} />}
            </motion.div>
          </AnimatePresence>

          {!premium && (
            <Link
              to="/premium"
              className="group mt-10 flex items-center gap-4 overflow-hidden rounded-2xl bg-gradient-to-r from-amber-500/[0.16] via-amber-500/[0.05] to-transparent p-4 ring-1 ring-amber-400/25 transition-colors hover:from-amber-500/25 lg:max-w-2xl"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-400 text-black transition-transform group-hover:rotate-12 group-hover:scale-110">
                <Zap className="h-5 w-5" />
              </span>
              <span className="text-[13px] text-white/70">
                <span className="font-display block text-[15px] font-extrabold text-amber-200">StreamVault Premium</span>
                4K from Real-Debrid, subtitles and offline downloads.
              </span>
            </Link>
          )}
        </div>
      </div>

      <DownloadOptionsSheet target={download} onClose={() => setDownload(null)} />
      <Sheet open={seasonsOpen} onOpenChange={setSeasonsOpen} title="Seasons">
        <ul className="flex flex-col gap-1">
          {seasons.map((s) => (
            <li key={s.season_number}>
              <button
                onClick={() => {
                  setSeason(s.season_number)
                  setSeasonsOpen(false)
                }}
                className={cn(
                  'flex w-full items-center justify-between rounded-xl px-3.5 py-3 text-left text-[14px] transition-colors',
                  s.season_number === activeSeason ? 'bg-white/[0.1] font-bold text-white' : 'text-white/70 hover:bg-white/[0.05]'
                )}
              >
                <span>{s.name || `Season ${s.season_number}`}</span>
                <span className="text-[12px] text-white/40">{s.episode_count} episodes</span>
              </button>
            </li>
          ))}
        </ul>
      </Sheet>
    </div>
  )
}

function RoundAction({ label, onClick, active, children }: { label: string; onClick: () => void; active?: boolean; children: React.ReactNode }) {
  return (
    <motion.button
      whileHover={{ scale: 1.08 }}
      whileTap={{ scale: 0.9 }}
      transition={spring}
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        'flex h-[50px] w-[50px] items-center justify-center rounded-full transition-colors',
        active ? 'bg-white text-black' : 'glass text-white hover:bg-white/15'
      )}
    >
      {children}
    </motion.button>
  )
}

type Downloads = ReturnType<typeof useDownloadAction>

function Episodes({
  media,
  seasons,
  season,
  onSeason,
  onOpenSeasons,
  progress,
  onPlay,
  onDownload,
  downloads,
}: {
  media: Media
  seasons: { season_number: number; episode_count: number; name: string }[]
  season: number
  onSeason: (s: number) => void
  onOpenSeasons: () => void
  progress?: { season?: number; episode?: number; progress: number }
  onPlay: (episode: number) => void
  onDownload: (episode: number, name: string) => void
  downloads: Downloads
}) {
  const navigate = useNavigate()
  const { data: episodes, isLoading } = useSeasonEpisodes(media.id, season, true)
  const fewSeasons = seasons.length <= 10

  return (
    <div>
      {seasons.length > 1 &&
        (fewSeasons ? (
          <div className="no-scrollbar -mx-4 mb-5 flex gap-1.5 overflow-x-auto px-4 lg:mx-0 lg:px-0">
            {seasons.map((s) => (
              <button
                key={s.season_number}
                onClick={() => onSeason(s.season_number)}
                className={cn('relative shrink-0 rounded-full px-4 py-2 text-[13px] font-bold transition-colors', s.season_number === season ? 'text-black' : 'text-white/65 ring-1 ring-inset ring-white/12 hover:text-white')}
              >
                {s.season_number === season && <motion.span layoutId="season-pill" transition={spring} className="absolute inset-0 -z-10 rounded-full bg-white" />}
                Season {s.season_number}
              </button>
            ))}
          </div>
        ) : (
          <button onClick={onOpenSeasons} className="press mb-5 flex items-center gap-1.5 rounded-full bg-white/[0.08] px-4 py-2 text-[13.5px] font-bold ring-1 ring-white/10">
            Season {season} <ChevronDown className="h-4 w-4" />
          </button>
        ))}

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="skeleton aspect-video rounded-xl" />
          ))}
        </div>
      ) : (
        <motion.ul key={season} variants={stagger(0.04)} initial="hidden" animate="show" className="grid gap-x-4 gap-y-5 md:grid-cols-2 xl:grid-cols-3">
          {episodes?.map((ep) => {
            const record = downloads.recordFor({ tmdbId: media.id, mediaType: 'tv', season, episode: ep.episode_number })
            const isCurrent = progress?.season === season && progress?.episode === ep.episode_number
            return (
              <motion.li key={ep.episode_number} variants={item} className="group/ep flex gap-3 md:flex-col md:gap-0">
                <button
                  onClick={() => onPlay(ep.episode_number)}
                  className="press relative w-[140px] shrink-0 overflow-hidden rounded-xl ring-1 ring-white/[0.08] transition-shadow md:w-full hover:shadow-[0_20px_40px_-14px_rgb(0_0_0/0.9),0_0_0_1px_rgb(255_255_255/0.16)]"
                  aria-label={`Play episode ${ep.episode_number}`}
                >
                  <span className="skeleton block aspect-video w-full">
                    <FadeImg src={tmdbImg(ep.still_path || media.backdrop_path, 'w500')} loading="lazy" className="h-full w-full object-cover transition-transform duration-700 group-hover/ep:scale-105" />
                  </span>
                  <span className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
                  <span className="absolute inset-0 flex items-center justify-center">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-black/40 ring-1 ring-white/50 backdrop-blur transition-all duration-300 group-hover/ep:scale-110 group-hover/ep:bg-white group-hover/ep:text-black md:h-12 md:w-12">
                      <Play className="ml-0.5 h-4 w-4 fill-current md:h-5 md:w-5" />
                    </span>
                  </span>
                  <span className="font-display absolute bottom-1.5 left-2.5 text-[20px] font-extrabold text-white/90 drop-shadow md:bottom-2 md:left-3 md:text-[26px]">{ep.episode_number}</span>
                  {isCurrent && progress && (
                    <span className="absolute inset-x-0 bottom-0 h-1 bg-white/25">
                      <span className="block h-full bg-primary" style={{ width: `${Math.round(progress.progress * 100)}%` }} />
                    </span>
                  )}
                </button>
                <div className="flex min-w-0 flex-1 items-start gap-2 md:mt-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-[13.5px] font-bold leading-snug lg:text-[14.5px]">{ep.name}</p>
                    <p className="mt-0.5 text-[11.5px] text-white/45">
                      {ep.runtime ? `${ep.runtime}m` : ''}
                      {isCurrent ? <span className="ml-1.5 font-semibold text-primary">· Watching</span> : null}
                    </p>
                    {ep.overview && <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-white/50 max-md:hidden">{ep.overview}</p>}
                  </div>
                  <button
                    onClick={() => (record?.status === 'done' ? navigate(`/offline/${encodeURIComponent(record.id)}`) : onDownload(ep.episode_number, ep.name))}
                    aria-label={`Download episode ${ep.episode_number}`}
                    className="press -mr-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white/60 transition-colors hover:bg-white/10 hover:text-white"
                  >
                    {record?.status === 'done' ? (
                      <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                    ) : record && record.status !== 'failed' ? (
                      <ProgressRing value={record.total ? record.bytes / record.total : 0} />
                    ) : (
                      <Download className="h-[18px] w-[18px]" />
                    )}
                  </button>
                </div>
              </motion.li>
            )
          })}
        </motion.ul>
      )}
    </div>
  )
}

function Details({ media, kind, display }: { media: Media; kind: TitleKind; display: ReturnType<typeof deriveMediaDisplay> }) {
  const facts: [string, string][] = [
    ['Released', (media.release_date || media.first_air_date || '').split('-').reverse().join('/') || '—'],
    ['Runtime', display.durationStr || '—'],
    ['Rated', display.contentRating],
    ['Genres', display.genres.join(', ') || '—'],
    ...(kind === 'movie' && display.director !== 'Unknown' ? [['Director', display.director] as [string, string]] : []),
    ['Rating', display.rating > 0 ? `${display.rating.toFixed(1)} / 10 on TMDB` : '—'],
  ]
  const castRef = useRef<HTMLDivElement>(null)
  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
      <div>
        {display.cast.length > 0 && (
          <>
            <h3 className="font-display mb-3 text-[15px] font-extrabold">Cast</h3>
            <motion.div ref={castRef} variants={stagger(0.04)} initial="hidden" animate="show" className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-6">
              {display.cast.map((c) => (
                <motion.div key={c.name + c.role} variants={item} className="text-center">
                  <div className="skeleton mx-auto aspect-square w-full max-w-[96px] overflow-hidden rounded-full ring-1 ring-white/10">
                    {!c.image.endsWith('placeholder.svg') && <FadeImg src={c.image} loading="lazy" className="h-full w-full object-cover" />}
                  </div>
                  <p className="mt-2 line-clamp-1 text-[12.5px] font-bold">{c.name}</p>
                  <p className="line-clamp-1 text-[11px] text-white/45">{c.role}</p>
                </motion.div>
              ))}
            </motion.div>
          </>
        )}
      </div>
      <dl className="surface h-fit rounded-2xl p-5">
        {facts.map(([k, v]) => (
          <div key={k} className="flex gap-4 border-b border-white/[0.06] py-2.5 text-[13px] last:border-0">
            <dt className="w-20 shrink-0 text-white/45">{k}</dt>
            <dd className="text-white/85">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

export function ProgressRing({ value, size = 22 }: { value: number; size?: number }) {
  const r = (size - 4) / 2
  const c = 2 * Math.PI * r
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden="true">
      <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.2)" strokeWidth="2.5" fill="none" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke="hsl(var(--primary))"
        strokeWidth="2.5"
        fill="none"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - Math.min(1, Math.max(0, value)))}
        strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 0.6s ease' }}
      />
    </svg>
  )
}
