import { Play, Star } from 'lucide-react';
import { Media } from '@/lib/config';
import { getImageUrl } from '@/lib/api';
import { cn } from '@/lib/utils';

interface MediaCardProps {
  media: Media;
  onClick: (media: Media) => void;
  variant?: 'default' | 'hero';
}

export function MediaCard({ media, onClick, variant = 'default' }: MediaCardProps) {
  const title = media.title || media.name || 'Unknown';
  const rating = media.vote_average?.toFixed(1) || 'N/A';
  const imageUrl = getImageUrl(media.poster_path, 'poster');

  if (variant === 'hero') {
    return (
      <div
        onClick={() => onClick(media)}
        className="group relative h-[400px] cursor-pointer overflow-hidden rounded-xl sm:h-[500px]"
      >
        <img
          src={getImageUrl(media.backdrop_path || media.poster_path, 'backdrop')}
          alt={title}
          className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-overlay" />
        <div className="absolute bottom-0 left-0 right-0 p-6 sm:p-8">
          <div className="flex items-center gap-2 mb-3">
            <span className="flex items-center gap-1 rounded-full bg-highlight/20 px-2 py-1 text-xs font-medium text-highlight">
              <Star className="h-3 w-3 fill-current" />
              {rating}
            </span>
          </div>
          <h2 className="text-2xl font-bold text-foreground sm:text-4xl mb-3">{title}</h2>
          <p className="line-clamp-2 max-w-2xl text-sm text-muted-foreground sm:text-base">
            {media.overview || 'No description available.'}
          </p>
          <button className="mt-4 flex items-center gap-2 rounded-lg bg-primary px-6 py-3 font-semibold text-primary-foreground transition-all hover:shadow-glow hover:scale-105">
            <Play className="h-5 w-5 fill-current" />
            Watch Now
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={() => onClick(media)}
      className={cn(
        'group relative cursor-pointer overflow-hidden rounded-lg bg-card transition-all duration-300',
        'hover:scale-[1.02] hover:shadow-card hover:ring-1 hover:ring-primary/50'
      )}
    >
      {/* Poster */}
      <div className="relative aspect-[2/3] overflow-hidden">
        <img
          src={imageUrl}
          alt={title}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
        />
        
        {/* Play Overlay */}
        <div className="absolute inset-0 flex items-center justify-center bg-background/60 opacity-0 backdrop-blur-sm transition-opacity duration-300 group-hover:opacity-100">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary shadow-glow transition-transform group-hover:scale-110">
            <Play className="h-6 w-6 fill-current text-primary-foreground" />
          </div>
        </div>

        {/* Rating Badge */}
        <div className="absolute left-2 top-2 flex items-center gap-1 rounded-md bg-background/80 px-2 py-1 text-xs font-medium backdrop-blur-sm">
          <Star className="h-3 w-3 fill-highlight text-highlight" />
          <span className="text-foreground">{rating}</span>
        </div>
      </div>

      {/* Info */}
      <div className="p-3">
        <h3 className="line-clamp-1 text-sm font-semibold text-foreground">{title}</h3>
        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
          {media.overview || 'No description available.'}
        </p>
      </div>
    </div>
  );
}

export function MediaCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-lg bg-card">
      <div className="aspect-[2/3] animate-shimmer" />
      <div className="p-3 space-y-2">
        <div className="h-4 w-3/4 animate-shimmer rounded" />
        <div className="h-3 w-full animate-shimmer rounded" />
        <div className="h-3 w-2/3 animate-shimmer rounded" />
      </div>
    </div>
  );
}
