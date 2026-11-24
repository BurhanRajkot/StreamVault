import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { useAuth0 } from '@auth0/auth0-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { AnimatePresence, motion, useScroll, useTransform } from 'framer-motion'
import { Check, CheckCircle2, ChevronDown, Download, Play, Plus, Share, Star, ThumbsUp } from 'lucide-react'
import { type Media } from '@/lib/config'
import { logRecommendationInteraction } from '@/lib/api'
import { deriveMediaDisplay } from '@/lib/mediaDisplay'
import { useSeasonEpisodes } from '@/hooks/useSeasonEpisodes'
import { usePremiumAccess } from '@/hooks/usePremiumAccess'
import { useDebridToken } from '@/hooks/useDebridToken'
import { DEBRID_SERVER_ID } from '@/lib/config'
import { headStartPremium } from '@app/lib/premiumHeadStart'
import { useFavorites } from '@/context/FavoritesContext'
import { cn, genreIdsOf } from '@/lib/utils'
import { SITE_URL } from '@app/native/platform'
import { useSettings } from '@app/lib/settings'
import { startServer } from '@app/lib/startServer'
import { useIsWide } from '@app/lib/hooks'
import { EASE_OUT, item, spring, stagger } from '@app/lib/motion'
import { parseKind, useSeasons, useTitleDetails, type TitleKind } from '@app/lib/useTitle'
import { useDownloadAction, type DownloadTarget } from '@app/downloads/useDownloadAction'
import { useContinueWatching } from '@app/components/ContinueWatchingRow'
import { FadeImg, PosterGrid, PosterGridSkeleton, tmdbImg } from '@app/components/media'
import { ServerChips } from '@app/components/ServerSheet'
import { DownloadOptionsSheet } from '@app/components/DownloadOptionsSheet'
import { Sheet } from '@app/components/Sheet'
import { Button, CircleButton, ListRow, ListSection, NavBar, SegmentedControl } from '@app/components/kit'
import { languageName, releaseHasLanguage, type AudioLanguage } from '@/lib/audioLanguage'
import { useAudioLanguage } from '@/hooks/useAudioLanguage'
import { findPremiumReleases } from '@/lib/premiumSearch'

export function TitleScreen() {
  const params = useParams()
  const kind = parseKind(params.type)
  const id = Number(params.id)
  // The card that opened this page (TitleLink) — shown at once, while the details load
  const preview = (useLocation().state as { preview?: Media } | null)?.preview
  const { data, isLoading, isError, isPlaceholderData, refetch } = useTitleDetails(kind, id, preview)
  // Should the details fail, the card's own facts still make a page you can play from
  const media = data ?? (preview?.id === id ? preview : undefined)

  if (!kind || !id) return null

  return (
    <div className="pb-tabbar">
      {media ? (
        <TitleBody key={`${kind}-${id}`} media={media} kind={kind} partial={isPlaceholderData} />
      ) : isLoading ? (
        <TitleSkeleton />
      ) : (
        <div className="flex min-h-[80dvh] flex-col items-center justify-center gap-2 px-8 text-center">
          <NavBar title="" back />
          <p className="t-title3">Couldn&apos;t load this title</p>
          <p className="t-subhead text-label-2">{isError ? 'The server may be waking up.' : 'It may not exist.'} Trying again usually works.</p>
          <Button variant="tinted" onClick={() => void refetch()} className="mt-4">
            Try Again
          </Button>
        </div>
      )}
    </div>
  )
}

function TitleSkeleton() {
  return (
    <div>
      <NavBar title="" back />
      <div className="skeleton h-[58vh] w-full lg:h-[88vh]" />
      <div className="-mt-32 space-y-3 px-4 lg:px-12">
        <div className="skeleton h-14 w-2/3 max-w-md rounded-xl" />
        <div className="skeleton h-4 w-1/2 max-w-sm rounded" />
        <div className="skeleton h-[50px] w-full max-w-sm rounded-full" />
      </div>
    </div>
  )
}

type Tab = 'episodes' | 'similar' | 'details'

/** Titles whose opening was already told to recommendations this session. */
const loggedOpens = new Set<string>()
let lastOpenLoggedAt = 0
/**
 * Opens are a weak signal and the interaction endpoint allows 20 events a
 * minute per account: browsing quickly mustn't use up the room a "watch"
 * needs.
 */
const OPEN_LOG_GAP_MS = 8000

/**
 * Tell recommendations this title was opened (a 'click': weak, but it's what
 * fills a new account's taste before it has watched anything).
 */
function useLogOpen(media: Media, kind: TitleKind, partial: boolean) {
  const { isAuthenticated, getAccessTokenSilently } = useAuth0()
  useEffect(() => {
    if (!isAuthenticated || partial) return
    const key = `${kind}:${media.id}`
    const now = Date.now()
    if (loggedOpens.has(key) || now - lastOpenLoggedAt < OPEN_LOG_GAP_MS) return
    loggedOpens.add(key)
    lastOpenLoggedAt = now
    void getAccessTokenSilently()
      .then((token) => logRecommendationInteraction(token, { tmdbId: media.id, mediaType: kind, eventType: 'click', genreIds: genreIdsOf(media) }))
      .catch(() => {})
  }, [isAuthenticated, partial, kind, media, getAccessTokenSilently])
}

/** `partial`: only the clicked card's facts so far — the details are still on their way. */
function TitleBody({ media, kind, partial }: { media: Media; kind: TitleKind; partial: boolean }) {
  const navigate = useNavigate()
  const wide = useIsWide()
  const settings = useSettings()
  const { isAuthenticated, getAccessTokenSilently } = useAuth0()
  const { premium } = usePremiumAccess()
  const { isFavorited, toggleFavorite } = useFavorites()
  const display = useMemo(() => deriveMediaDisplay(media, kind), [media, kind])
  useLogOpen(media, kind, partial)
  const { data: seasons = [] } = useSeasons(kind, media.id)
  const { data: continueEntries } = useContinueWatching()
  const progress = continueEntries?.find((e) => e.item.tmdbId === media.id && e.item.mediaType === kind)?.item

  /** A server picked on this page; until then the start rule decides (and follows Premium access as it loads). */
  const [picked, setPicked] = useState<string | null>(null)
  const server = picked ?? startServer(kind, premium, settings, progress?.server)
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

  // The artwork drifts a little slower than the page and dims as the page covers it
  const { scrollY } = useScroll()
  const artY = useTransform(scrollY, [0, 800], [0, wide ? 140 : 100])
  const artOpacity = useTransform(scrollY, [0, wide ? 900 : 480], [1, wide ? 0.3 : 0.15])

  // Premium chosen for this title: get it ready while the page is read (lib/premiumHeadStart)
  const queryClient = useQueryClient()
  const getDebridToken = useDebridToken()
  const headStartOn = server === DEBRID_SERVER_ID && premium && !partial
  const headStartSeason = kind === 'tv' ? progress?.season ?? activeSeason : undefined
  const headStartEpisode = kind === 'tv' ? progress?.episode ?? 1 : undefined
  // The language it plays in: the title's own (Hindi for a Hindi original), or what was picked here or in the player
  const { audioLanguage, audioBase, languageChoices, onAudioLanguageChange } = useAudioLanguage(media, kind)
  useEffect(() => {
    // At once: the search it starts with takes a second anyway, and Play may come sooner
    if (headStartOn) {
      headStartPremium(queryClient, { kind, id: media.id, season: headStartSeason, episode: headStartEpisode, audioLang: audioLanguage }, getDebridToken)
    }
  }, [headStartOn, kind, media.id, headStartSeason, headStartEpisode, audioLanguage, queryClient, getDebridToken])
  // The head start's own search (the same request): says whether there's a version in the language picked
  const { data: releases } = useQuery({
    queryKey: ['title-premium-releases', kind, media.id, headStartSeason, headStartEpisode, audioLanguage],
    queryFn: async () =>
      findPremiumReleases(
        {
          title: display.title,
          year: display.year,
          imdbId,
          mediaType: kind,
          season: headStartSeason ?? 1,
          episode: headStartEpisode ?? 1,
          audioLang: audioLanguage,
          audioBase,
        },
        await getDebridToken()
      ),
    enabled: headStartOn && !!imdbId,
    staleTime: 10 * 60_000,
  })
  const languageMissing = !!releases && releases.length > 0 && !releases.some((r) => releaseHasLanguage(r, audioLanguage, audioBase))

  const play = (s?: number, e?: number) => {
    // Unpicked, the player applies the same start rule once it knows the account's Premium access
    const qs = new URLSearchParams(picked ? { server: picked } : progress?.server ? { saved: progress.server } : {})
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
    audioLang: audioLanguage,
    audioBase,
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
  const resumeLabel = kind === 'tv' && progress ? `Resume S${progress.season ?? 1}, E${progress.episode ?? 1}` : progress ? 'Resume' : 'Play'
  const similar = (media.similar?.results ?? []).filter((m) => m.poster_path).slice(0, 18)
  const tabs: { id: Tab; label: string }[] = [
    ...(kind === 'tv' ? [{ id: 'episodes' as const, label: 'Episodes' }] : []),
    ...(similar.length ? [{ id: 'similar' as const, label: 'More Like This' }] : []),
    { id: 'details', label: 'Details' },
  ]
  const shownTab = tabs.some((t) => t.id === tab) ? tab : tabs[0].id
  const meta = [display.year, display.contentRating !== 'NR' ? display.contentRating : '', display.durationStr, display.genres.slice(0, 2).join(', ')].filter(Boolean)

  return (
    <div>
      <NavBar
        title={display.title}
        back
        threshold={wide ? 9999 : 320}
        actions={
          <CircleButton label="Share" onClick={() => void share()}>
            <Share className="h-[18px] w-[18px]" strokeWidth={2.2} />
          </CircleButton>
        }
      />

      {/* Artwork: fixed behind a wide window, at the top of a phone's page */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[62vh] overflow-hidden lg:fixed lg:inset-0 lg:h-auto">
        <motion.div style={{ y: artY, opacity: artOpacity }} className="absolute inset-0">
          {/* A small copy shows at once; the full-size one fades in over it */}
          <img src={tmdbImg(media.backdrop_path || media.poster_path, 'w300')} alt="" className="absolute inset-0 h-full w-full object-cover object-top" />
          <FadeImg src={tmdbImg(media.backdrop_path || media.poster_path, wide ? 'original' : 'w1280')} fetchPriority="high" className="relative h-full w-full object-cover object-top" />
        </motion.div>
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/35 to-black/20 lg:via-black/15" />
        <div className="absolute inset-0 hidden bg-gradient-to-r from-black/90 via-black/55 to-transparent lg:block" />
      </div>

      {/* Headline */}
      <motion.section
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, ease: EASE_OUT }}
        className="relative z-10 flex flex-col items-center px-4 pb-2 pt-[36vh] text-center lg:min-h-[80vh] lg:max-w-[min(50rem,60%)] lg:items-start lg:justify-end lg:px-12 lg:pb-14 lg:pt-[calc(var(--topbar-h)+2rem)] lg:text-left"
      >
        <div className="mb-3 lg:mb-5">
          {display.logoImage ? (
            <img src={display.logoImage} alt={display.title} className="max-h-24 max-w-[78vw] object-contain drop-shadow-[0_2px_16px_rgb(0_0_0/0.6)] lg:max-h-40 lg:max-w-[30rem] lg:object-left" />
          ) : (
            <h1 className="t-large lg:text-[clamp(2.75rem,4.4vw,4.5rem)] lg:leading-[1.05]">{display.title}</h1>
          )}
        </div>

        <p className="t-footnote mb-3 flex flex-wrap items-center justify-center gap-x-1.5 font-medium text-white/70 lg:justify-start lg:text-[15px]">
          {display.rating > 0 && (
            <span className="mr-1 inline-flex items-center gap-1 text-white">
              <Star className="h-3.5 w-3.5 fill-ios-yellow text-ios-yellow" /> {display.rating.toFixed(1)}
            </span>
          )}
          {meta.join(' · ')}
        </p>

        {partial && !media.overview ? (
          <div className="mb-5 w-full max-w-[40rem] space-y-2" aria-hidden="true">
            <div className="skeleton h-4 w-full rounded" />
            <div className="skeleton h-4 w-4/5 rounded" />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className={cn('t-subhead mb-5 max-w-[40rem] text-left text-white/80 lg:text-[16px] lg:leading-[1.5]', !expanded && 'line-clamp-3')}
          >
            {display.description}
          </button>
        )}

        {/* Play, then the smaller actions */}
        <div className="flex w-full flex-col items-center gap-4 lg:w-auto lg:flex-row lg:items-center lg:gap-6">
          <Button size="lg" onClick={() => play()} className="relative w-full max-w-[26rem] overflow-hidden lg:w-auto lg:px-10">
            <Play className="fill-current" /> {resumeLabel}
            {progress && (
              <span className="absolute inset-x-8 bottom-[7px] h-[3px] overflow-hidden rounded-full bg-black/15">
                <span className="block h-full rounded-full bg-black/70" style={{ width: `${Math.round(progress.progress * 100)}%` }} />
              </span>
            )}
          </Button>
          <div className="flex justify-center gap-2 lg:gap-1">
            <ActionButton label={inList ? 'In My List' : 'My List'} onClick={() => toggleFavorite(media.id, kind, genreIdsOf(media))}>
              <AnimatePresence mode="wait" initial={false}>
                <motion.span key={String(inList)} initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.5, opacity: 0 }} transition={spring}>
                  {inList ? <Check className="h-[22px] w-[22px]" strokeWidth={2.4} /> : <Plus className="h-[22px] w-[22px]" strokeWidth={2.4} />}
                </motion.span>
              </AnimatePresence>
            </ActionButton>
            <ActionButton label={liked ? 'Liked' : 'Like'} onClick={() => void like()}>
              <ThumbsUp className={cn('h-5 w-5', liked && 'fill-current')} strokeWidth={2} />
            </ActionButton>
            {kind === 'movie' && (
              <ActionButton
                label={movieRecord?.status === 'done' ? 'Downloaded' : movieRecord && movieRecord.status !== 'failed' ? `${movieRecord.total ? Math.round((movieRecord.bytes / movieRecord.total) * 100) : 0}%` : 'Download'}
                onClick={() => (movieRecord?.status === 'done' ? navigate(`/offline/${encodeURIComponent(movieRecord.id)}`) : setDownload(downloadTarget()))}
              >
                {movieRecord?.status === 'done' ? (
                  <CheckCircle2 className="h-5 w-5 text-ios-green" />
                ) : movieRecord && movieRecord.status !== 'failed' ? (
                  <ProgressRing value={movieRecord.total ? movieRecord.bytes / movieRecord.total : 0} />
                ) : (
                  <Download className="h-5 w-5" strokeWidth={2} />
                )}
              </ActionButton>
            )}
            <ActionButton label="Share" onClick={() => void share()} className="max-lg:hidden">
              <Share className="h-5 w-5" strokeWidth={2} />
            </ActionButton>
          </div>
        </div>

        {/* Where it plays — chosen before pressing Play, changeable again in the player */}
        <div className="mt-6 w-full text-left">
          <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.06em] text-white/45">Server</p>
          <ServerChips kind={kind} server={server} onPick={setPicked} />
        </div>

        {/* The language it plays in on Premium — changeable mid-film too, from the player's settings */}
        {server === DEBRID_SERVER_ID && premium && (
          <div className="mt-5 w-full text-left">
            <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.06em] text-white/45">Audio language</p>
            <LanguageChips
              options={languageChoices}
              original={media.original_language}
              active={audioLanguage}
              onPick={onAudioLanguageChange}
            />
            {languageMissing && (
              <p className="mt-2 text-[13px] leading-snug text-white/50">
                No {languageName(audioLanguage)} version on Premium yet — it’ll play in the language there is.
              </p>
            )}
          </div>
        )}
      </motion.section>

      {/* Below the fold */}
      <div className="relative z-10 bg-gradient-to-b from-transparent via-black/95 to-black pt-6 lg:via-black/90 lg:pt-10">
        <div className="px-4 lg:px-12">
          {/* A film's tabs all come with its details; a show's episodes load on their own */}
          {partial && kind === 'movie' ? (
            <PosterGridSkeleton count={12} />
          ) : (
            <>
              {tabs.length > 1 && <SegmentedControl options={tabs} value={shownTab} onChange={setTab} layoutId="title-tab" className="mb-6 w-full lg:max-w-md" />}

              <AnimatePresence mode="wait">
                <motion.div key={shownTab} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
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
            </>
          )}

        </div>
      </div>

      <DownloadOptionsSheet target={download} onClose={() => setDownload(null)} />
      <Sheet open={seasonsOpen} onOpenChange={setSeasonsOpen} title="Seasons">
        <div className="glass-card overflow-hidden rounded-[16px]">
          {seasons.map((s) => (
            <ListRow
              key={s.season_number}
              onClick={() => {
                setSeason(s.season_number)
                setSeasonsOpen(false)
              }}
              label={s.name || `Season ${s.season_number}`}
              detail={`${s.episode_count} episodes`}
              accessory={s.season_number === activeSeason ? 'check' : 'none'}
            />
          ))}
        </div>
      </Sheet>
    </div>
  )
}

/** A round frosted button with its name under it, as in iOS's action rows. */
function ActionButton({ label, onClick, children, className }: { label: string; onClick: () => void; children: React.ReactNode; className?: string }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} className={cn('press flex w-[76px] flex-col items-center gap-1.5', className)}>
      <span className="glass-button flex h-11 w-11 items-center justify-center rounded-full text-white">{children}</span>
      <span className="t-caption2 font-medium text-white/70">{label}</span>
    </button>
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
          <div className="no-scrollbar -mx-4 mb-4 flex gap-5 overflow-x-auto px-4 lg:mx-0 lg:px-0">
            {seasons.map((s) => (
              <button
                key={s.season_number}
                type="button"
                onClick={() => onSeason(s.season_number)}
                className={cn('t-headline shrink-0 transition-colors', s.season_number === season ? 'text-white' : 'text-label-3 hover:text-label-2')}
              >
                Season {s.season_number}
              </button>
            ))}
          </div>
        ) : (
          <button type="button" onClick={onOpenSeasons} className="t-headline press mb-4 flex items-center gap-1">
            Season {season} <ChevronDown className="h-[18px] w-[18px] text-label-2" strokeWidth={2.4} />
          </button>
        ))}

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="skeleton aspect-video max-md:h-[74px] max-md:w-[132px] rounded-[8px]" />
          ))}
        </div>
      ) : (
        <motion.ul key={season} variants={stagger(0.015)} initial="hidden" animate="show" className="grid gap-x-4 gap-y-4 md:grid-cols-2 md:gap-y-7 xl:grid-cols-3">
          {episodes?.map((ep) => {
            const record = downloads.recordFor({ tmdbId: media.id, mediaType: 'tv', season, episode: ep.episode_number })
            const isCurrent = progress?.season === season && progress?.episode === ep.episode_number
            return (
              <motion.li key={ep.episode_number} variants={item} className="group/ep flex items-center gap-3 md:flex-col md:items-stretch md:gap-0">
                <button
                  type="button"
                  onClick={() => onPlay(ep.episode_number)}
                  className="press relative w-[132px] shrink-0 overflow-hidden rounded-[8px] md:w-full"
                  aria-label={`Play episode ${ep.episode_number}`}
                >
                  <span className="skeleton block aspect-video w-full">
                    <FadeImg src={tmdbImg(ep.still_path || media.backdrop_path, 'w500')} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 [@media(hover:hover)]:group-hover/ep:scale-105" />
                  </span>
                  <span className="absolute inset-0 hidden items-center justify-center bg-black/25 opacity-0 transition-opacity group-hover/ep:opacity-100 lg:flex">
                    <span className="glass-button flex h-11 w-11 items-center justify-center rounded-full">
                      <Play className="ml-0.5 h-5 w-5 fill-white text-white" />
                    </span>
                  </span>
                  {isCurrent && progress && (
                    <span className="absolute inset-x-2 bottom-2 h-[3px] overflow-hidden rounded-full bg-white/30">
                      <span className="block h-full rounded-full bg-white" style={{ width: `${Math.round(progress.progress * 100)}%` }} />
                    </span>
                  )}
                </button>
                <div className="flex min-w-0 flex-1 items-start gap-2 md:mt-2.5">
                  <button type="button" onClick={() => onPlay(ep.episode_number)} className="min-w-0 flex-1 text-left">
                    <p className="t-subhead line-clamp-2 font-semibold">
                      <span className="text-label-2">{ep.episode_number}.</span> {ep.name}
                    </p>
                    <p className="t-footnote mt-0.5 text-label-2">
                      {ep.runtime ? `${ep.runtime} min` : ''}
                      {isCurrent ? <span className="text-tint">{ep.runtime ? ' · ' : ''}Watching</span> : null}
                    </p>
                    {ep.overview && <p className="t-footnote mt-1 line-clamp-2 text-label-2 max-md:hidden">{ep.overview}</p>}
                  </button>
                  <button
                    type="button"
                    onClick={() => (record?.status === 'done' ? navigate(`/offline/${encodeURIComponent(record.id)}`) : onDownload(ep.episode_number, ep.name))}
                    aria-label={`Download episode ${ep.episode_number}`}
                    className="press -mr-1.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-tint"
                  >
                    {record?.status === 'done' ? (
                      <CheckCircle2 className="h-[22px] w-[22px] text-ios-green" />
                    ) : record && record.status !== 'failed' ? (
                      <ProgressRing value={record.total ? record.bytes / record.total : 0} />
                    ) : (
                      <Download className="h-[20px] w-[20px]" strokeWidth={2.2} />
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
    ['TMDB rating', display.rating > 0 ? `${display.rating.toFixed(1)} / 10` : '—'],
  ]
  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
      {display.cast.length > 0 && (
        <div className="min-w-0">
          <h3 className="t-title3 mb-3">Cast</h3>
          <div className="no-scrollbar -mx-4 flex gap-4 overflow-x-auto px-4 lg:mx-0 lg:grid lg:grid-cols-5 lg:overflow-visible lg:px-0 xl:grid-cols-6">
            {display.cast.map((c) => (
              <div key={c.name + c.role} className="w-[84px] shrink-0 text-center lg:w-auto">
                <div className="skeleton mx-auto aspect-square w-[76px] overflow-hidden rounded-full lg:w-full lg:max-w-[96px]">
                  {!c.image.endsWith('placeholder.svg') && <FadeImg src={c.image} loading="lazy" className="h-full w-full object-cover" />}
                </div>
                <p className="t-footnote mt-2 line-clamp-1 font-semibold">{c.name}</p>
                <p className="t-caption line-clamp-1 text-label-2">{c.role}</p>
              </div>
            ))}
          </div>
        </div>
      )}
      <ListSection header="Information" className="mb-0">
        {facts.map(([k, v]) => (
          <ListRow key={k} label={k} value={v} />
        ))}
      </ListSection>
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
        stroke="#0a84ff"
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

/** Hindi · English, the title's own language marked "Original". */
function LanguageChips({
  options,
  original,
  active,
  onPick,
}: {
  options: AudioLanguage[]
  original?: string
  active: AudioLanguage
  onPick: (lang: AudioLanguage) => void
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((lang) => {
        const selected = lang === active
        return (
          <button
            key={lang}
            onClick={() => onPick(lang)}
            aria-pressed={selected}
            className={cn(
              'press relative z-0 flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[14px] font-semibold transition-colors',
              selected ? 'text-black' : 'bg-fill text-white/85 hover:bg-[rgb(118_118_128/0.32)]'
            )}
          >
            {selected && <motion.span layoutId="language-chip" transition={spring} className="absolute inset-0 -z-10 rounded-full bg-white" />}
            {languageName(lang)}
            {lang === original && <span className={cn('text-[11px] font-semibold', selected ? 'text-black/55' : 'text-label-2')}>Original</span>}
          </button>
        )
      })}
    </div>
  )
}
