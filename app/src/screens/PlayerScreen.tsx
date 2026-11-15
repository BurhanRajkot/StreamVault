import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAuth0 } from '@auth0/auth0-react'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ListVideo, Server, SkipForward } from 'lucide-react'
import { CONFIG, DEBRID_SERVER_ID, LEGACY_TORBOX_SERVER_ID, defaultServer, serverOptions, type Media } from '@/lib/config'
import { buildEmbedUrl, logRecommendationInteraction, saveGuestProgress, updateContinueWatching } from '@/lib/api'
import { deriveMediaDisplay } from '@/lib/mediaDisplay'
import { nextEpisode } from '@/lib/episodeNavigation'
import { genreIdsOf } from '@/lib/utils'
import { usePremiumAccess } from '@/hooks/usePremiumAccess'
import { useSeasonEpisodes } from '@/hooks/useSeasonEpisodes'
import { PremiumPane } from '@/components/player/PremiumPane'
import { setPlaybackMode } from '@app/native/platform'
import { parseKind, useSeasons, useTitleDetails, type TitleKind } from '@app/lib/useTitle'
import { ServerSheet } from '@app/components/ServerSheet'
import { Sheet } from '@app/components/Sheet'
import { CONTINUE_WATCHING_KEY } from '@app/components/ContinueWatchingRow'
import { tmdbImg } from '@app/components/media'

export function PlayerScreen() {
  const params = useParams()
  const kind = parseKind(params.type)
  const id = Number(params.id)
  const { data: media } = useTitleDetails(kind, id)

  // The whole screen, sideways, for as long as the player is open
  useEffect(() => {
    void setPlaybackMode(true)
    return () => void setPlaybackMode(false)
  }, [])

  return (
    <div className="app-player fixed inset-0 z-[300] bg-black">
      {media && kind ? <Player media={media} kind={kind} /> : <div className="flex h-full items-center justify-center"><span className="player-spinner" /></div>}
    </div>
  )
}

function Player({ media, kind }: { media: Media; kind: TitleKind }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [search, setSearch] = useSearchParams()
  const { isAuthenticated, getAccessTokenSilently } = useAuth0()
  const { premium, loading: accessLoading } = usePremiumAccess()
  const display = useMemo(() => deriveMediaDisplay(media, kind), [media, kind])
  const { data: seasons = [] } = useSeasons(kind, media.id)

  const season = Number(search.get('s') ?? 1) || 1
  const episode = Number(search.get('e') ?? 1) || 1
  const requested = search.get('server') ?? ''
  const server = useMemo(() => {
    if (requested === DEBRID_SERVER_ID || requested === LEGACY_TORBOX_SERVER_ID) return premium || accessLoading ? DEBRID_SERVER_ID : defaultServer(kind)
    return serverOptions(kind).some((o) => o.id === requested) ? requested : defaultServer(kind)
  }, [requested, premium, accessLoading, kind])

  const setParams = (patch: Record<string, string>) => {
    const next = new URLSearchParams(search)
    Object.entries(patch).forEach(([k, v]) => next.set(k, v))
    setSearch(next, { replace: true })
  }

  const [serversOpen, setServersOpen] = useState(false)
  const [episodesOpen, setEpisodesOpen] = useState(false)
  const [iframeLoaded, setIframeLoaded] = useState(false)
  const [stalled, setStalled] = useState(false)
  const [chromeVisible, setChromeVisible] = useState(true)
  const startedRef = useRef(false)

  const episodeCount = seasons.find((s) => s.season_number === season)?.episode_count ?? 99
  const next = kind === 'tv' ? nextEpisode({ season, episode }, seasons, episodeCount) : null
  const goTo = (s: number, e: number) => setParams({ s: String(s), e: String(e) })

  // ── Progress, as the website keeps it ──────────────────────────────────────
  const saveProgress = useCallback(
    async (s: number, e: number, progress: number) => {
      const item = { tmdbId: media.id, mediaType: kind, season: kind === 'tv' ? s : undefined, episode: kind === 'tv' ? e : undefined, progress, server }
      try {
        if (isAuthenticated) await updateContinueWatching(await getAccessTokenSilently(), item)
        else saveGuestProgress(item)
      } catch {
        /* progress is best-effort */
      }
    },
    [media.id, kind, server, isAuthenticated, getAccessTokenSilently]
  )

  const startedAt = useRef(Date.now())
  const premiumProgress = useRef<number | null>(null)
  const lastPremiumSave = useRef(0)
  const position = useRef({ season, episode })

  // A new episode: the previous one counts as finished, this one starts its clock
  useEffect(() => {
    const prev = position.current
    if (prev.season !== season || prev.episode !== episode) void saveProgress(prev.season, prev.episode, 0.99)
    position.current = { season, episode }
    startedAt.current = Date.now()
    premiumProgress.current = null
    lastPremiumSave.current = 0
    const timer = setTimeout(() => {
      if (premiumProgress.current === null) void saveProgress(season, episode, 0.1)
    }, 30_000)
    return () => clearTimeout(timer)
  }, [season, episode, saveProgress])

  const saveOnExit = useRef<() => void>(() => {})
  saveOnExit.current = () => {
    const { season: s, episode: e } = position.current
    if (server === DEBRID_SERVER_ID && premiumProgress.current !== null) void saveProgress(s, e, premiumProgress.current)
    else if (Date.now() - startedAt.current >= 30_000) void saveProgress(s, e, 0.5)
    void queryClient.invalidateQueries({ queryKey: [CONTINUE_WATCHING_KEY] })
  }
  useEffect(() => () => saveOnExit.current(), [])

  const onPremiumProgress = useCallback(
    (pos: number, duration: number) => {
      if (!(duration > 0) || pos < 30) return
      premiumProgress.current = Math.min(pos / duration, 0.99)
      if (Date.now() - lastPremiumSave.current < 60_000) return
      lastPremiumSave.current = Date.now()
      void saveProgress(position.current.season, position.current.episode, premiumProgress.current)
    },
    [saveProgress]
  )

  // One "watched" signal per visit, for CineMatch
  const loggedWatch = useRef(false)
  useEffect(() => {
    if (loggedWatch.current) return
    loggedWatch.current = true
    void (async () => {
      try {
        const token = isAuthenticated ? await getAccessTokenSilently() : null
        await logRecommendationInteraction(token, { tmdbId: media.id, mediaType: kind, eventType: 'watch', selectedServer: server, genreIds: genreIdsOf(media) })
        void queryClient.invalidateQueries({ queryKey: ['recommendations'] })
      } catch {
        /* non-critical */
      }
    })()
  }, [isAuthenticated, getAccessTokenSilently, media, kind, server, queryClient])

  // ── Embed servers: a stall watchdog, as on the website ─────────────────────
  const embedUrl = server === DEBRID_SERVER_ID ? '' : buildEmbedUrl(kind, server, media.id, { season, episode, media })
  useEffect(() => {
    if (!embedUrl) return
    setIframeLoaded(false)
    setStalled(false)
    startedRef.current = false
    const timer = setTimeout(() => setStalled(true), 9_000)
    const onMessage = (event: MessageEvent) => {
      if (!CONFIG.PLAYER_MESSAGE_ORIGINS.includes(event.origin)) return
      let data: unknown = event.data
      if (typeof data === 'string') {
        try {
          data = JSON.parse(data)
        } catch {
          return
        }
      }
      const type = (data as { type?: string } | null)?.type
      if (type === 'MEDIA_DATA' || type === 'PLAYER_EVENT') {
        startedRef.current = true
        setStalled(false)
        clearTimeout(timer)
      }
    }
    window.addEventListener('message', onMessage)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('message', onMessage)
    }
  }, [embedUrl])

  // The overlay fades after a few seconds; a tap on its strip brings it back
  useEffect(() => {
    if (!chromeVisible) return
    const timer = setTimeout(() => setChromeVisible(false), 4_000)
    return () => clearTimeout(timer)
  }, [chromeVisible, season, episode, server])

  const close = () => (window.history.state?.idx > 0 ? navigate(-1) : navigate(`/title/${kind}/${media.id}`, { replace: true }))
  const subtitle = kind === 'tv' ? `S${season} · E${episode}` : display.year

  const episodesList = kind === 'tv' ? <EpisodePicker media={media} seasons={seasons} season={season} episode={episode} onPick={(s, e) => { goTo(s, e); setEpisodesOpen(false) }} /> : undefined

  return (
    <>
      <div data-own-controls={server === DEBRID_SERVER_ID || undefined} className="player-shell relative overflow-hidden bg-black">
        <div className="player-frame">
          {server === DEBRID_SERVER_ID ? (
            <PremiumPane
              key={`${season}:${episode}`}
              title={display.title}
              year={display.year}
              imdbId={media.imdb_id ?? media.external_ids?.imdb_id}
              mediaType={kind}
              season={kind === 'tv' ? season : undefined}
              episode={kind === 'tv' ? episode : undefined}
              onSwitchServer={() => setServersOpen(true)}
              onBack={close}
              backdropUrl={tmdbImg(media.backdrop_path, 'w1280')}
              onProgress={onPremiumProgress}
              onNext={next ? () => goTo(next.season, next.episode) : undefined}
              nextLabel={next ? `S${next.season} · E${next.episode}` : undefined}
              episodes={episodesList}
            />
          ) : (
            <>
              <iframe
                key={embedUrl}
                src={embedUrl}
                title={`${display.title} — ${CONFIG.PROVIDER_NAMES[server] ?? 'player'}`}
                className="absolute inset-0 h-full w-full border-0"
                referrerPolicy={CONFIG.PLAYER_IFRAME_REFERRER_POLICY}
                allow={CONFIG.PLAYER_IFRAME_ALLOW}
                allowFullScreen
                onLoad={() => setIframeLoaded(true)}
              />
              {!iframeLoaded && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black">
                  <span className="player-spinner" aria-hidden="true" />
                </div>
              )}
              {stalled && (
                <div className="absolute bottom-6 left-1/2 z-20 flex w-max max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-3 rounded-full bg-black/85 px-4 py-2 text-[12.5px] text-white/85 ring-1 ring-white/10">
                  <span>Taking a while?</span>
                  <button onClick={() => setServersOpen(true)} className="font-semibold text-white">
                    Try another server
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Our overlay — embeds only; the Premium player draws its own */}
      {server !== DEBRID_SERVER_ID && (
        <div
          className={`absolute inset-x-0 top-0 z-[310] flex items-center gap-1 bg-gradient-to-b from-black/80 to-transparent pb-6 pl-[max(var(--sal),8px)] pr-[max(var(--sar),8px)] pt-[max(var(--sat),6px)] transition-opacity duration-300 ${chromeVisible ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
          onPointerDown={() => setChromeVisible(true)}
        >
          <button onClick={close} aria-label="Back" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white active:bg-white/10">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1 px-1">
            <p className="truncate text-[14px] font-semibold text-white">{display.title}</p>
            {subtitle && <p className="truncate text-[11.5px] text-white/60">{subtitle}</p>}
          </div>
          {kind === 'tv' && (
            <button onClick={() => setEpisodesOpen(true)} aria-label="Episodes" className="flex h-10 w-10 items-center justify-center rounded-full text-white active:bg-white/10">
              <ListVideo className="h-5 w-5" />
            </button>
          )}
          {next && (
            <button onClick={() => goTo(next.season, next.episode)} className="flex h-9 items-center gap-1.5 rounded-full bg-white/10 px-3 text-[12px] font-semibold text-white">
              Next <SkipForward className="h-4 w-4" />
            </button>
          )}
          <button onClick={() => setServersOpen(true)} className="ml-1 flex h-9 items-center gap-1.5 rounded-full bg-white/10 px-3 text-[12px] font-semibold text-white">
            <Server className="h-4 w-4" /> {CONFIG.PROVIDER_NAMES[server] ?? 'Server'}
          </button>
        </div>
      )}
      {/* While the overlay is hidden, a thin strip at the top brings it back without reaching the player's own controls */}
      {server !== DEBRID_SERVER_ID && !chromeVisible && (
        <button aria-label="Show controls" onClick={() => setChromeVisible(true)} className="absolute left-0 top-0 z-[311] h-12 w-1/4" />
      )}

      <ServerSheet open={serversOpen} onOpenChange={setServersOpen} kind={kind} server={server} onPick={(id) => setParams({ server: id })} />
      {kind === 'tv' && (
        <Sheet open={episodesOpen} onOpenChange={setEpisodesOpen} title={display.title} description="Episodes">
          {episodesList}
        </Sheet>
      )}
    </>
  )
}

function EpisodePicker({
  media,
  seasons,
  season,
  episode,
  onPick,
}: {
  media: Media
  seasons: { season_number: number; episode_count: number; name: string }[]
  season: number
  episode: number
  onPick: (season: number, episode: number) => void
}) {
  const [shownSeason, setShownSeason] = useState(season)
  const { data: episodes } = useSeasonEpisodes(media.id, shownSeason, true)
  return (
    <div>
      {seasons.length > 1 && (
        <div className="no-scrollbar mb-3 flex gap-1.5 overflow-x-auto">
          {seasons.map((s) => (
            <button
              key={s.season_number}
              onClick={() => setShownSeason(s.season_number)}
              className={`shrink-0 rounded-full px-3 py-1 text-[12px] font-semibold ${s.season_number === shownSeason ? 'bg-white text-black' : 'bg-white/10 text-white/75'}`}
            >
              S{s.season_number}
            </button>
          ))}
        </div>
      )}
      <ul className="flex flex-col gap-1">
        {episodes?.map((ep) => {
          const current = shownSeason === season && ep.episode_number === episode
          return (
            <li key={ep.episode_number}>
              <button
                onClick={() => onPick(shownSeason, ep.episode_number)}
                className={`flex w-full items-center gap-3 rounded-lg p-2 text-left ${current ? 'bg-primary/15 ring-1 ring-primary/40' : 'active:bg-white/5'}`}
              >
                <img src={tmdbImg(ep.still_path || media.backdrop_path, 'w300')} alt="" loading="lazy" className="aspect-video w-24 shrink-0 rounded object-cover" />
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 text-[12.5px] font-semibold text-white">
                    {ep.episode_number}. {ep.name}
                  </span>
                  {ep.runtime ? <span className="text-[11px] text-white/45">{ep.runtime}m</span> : null}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
