import { Heart } from 'lucide-react';

export function Footer() {
  return (
    <footer className="mt-auto border-t border-border/40 bg-gradient-to-b from-background to-card/30 backdrop-blur-sm">
      <div className="container mx-auto px-4 py-6">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
          <p>© 2025 StreamVault. All rights reserved.</p>
          <p className="flex items-center gap-1">
            Developed with <Heart className="h-3 w-3 fill-red-500 text-red-500" /> by Burhanuddin Rajkotwala
          </p>
        </div>
      </div>
    </footer>
  );
}
