import { Film, Github, Linkedin, Mail, Heart } from 'lucide-react';

export function Footer() {
  return (
    <footer className="mt-auto border-t border-border/40 bg-gradient-to-b from-background to-card/30 backdrop-blur-sm">
      <div className="container mx-auto px-4 py-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          {/* Brand Section */}
          <div className="flex flex-col items-center md:items-start gap-4">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-primary rounded-xl blur-md opacity-70" />
                <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-primary shadow-lg">
                  <Film className="h-5 w-5 text-white" />
                </div>
              </div>
              <span className="text-xl font-bold">
                <span className="text-white">Stream</span>
                <span className="text-primary">Vault</span>
              </span>
            </div>
            <p className="text-sm text-muted-foreground text-center md:text-left max-w-xs">
              Your premium streaming platform for movies and TV shows. Powered by TMDB API.
            </p>
          </div>

          {/* Quick Links */}
          <div className="flex flex-col items-center gap-3">
            <h3 className="text-sm font-semibold text-foreground mb-2">Quick Links</h3>
            <div className="flex flex-col gap-2 text-sm">
              <a href="/" className="text-muted-foreground hover:text-primary transition-colors">Home</a>
              <a href="/favorites" className="text-muted-foreground hover:text-primary transition-colors">Favorites</a>
              <a href="/pricing" className="text-muted-foreground hover:text-primary transition-colors">Pricing</a>
            </div>
          </div>

          {/* Contact Section */}
          <div className="flex flex-col items-center md:items-end gap-3">
            <h3 className="text-sm font-semibold text-foreground mb-2">Connect</h3>
            <div className="flex flex-col gap-3">
              <a
                href="mailto:brocks0520@gmail.com"
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors"
              >
                <Mail className="h-4 w-4" />
                <span>brocks0520@gmail.com</span>
              </a>
              <a
                href="https://github.com/brock520"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors"
              >
                <Github className="h-4 w-4" />
                <span>GitHub</span>
              </a>
              <a
                href="https://www.linkedin.com/in/burhanuddin-rajkotwala-84722b326/"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors"
              >
                <Linkedin className="h-4 w-4" />
                <span>LinkedIn</span>
              </a>
            </div>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="border-t border-border/40 pt-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
            <p>© 2025 StreamVault. All rights reserved.</p>
            <p className="flex items-center gap-1">
              Developed with <Heart className="h-3 w-3 fill-red-500 text-red-500" /> by Burhanuddin Rajkotwala
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
