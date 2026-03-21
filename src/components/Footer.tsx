import { Heart, Facebook, Instagram, Linkedin, Youtube } from 'lucide-react';

export function Footer() {
  return (
    <footer className="mt-auto border-t border-border/40 bg-gradient-to-b from-background to-card/30 backdrop-blur-sm">
      <div className="container mx-auto px-4 py-8">
        <div className="flex flex-col md:flex-row justify-between gap-8 text-sm text-muted-foreground mb-8">
          <div className="space-y-4">
            <h3 className="text-foreground font-semibold">StreamVault</h3>
            <div className="space-y-1 text-xs">
              <p>123 Streaming Blvd, Suite 400</p>
              <p>Los Angeles, CA 90028</p>
              <p>Phone: +1 (555) 123-4567</p>
            </div>
          </div>
          
          <div className="space-y-4">
            <h3 className="text-foreground font-semibold">Connect with us</h3>
            <div className="flex gap-4">
              <a href="https://facebook.com/streamvault" target="_blank" rel="noreferrer" className="hover:text-foreground transition-colors" aria-label="Facebook">
                <Facebook className="h-5 w-5" />
              </a>
              <a href="https://instagram.com/streamvault" target="_blank" rel="noreferrer" className="hover:text-foreground transition-colors" aria-label="Instagram">
                <Instagram className="h-5 w-5" />
              </a>
              <a href="https://linkedin.com/company/streamvault" target="_blank" rel="noreferrer" className="hover:text-foreground transition-colors" aria-label="LinkedIn">
                <Linkedin className="h-5 w-5" />
              </a>
              <a href="https://youtube.com/c/streamvault" target="_blank" rel="noreferrer" className="hover:text-foreground transition-colors" aria-label="YouTube">
                <Youtube className="h-5 w-5" />
              </a>
            </div>
          </div>
        </div>

        <div className="pt-6 border-t border-border/40 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
          <p>© 2025 StreamVault. All rights reserved.</p>
          <p className="flex items-center gap-1">
            Developed with <Heart className="h-3 w-3 fill-red-500 text-red-500" /> by Burhanuddin Rajkotwala
          </p>
        </div>
      </div>
    </footer>
  );
}
