import { useState, useEffect, useCallback } from 'react';
import { X, Play, Server, ChevronDown, ChevronLeft, ChevronRight, SkipForward } from 'lucide-react';
import { Media, MediaMode, CONFIG } from '@/lib/config';
import { buildEmbedUrl, fetchTVSeasons } from '@/lib/api';
import { cn } from '@/lib/utils';

interface PlayerModalProps {
  media: Media | null;
  mode: MediaMode;
  isOpen: boolean;
  onClose: () => void;
}

interface Season {
  season_number: number;
  episode_count: number;
  name: string;
}

export function PlayerModal({ media, mode, isOpen, onClose }: PlayerModalProps) {
  const [provider, setProvider] = useState('vidsrc_pro');
  const [season, setSeason] = useState(1);
  const [episode, setEpisode] = useState(1);
  const [malId, setMalId] = useState('');
  const [subOrDub, setSubOrDub] = useState('sub');
  const [embedUrl, setEmbedUrl] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [showProviderDropdown, setShowProviderDropdown] = useState(false);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [currentSeasonEpisodes, setCurrentSeasonEpisodes] = useState(10);
  const [autoPlay, setAutoPlay] = useState(true);

  // Fetch TV seasons when modal opens for TV mode
  useEffect(() => {
    if (isOpen && media && mode === 'tv') {
      fetchTVSeasons(media.id).then((data) => {
        setSeasons(data);
        if (data.length > 0) {
          const firstSeason = data.find(s => s.season_number === 1) || data[0];
          setCurrentSeasonEpisodes(firstSeason.episode_count || 10);
        }
      });
    }
  }, [isOpen, media, mode]);

  useEffect(() => {
    if (isOpen) {
      setIsPlaying(false);
      setEmbedUrl('');
      setSeason(1);
      setEpisode(1);
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Update episode count when season changes
  useEffect(() => {
    const currentSeason = seasons.find(s => s.season_number === season);
    if (currentSeason) {
      setCurrentSeasonEpisodes(currentSeason.episode_count);
    }
  }, [season, seasons]);

  const playEpisode = useCallback((s: number, ep: number) => {
    if (!media) return;
    
    const url = buildEmbedUrl(mode, provider, media.id, {
      season: s,
      episode: ep,
      malId,
      subOrDub,
    });
    setEmbedUrl(url);
    setIsPlaying(true);
    setSeason(s);
    setEpisode(ep);
  }, [media, mode, provider, malId, subOrDub]);

  const handlePlay = () => {
    if (!media) return;
    
    const url = buildEmbedUrl(mode, provider, media.id, {
      season,
      episode,
      malId,
      subOrDub,
    });
    setEmbedUrl(url);
    setIsPlaying(true);
  };

  const handleNextEpisode = () => {
    if (episode < currentSeasonEpisodes) {
      playEpisode(season, episode + 1);
    } else if (season < seasons.length) {
      const nextSeason = seasons.find(s => s.season_number === season + 1);
      if (nextSeason) {
        setSeason(season + 1);
        setCurrentSeasonEpisodes(nextSeason.episode_count);
        playEpisode(season + 1, 1);
      }
    }
  };

  const handlePrevEpisode = () => {
    if (episode > 1) {
      playEpisode(season, episode - 1);
    } else if (season > 1) {
      const prevSeason = seasons.find(s => s.season_number === season - 1);
      if (prevSeason) {
        playEpisode(season - 1, prevSeason.episode_count);
      }
    }
  };

  const changeSource = (newProvider: string) => {
    setProvider(newProvider);
    setShowProviderDropdown(false);
    
    if (isPlaying && media) {
      const url = buildEmbedUrl(mode, newProvider, media.id, {
        season,
        episode,
        malId,
        subOrDub,
      });
      setEmbedUrl(url);
    }
  };

  if (!isOpen || !media) return null;

  const title = media.title || media.name || 'Unknown';
  const providers = Object.entries(CONFIG.PROVIDER_NAMES);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4">
      <div
        className="absolute inset-0 bg-background/95 backdrop-blur-md"
        onClick={onClose}
      />

      <div className="relative z-10 w-full max-w-5xl animate-scale-in rounded-2xl bg-card shadow-elevated border border-border/50 max-h-[95vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute right-3 top-3 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-secondary/80 text-muted-foreground transition-colors hover:bg-destructive hover:text-destructive-foreground"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="border-b border-border/50 p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pr-10">
            <h2 className="text-xl sm:text-2xl font-bold text-gradient">{title}</h2>
            
            <div className="relative">
              <button
                onClick={() => setShowProviderDropdown(!showProviderDropdown)}
                className="flex items-center gap-2 rounded-lg border border-border bg-secondary/50 px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-primary"
              >
                <Server className="h-4 w-4 text-primary" />
                <span>{CONFIG.PROVIDER_NAMES[provider]}</span>
                <ChevronDown className={cn("h-4 w-4 transition-transform", showProviderDropdown && "rotate-180")} />
              </button>

              {showProviderDropdown && (
                <div className="absolute right-0 z-30 mt-2 w-48 rounded-lg border border-border bg-popover shadow-lg">
                  {providers.map(([key, name]) => (
                    <button
                      key={key}
                      onClick={() => changeSource(key)}
                      className={cn(
                        "w-full px-4 py-2.5 text-left text-sm transition-colors hover:bg-secondary first:rounded-t-lg last:rounded-b-lg",
                        provider === key ? "bg-primary/10 text-primary font-medium" : "text-foreground"
                      )}
                    >
                      {name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="p-4 sm:p-6">
          {!isPlaying ? (
            <div className="space-y-6">
              {mode === 'tv' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="mb-2 block text-sm font-medium text-muted-foreground">Season</label>
                      <select
                        value={season}
                        onChange={(e) => setSeason(Number(e.target.value))}
                        className="w-full rounded-lg border border-border bg-secondary/50 px-4 py-3 text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                      >
                        {seasons.length > 0 ? (
                          seasons.map((s) => (
                            <option key={s.season_number} value={s.season_number}>
                              Season {s.season_number} ({s.episode_count} eps)
                            </option>
                          ))
                        ) : (
                          Array.from({ length: 10 }, (_, i) => (
                            <option key={i + 1} value={i + 1}>Season {i + 1}</option>
                          ))
                        )}
                      </select>
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-medium text-muted-foreground">Episode</label>
                      <select
                        value={episode}
                        onChange={(e) => setEpisode(Number(e.target.value))}
                        className="w-full rounded-lg border border-border bg-secondary/50 px-4 py-3 text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                      >
                        {Array.from({ length: currentSeasonEpisodes }, (_, i) => (
                          <option key={i + 1} value={i + 1}>Episode {i + 1}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setAutoPlay(!autoPlay)}
                      className={cn(
                        "relative h-6 w-11 rounded-full transition-colors",
                        autoPlay ? "bg-primary" : "bg-secondary"
                      )}
                    >
                      <span className={cn(
                        "absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform",
                        autoPlay ? "left-[22px]" : "left-0.5"
                      )} />
                    </button>
                    <span className="text-sm text-muted-foreground">Auto-play next episode</span>
                  </div>
                </div>
              )}

              {mode === 'anime' && (
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-muted-foreground">MAL ID</label>
                    <input
                      type="text"
                      value={malId}
                      onChange={(e) => setMalId(e.target.value)}
                      placeholder="1234"
                      className="w-full rounded-lg border border-border bg-secondary/50 px-4 py-3 text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-muted-foreground">Episode</label>
                    <input
                      type="number"
                      min={1}
                      value={episode}
                      onChange={(e) => setEpisode(Number(e.target.value))}
                      className="w-full rounded-lg border border-border bg-secondary/50 px-4 py-3 text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-muted-foreground">Type</label>
                    <select
                      value={subOrDub}
                      onChange={(e) => setSubOrDub(e.target.value)}
                      className="w-full rounded-lg border border-border bg-secondary/50 px-4 py-3 text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                    >
                      <option value="sub">Sub</option>
                      <option value="dub">Dub</option>
                    </select>
                  </div>
                </div>
              )}

              <button
                onClick={handlePlay}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-primary py-4 font-semibold text-primary-foreground transition-all hover:shadow-glow hover:scale-[1.02]"
              >
                <Play className="h-5 w-5 fill-current" />
                {mode === 'tv' ? `Play S${season} E${episode}` : 'Start Playback'}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {mode === 'tv' && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-secondary/30 p-3">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handlePrevEpisode}
                      disabled={season === 1 && episode === 1}
                      className="flex items-center gap-1 rounded-lg bg-secondary px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary/80 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <ChevronLeft className="h-4 w-4" />
                      <span className="hidden sm:inline">Previous</span>
                    </button>
                    
                    <span className="rounded-lg bg-primary/20 px-4 py-2 text-sm font-bold text-primary">
                      S{season} E{episode}
                    </span>
                    
                    <button
                      onClick={handleNextEpisode}
                      className="flex items-center gap-1 rounded-lg bg-secondary px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary/80"
                    >
                      <span className="hidden sm:inline">Next</span>
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="flex items-center gap-3">
                    <select
                      value={episode}
                      onChange={(e) => playEpisode(season, Number(e.target.value))}
                      className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground"
                    >
                      {Array.from({ length: currentSeasonEpisodes }, (_, i) => (
                        <option key={i + 1} value={i + 1}>Ep {i + 1}</option>
                      ))}
                    </select>

                    {autoPlay && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <SkipForward className="h-3 w-3" />
                        <span>Auto</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="aspect-video overflow-hidden rounded-lg border border-border bg-black">
                <iframe
                  src={embedUrl}
                  className="h-full w-full"
                  allowFullScreen
                  allow="autoplay; fullscreen; encrypted-media"
                />
              </div>

              {mode === 'tv' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-medium text-muted-foreground">Quick Episode Select</h4>
                    <select
                      value={season}
                      onChange={(e) => {
                        const newSeason = Number(e.target.value);
                        setSeason(newSeason);
                        const seasonData = seasons.find(s => s.season_number === newSeason);
                        if (seasonData) setCurrentSeasonEpisodes(seasonData.episode_count);
                      }}
                      className="rounded-lg border border-border bg-secondary/50 px-3 py-1.5 text-sm text-foreground"
                    >
                      {seasons.length > 0 ? (
                        seasons.map((s) => (
                          <option key={s.season_number} value={s.season_number}>Season {s.season_number}</option>
                        ))
                      ) : (
                        Array.from({ length: 10 }, (_, i) => (
                          <option key={i + 1} value={i + 1}>Season {i + 1}</option>
                        ))
                      )}
                    </select>
                  </div>
                  <div className="grid grid-cols-5 sm:grid-cols-10 gap-2 max-h-32 overflow-y-auto">
                    {Array.from({ length: Math.min(currentSeasonEpisodes, 50) }, (_, i) => (
                      <button
                        key={i + 1}
                        onClick={() => playEpisode(season, i + 1)}
                        className={cn(
                          "rounded-md py-2 text-xs font-medium transition-colors",
                          episode === i + 1
                            ? "bg-primary text-primary-foreground"
                            : "bg-secondary/50 text-muted-foreground hover:bg-secondary hover:text-foreground"
                        )}
                      >
                        {i + 1}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
