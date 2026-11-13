import { Link } from 'react-router-dom';
import { Github, Heart, Shield } from 'lucide-react';
import { GITHUB_REPO_URL } from '@/lib/supportPrompt';

export function Footer() {
  return (
    <footer className="mt-auto border-t border-border/50 bg-background">
      {/* pb-tabbar keeps the last line clear of the mobile bottom tab bar */}
      <div className="w-full px-[var(--sv-gutter)] py-10 pb-tabbar">
        <div className="mb-8 flex flex-col justify-between gap-8 text-sm text-muted-foreground md:flex-row">
          <div className="max-w-md space-y-3">
            <h2 className="text-base font-semibold text-foreground">
              Stream<span className="text-primary">Vault</span>
            </h2>
            <p className="text-xs leading-relaxed">
              Watch movies, TV shows and anime online free — HD and 4K streaming, every season and episode, no sign-up.
            </p>
          </div>

          <nav aria-label="Footer" className="grid grid-cols-2 gap-x-10 gap-y-2 text-xs sm:grid-cols-3">
            <Link to="/movies" className="transition-colors hover:text-foreground">Movies</Link>
            <Link to="/tv" className="transition-colors hover:text-foreground">TV Shows</Link>
            <Link to="/anime" className="transition-colors hover:text-foreground">Anime</Link>
            <Link to="/documentaries" className="transition-colors hover:text-foreground">Documentaries</Link>
            <Link to="/pricing" className="transition-colors hover:text-foreground">Premium</Link>
            <a href={GITHUB_REPO_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 transition-colors hover:text-foreground">
              <Github className="h-3.5 w-3.5" aria-hidden="true" />
              Star on GitHub
            </a>
          </nav>
        </div>

        <div className="pt-6 border-t border-border/40 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-4">
            <p>© {new Date().getFullYear()} StreamVault. All rights reserved.</p>
            <Link to="/admin/dashboard" aria-label="Admin login" className="inline-flex items-center gap-1 transition-colors hover:text-foreground">
              <Shield className="h-3.5 w-3.5" />
              Admin
            </Link>
          </div>
          <p className="flex items-center gap-1">
            Developed with <Heart className="h-3 w-3 fill-red-500 text-red-500" /> by Burhanuddin Rajkotwala
          </p>
        </div>
      </div>
    </footer>
  );
}
