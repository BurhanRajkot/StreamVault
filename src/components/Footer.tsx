import { Film, Github, Linkedin, Mail } from 'lucide-react';

export function Footer() {
  return (
    <footer className="mt-auto border-t border-border bg-card/50">
      <div className="container py-10">
        <div className="flex flex-col items-center justify-between gap-6 sm:flex-row">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-primary">
              <Film className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-bold">
              <span className="text-gradient">Stream</span>
              <span className="text-foreground">Vault</span>
            </span>
          </div>

          {/* Links */}
          <div className="flex items-center gap-6">
            <a
              href="mailto:brocks0520@gmail.com"
              className="flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-primary"
            >
              <Mail className="h-4 w-4" />
              <span className="hidden sm:inline">brocks0520@gmail.com</span>
            </a>
            <a
              href="https://github.com/brock520"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-primary"
            >
              <Github className="h-4 w-4" />
              <span className="hidden sm:inline">GitHub</span>
            </a>
            <a
              href="https://www.linkedin.com/in/burhanuddin-rajkotwala-84722b326/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-primary"
            >
              <Linkedin className="h-4 w-4" />
              <span className="hidden sm:inline">LinkedIn</span>
            </a>
          </div>
        </div>

        {/* Bottom */}
        <div className="mt-8 border-t border-border pt-6 text-center text-xs text-muted-foreground">
          <p>© 2025 StreamVault. All rights reserved. | Powered by TMDB API.</p>
          <p className="mt-1">Developed by Burhanuddin Rajkotwala.</p>
        </div>
      </div>
    </footer>
  );
}
