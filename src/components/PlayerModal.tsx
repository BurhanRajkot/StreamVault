import { useState, useEffect } from 'react';
import { X, Play, Server, ChevronDown } from 'lucide-react';
import { Media, MediaMode, CONFIG } from '@/lib/config';
import { buildEmbedUrl } from '@/lib/api';
import { cn } from '@/lib/utils';

interface PlayerModalProps {
  media: Media | null;
  mode: MediaMode;
  isOpen: boolean;
  onClose: () => void;
}

export function PlayerModal({ media, mode, isOpen, onClose }: PlayerModalProps) {
  const [provider, setProvider] = useState('vidfast_pro');
  const [season, setSeason] = useState(1);
  const [episode, setEpisode] = useState(1);
  const [malId, setMalId] = useState('');
  const [subOrDub, setSubOrDub] = useState('sub');
  const [embedUrl, setEmbedUrl] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [showProviderDropdown, setShowProviderDropdown] = useState(false);

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

  if (!isOpen || !media) return null;

  const title = media.title || media.name || 'Unknown';

  const providers = Object.entries(CONFIG.PROVIDER_NAMES);

  const handlePlay = () => {
    const url = buildEmbedUrl(mode, provider, media.id, {
      season,
      episode,
      malId,
      subOrDub,
    });
    setEmbedUrl(url);
    setIsPlaying(true);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-background/90 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-4xl animate-scale-in rounded-2xl bg-card shadow-elevated">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute -right-3 -top-3 flex h-10 w-10 items-center justify-center rounded-full bg-secondary text-muted-foreground transition-colors hover:bg-destructive hover:text-destructive-foreground"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="p-6">
          {/* Title */}
          <h2 className="mb-6 text-2xl font-bold text-gradient">{title}</h2>

          {!isPlaying ? (
            <div className="space-y-6">
              {/* Provider Selector */}
              <div className="relative">
                <label className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <Server className="h-4 w-4" />
                  Select Player Source
                </label>
                <button
                  onClick={() => setShowProviderDropdown(!showProviderDropdown)}
                  className="flex w-full items-center justify-between rounded-lg border border-border bg-secondary/50 px-4 py-3 text-left text-foreground transition-colors hover:border-primary"
                >
                  <span>{CONFIG.PROVIDER_NAMES[provider]}</span>
                  <ChevronDown className={cn("h-4 w-4 transition-transform", showProviderDropdown && "rotate-180")} />
                </button>

                {showProviderDropdown && (
                  <div className="absolute z-20 mt-2 w-full rounded-lg border border-border bg-popover shadow-lg">
                    {providers.map(([key, name]) => (
                      <button
                        key={key}
                        onClick={() => {
                          setProvider(key);
                          setShowProviderDropdown(false);
                        }}
                        className={cn(
                          "w-full px-4 py-3 text-left text-sm transition-colors hover:bg-secondary first:rounded-t-lg last:rounded-b-lg",
                          provider === key ? "bg-primary/10 text-primary" : "text-foreground"
                        )}
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* TV Controls */}
              {mode === 'tv' && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-muted-foreground">
                      Season
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={season}
                      onChange={(e) => setSeason(Number(e.target.value))}
                      className="w-full rounded-lg border border-border bg-secondary/50 px-4 py-3 text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-muted-foreground">
                      Episode
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={episode}
                      onChange={(e) => setEpisode(Number(e.target.value))}
                      className="w-full rounded-lg border border-border bg-secondary/50 px-4 py-3 text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                </div>
              )}

              {/* Anime Controls */}
              {mode === 'anime' && (
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-muted-foreground">
                      MAL ID
                    </label>
                    <input
                      type="text"
                      value={malId}
                      onChange={(e) => setMalId(e.target.value)}
                      placeholder="1234"
                      className="w-full rounded-lg border border-border bg-secondary/50 px-4 py-3 text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-muted-foreground">
                      Episode
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={episode}
                      onChange={(e) => setEpisode(Number(e.target.value))}
                      className="w-full rounded-lg border border-border bg-secondary/50 px-4 py-3 text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-muted-foreground">
                      Type
                    </label>
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

              {/* Play Button */}
              <button
                onClick={handlePlay}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-primary py-4 font-semibold text-primary-foreground transition-all hover:shadow-glow hover:scale-[1.02]"
              >
                <Play className="h-5 w-5 fill-current" />
                Start Playback
              </button>
            </div>
          ) : (
            <div className="aspect-video overflow-hidden rounded-lg border border-border">
              <iframe
                src={embedUrl}
                className="h-full w-full"
                allowFullScreen
                allow="autoplay; fullscreen"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
