import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth0 } from '@auth0/auth0-react'
import { toast } from 'sonner'
import { ArrowLeft, Check, CheckCircle2, ChevronDown, Download, Loader2, Play, Plus, Server, Share2, ThumbsUp } from 'lucide-react'
import { CONFIG, DEBRID_SERVER_ID, defaultServer, serverOptions, type Media } from '@/lib/config'
import { logRecommendationInteraction } from '@/lib/api'
import { deriveMediaDisplay } from '@/lib/mediaDisplay'
import { useSeasonEpisodes } from '@/hooks/useSeasonEpisodes'
import { usePremiumAccess } from '@/hooks/usePremiumAccess'
import { useFavorites } from '@/context/FavoritesContext'
import { cn, genreIdsOf } from '@/lib/utils'
import { SITE_URL } from '@app/native/platform'
import { useSettings } from '@app/lib/settings'
import { parseKind, useSeasons, useTitleDetails, type TitleKind } from '@app/lib/useTitle'
import { useDownloadAction, type DownloadTarget } from '@app/downloads/useDownloadAction'
import { useContinueWatching } from '@app/components/ContinueWatchingRow'
import { PosterGrid, tmdbImg } from '@app/components/media'
import { ServerSheet } from '@app/components/ServerSheet'
import { DownloadOptionsSheet } from '@app/components/DownloadOptionsSheet'
import { Sheet } from '@app/components/Sheet'

export function TitleScreen() {
  const params = useParams()
  const kind = parseKind(params.type)
  const id = Number(params.id)
  const navigate = useNavigate()
  const { data: media, isLoading, isError, refetch } = useTitleDetails(kind, id)

  if (!kind || !id) return null

  return (
    <div className="pb-tabbar lg:pb-12">
      <button
        onClick={() => (window.history.state?.idx > 0 ? navigate(-1) : navigate('/'))}
        aria-label="Back"
        className="fixed left-3 top-[calc(var(--sat)+10px)] z-30 flex h-9 w-9 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur lg:left-[calc(230px+16px)]"
      >
        <ArrowLeft className="h-5 w-5" />
      </button>
      {media ? (
        <TitleBody key={`${kind}-${id}`} media={media} kind={kind} />
      ) : isLoading ? (
        <TitleSkeleton />
      ) : (
        <div className="flex min-h-[70dvh] flex-col items-center justify-center gap-3 px-8 text-center">
          <p className="text-[15px] font-semibold">Couldn&apos;t load this title</p>
          <p className="text-[12.5px] text-white/55">{isError ? 'The server may be waking up.' : 'It may not exist.'} Trying again usually works.</p>
          <button onClick={() => void refetch()} className="press mt-2 rounded-md bg-white px-5 py-2 text-[13px] font-semibold text-black">
            Try again
          </button>
        </div>
      )}
    </div>
  )
}

function TitleSkeleton() {
  return (
    <div className="mx-auto max-w-5xl">
      <div className="skeleton aspect-video w-full lg:rounded-b-2xl" />
      <div className="space-y-3 p-4">
        <div className="skeleton h-7 w-2/3 rounded" />
        <div className="skeleton h-4 w-1/2 rounded" />
        <div className="skeleton h-11 w-full rounded-md" />
        <div className="skeleton h-11 w-full rounded-md" />
      </div>
    </div>
  )
}

function TitleBody({ media, kind }: { media: Media; kind: TitleKind }) {
  const navigate = useNavigate()
  const settings = useSettings()
  const { isAuthenticated, getAccessTokenSilently } = useAuth0()
  const { premium } = usePremiumAccess()
  const { isFavorited, toggleFavorite } = useFavorites()
  const display = useMemo(() => deriveMediaDisplay(media, kind), [media, kind])
  const { data: seasons = [] } = useSeasons(kind, media.id)
  const { data: continueEntries } = useContinueWatching()
  const progress = continueEntries?.find((e) => e.item.tmdbId === media.id && e.item.mediaType === kind)?.item

  const [server, setServer] = useState(() => {
    const saved = progress?.server
    const preferred = saved || settings.defaultServer
    if (preferred === DEBRID_SERVER_ID) return premium ? DEBRID_SERVER_ID : defaultServer(kind)
    return preferred && serverOptions(kind).some((o) => o.id === preferred) ? preferred : defaultServer(kind)
  })
  const [season, setSeason] = useState(progress?.season ?? 1)
  const [serversOpen, setServersOpen] = useState(false)
  const [seasonsOpen, setSeasonsOpen] = useState(false)
  const [download, setDownload] = useState<DownloadTarget | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [liked, setLiked] = useState(false)

  const activeSeason = seasons.some((s) => s.season_number === season) ? season : seasons[0]?.season_number ?? season
  const { data: episodes, isLoading: episodesLoading } = useSeasonEpisodes(media.id, activeSeason, kind === 'tv')
  const imdbId = media.imdb_id ?? media.external_ids?.imdb_id
  const inList = isFavorited(media.id, kind)
  const downloads = useDownloadAction()
  const serverName = server === DEBRID_SERVER_ID ? 'Premium' : CONFIG.PROVIDER_NAMES[server] ?? 'Sol'

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
  const resumeLabel =
    kind === 'tv' && progress ? `Resume S${progress.season ?? 1}:E${progress.episode ?? 1}` : progress ? 'Resume' : 'Play'
  const facts = [display.year, display.contentRating !== 'NR' ? display.contentRating : null, display.durationStr].filter(Boolean)
  const similar = (media.similar?.results ?? []).filter((m) => m.poster_path).slice(0, 12)

  return (
    <div className="mx-auto max-w-5xl fade-up">
      {/* Artwork */}
      <div className="relative">
        <img src={tmdbImg(media.backdrop_path || media.poster_path, 'w1280')} alt="" className="aspect-video w-full object-cover lg:rounded-b-2xl" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0c] via-transparent to-black/30 lg:rounded-b-2xl" />
        <button onClick={() => play()} aria-label={`Play ${display.title}`} className="absolute inset-0 flex items-center justify-center">
          <span className="press flex h-14 w-14 items-center justify-center rounded-full border-2 border-white/80 bg-black/40 backdrop-blur">
            <Play className="ml-1 h-6 w-6 fill-white text-white" />
          </span>
        </button>
      </div>

      <div className="relative -mt-6 px-4 lg:px-8">
        {display.logoImage ? (
          <img src={display.logoImage} alt={display.title} className="mb-2 max-h-16 max-w-[70%] object-contain object-left drop-shadow-lg" />
        ) : (
          <h1 className="mb-1.5 text-[24px] font-extrabold leading-tight tracking-tight">{display.title}</h1>
        )}
        <div className="mb-3.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-white/60">
          {display.rating > 0 && <span className="font-semibold text-emerald-400">{display.match} match</span>}
          {facts.map((f) => (
            <span key={f}>{f}</span>
          ))}
          <span className="rounded border border-white/30 px-1 text-[10px] font-semibold leading-4">HD</span>
        </div>

        <div className="flex flex-col gap-2 lg:flex-row">
          <button onClick={() => play()} className="press flex items-center justify-center gap-2 rounded-md bg-white py-2.5 text-[14.5px] font-semibold text-black lg:px-10">
            <Play className="h-5 w-5 fill-black" /> {resumeLabel}
          </button>
          {kind === 'movie' && (
            <button
              onClick={() =>
                movieRecord?.status === 'done' ? navigate(`/offline/${encodeURIComponent(movieRecord.id)}`) : setDownload(downloadTarget())
              }
              className="press flex items-center justify-center gap-2 rounded-md bg-white/[0.12] py-2.5 text-[14.5px] font-semibold text-white lg:px-8"
            >
              {movieRecord?.status === 'done' ? (
                <>
                  <CheckCircle2 className="h-5 w-5 text-emerald-400" /> Downloaded
                </>
              ) : movieRecord && movieRecord.status !== 'failed' ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" /> Downloading {movieRecord.total ? Math.round((movieRecord.bytes / movieRecord.total) * 100) : 0}%
                </>
              ) : (
                <>
                  <Download className="h-5 w-5" /> Download
                </>
              )}
            </button>
          )}
        </div>

        <button
          onClick={() => setServersOpen(true)}
          className="press mt-2.5 flex items-center gap-1.5 rounded-full bg-white/[0.06] px-3 py-1.5 text-[12px] text-white/75 ring-1 ring-white/10"
        >
          <Server className="h-3.5 w-3.5" /> Server: <span className="font-semibold text-white">{serverName}</span>
          <ChevronDown className="h-3.5 w-3.5" />
        </button>

        <p className={cn('mt-3.5 text-[13.5px] leading-relaxed text-white/85', !expanded && 'line-clamp-3')} onClick={() => setExpanded((v) => !v)}>
          {display.description}
        </p>
        {display.cast.length > 0 && (
          <p className="mt-2 line-clamp-1 text-[12px] text-white/50">
            <span className="text-white/35">Starring: </span>
            {display.cast.map((c) => c.name).join(', ')}
          </p>
        )}
        {kind === 'movie' && display.director !== 'Unknown' && (
          <p className="mt-0.5 text-[12px] text-white/50">
            <span className="text-white/35">Director: </span>
            {display.director}
          </p>
        )}
        {display.genres.length > 0 && <p className="mt-0.5 text-[12px] text-white/50">{display.genres.slice(0, 4).join(' · ')}</p>}

        <div className="mt-4 flex gap-8 border-b border-white/[0.07] pb-4">
          <IconAction label="My List" onClick={() => toggleFavorite(media.id, kind, genreIdsOf(media))} active={inList} icon={inList ? Check : Plus} />
          <IconAction label="Rate" onClick={() => void like()} active={liked} icon={ThumbsUp} />
          <IconAction label="Share" onClick={() => void share()} icon={Share2} />
        </div>

        {kind === 'tv' && (
          <section className="mt-4">
            <button
              onClick={() => seasons.length > 1 && setSeasonsOpen(true)}
              className="press mb-3 flex items-center gap-1.5 rounded-md bg-white/[0.08] px-3 py-2 text-[13.5px] font-semibold"
            >
              Season {activeSeason}
              {seasons.length > 1 && <ChevronDown className="h-4 w-4" />}
            </button>
            <div className="flex flex-col gap-3.5">
              {episodesLoading &&
                Array.from({ length: 4 }, (_, i) => (
                  <div key={i} className="flex gap-3">
                    <div className="skeleton aspect-video w-[132px] shrink-0 rounded-md" />
                    <div className="flex-1 space-y-2 py-1">
                      <div className="skeleton h-3.5 w-3/4 rounded" />
                      <div className="skeleton h-3 w-1/3 rounded" />
                    </div>
                  </div>
                ))}
              {episodes?.map((ep) => {
                const record = downloads.recordFor({ tmdbId: media.id, mediaType: 'tv', season: activeSeason, episode: ep.episode_number })
                const isCurrent = progress?.season === activeSeason && progress?.episode === ep.episode_number
                return (
                  <div key={ep.episode_number}>
                    <div className="flex items-center gap-3">
                      <button onClick={() => play(activeSeason, ep.episode_number)} className="press relative w-[132px] shrink-0 overflow-hidden rounded-md bg-white/[0.05]">
                        <img src={tmdbImg(ep.still_path || media.backdrop_path, 'w300')} alt="" loading="lazy" className="aspect-video w-full object-cover" />
                        <span className="absolute inset-0 flex items-center justify-center">
                          <span className="flex h-8 w-8 items-center justify-center rounded-full border border-white/80 bg-black/45">
                            <Play className="ml-0.5 h-3.5 w-3.5 fill-white text-white" />
                          </span>
                        </span>
                        {isCurrent && progress && (
                          <span className="absolute inset-x-0 bottom-0 h-[3px] bg-white/25">
                            <span className="block h-full bg-primary" style={{ width: `${Math.round(progress.progress * 100)}%` }} />
                          </span>
                        )}
                      </button>
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 text-[13px] font-semibold leading-snug">
                          {ep.episode_number}. {ep.name}
                        </p>
                        {ep.runtime ? <p className="mt-0.5 text-[11.5px] text-white/45">{ep.runtime}m</p> : null}
                      </div>
                      <button
                        onClick={() =>
                          record?.status === 'done'
                            ? navigate(`/offline/${encodeURIComponent(record.id)}`)
                            : setDownload(downloadTarget(activeSeason, ep.episode_number, ep.name))
                        }
                        aria-label={`Download episode ${ep.episode_number}`}
                        className="press -mr-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white/70"
                      >
                        {record?.status === 'done' ? (
                          <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                        ) : record && record.status !== 'failed' ? (
                          <ProgressRing value={record.total ? record.bytes / record.total : 0} />
                        ) : (
                          <Download className="h-5 w-5" />
                        )}
                      </button>
                    </div>
                    {ep.overview && <p className="mt-1.5 line-clamp-2 text-[12px] leading-relaxed text-white/50">{ep.overview}</p>}
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {similar.length > 0 && (
          <section className="mt-7">
            <h2 className="mb-3 text-[15.5px] font-bold">More Like This</h2>
            <PosterGrid items={similar} kind={kind} />
          </section>
        )}
        {!premium && (
          <Link to="/premium" className="mt-7 block rounded-xl bg-gradient-to-r from-amber-500/15 to-transparent p-3.5 text-[12.5px] text-white/70 ring-1 ring-amber-400/20">
            <span className="font-semibold text-amber-300">⚡ Premium</span> — 4K from Real-Debrid, subtitles and offline downloads. Tap to learn more.
          </Link>
        )}
      </div>

      <ServerSheet open={serversOpen} onOpenChange={setServersOpen} kind={kind} server={server} onPick={setServer} />
      <DownloadOptionsSheet target={download} onClose={() => setDownload(null)} />
      <Sheet open={seasonsOpen} onOpenChange={setSeasonsOpen} title="Seasons">
        <ul className="flex flex-col">
          {seasons.map((s) => (
            <li key={s.season_number}>
              <button
                onClick={() => {
                  setSeason(s.season_number)
                  setSeasonsOpen(false)
                }}
                className={cn(
                  'flex w-full items-center justify-between rounded-lg px-3 py-3 text-left text-[14px]',
                  s.season_number === activeSeason ? 'bg-white/[0.08] font-semibold text-white' : 'text-white/70'
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

function IconAction({ label, onClick, icon: Icon, active }: { label: string; onClick: () => void; icon: typeof Plus; active?: boolean }) {
  return (
    <button onClick={onClick} className="press flex flex-col items-center gap-1.5 text-[11px] text-white/60">
      <Icon className={cn('h-6 w-6', active ? 'text-white' : 'text-white/85')} strokeWidth={active ? 2.6 : 1.8} />
      {label}
    </button>
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
        stroke="hsl(217 91% 60%)"
        strokeWidth="2.5"
        fill="none"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - Math.min(1, Math.max(0, value)))}
        strokeLinecap="round"
      />
    </svg>
  )
}
