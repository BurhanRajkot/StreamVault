import { Sparkles, Search } from 'lucide-react';
import { Media } from '@/lib/config';

interface AnimeSectionProps {
  onMediaClick: (media: Media) => void;
}

const sampleAnime: Media[] = [
  {
    id: 21,
    name: 'One Punch Man',
    poster_path: null,
    backdrop_path: null,
    overview: 'The story of Saitama, a hero who can defeat any opponent with a single punch.',
    vote_average: 8.5,
  },
  {
    id: 16498,
    name: 'Attack on Titan',
    poster_path: null,
    backdrop_path: null,
    overview: 'After his hometown is destroyed, young Eren Jaeger vows to cleanse the earth of giants.',
    vote_average: 9.0,
  },
  {
    id: 38000,
    name: 'Demon Slayer',
    poster_path: null,
    backdrop_path: null,
    overview: 'A young boy becomes a demon slayer to avenge his family and cure his sister.',
    vote_average: 8.7,
  },
  {
    id: 1735,
    name: 'Naruto',
    poster_path: null,
    backdrop_path: null,
    overview: 'Follow Naruto Uzumaki on his journey to become the greatest Hokage.',
    vote_average: 8.4,
  },
];

export function AnimeSection({ onMediaClick }: AnimeSectionProps) {
  return (
    <div className="md:animate-fade-in">
      {/* Header */}
      <div className="mb-10 text-center">
        <div className="mb-4 inline-flex items-center gap-2 rounded-lg bg-accent/10 px-4 py-2 text-accent">
          <Sparkles className="h-5 w-5" />
          <span className="font-medium">Anime Mode</span>
        </div>
        <h2 className="text-3xl font-bold text-foreground sm:text-4xl">
          Stream Your Favorite Anime
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
          To watch anime, enter the MAL ID and episode number in the player modal.
          Select from popular titles below or search for specific anime.
        </p>
      </div>

      {/* Search Tip */}
      <div className="mb-10 flex items-center justify-center">
        <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-6 py-4">
          <Search className="h-5 w-5 text-primary" />
          <span className="text-muted-foreground">
            Use the search bar to find anime by name, then get the MAL ID from MyAnimeList
          </span>
        </div>
      </div>

      {/* Sample Anime Grid */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {sampleAnime.map((anime) => (
          <div
            key={anime.id}
            onClick={() => onMediaClick(anime)}
            className="group cursor-pointer overflow-hidden rounded-xl bg-card p-6 transition-all hover:bg-secondary hover:shadow-card"
          >
            <div className="mb-4 flex h-32 items-center justify-center rounded-lg bg-gradient-primary/10">
              <Sparkles className="h-12 w-12 text-primary transition-transform group-hover:scale-110" />
            </div>
            <h3 className="mb-2 font-semibold text-foreground">{anime.name}</h3>
            <p className="mb-3 line-clamp-2 text-sm text-muted-foreground">
              {anime.overview}
            </p>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">MAL ID: {anime.id}</span>
              <span className="font-medium text-highlight">★ {anime.vote_average}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
