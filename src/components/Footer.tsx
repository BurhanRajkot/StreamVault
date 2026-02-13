import { Heart } from 'lucide-react';

export function Footer() {
  return (
    <footer className="mt-auto border-t border-border/40 bg-gradient-to-b from-background to-card/30 backdrop-blur-sm">
      <div className="mx-auto w-full max-w-[1600px] 2xl:max-w-[1800px] 3xl:max-w-[2000px] px-4 sm:px-6 lg:px-8 xl:px-10 py-6">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 text-xs md:text-sm text-muted-foreground">
          <p>© 2025 StreamVault. All rights reserved.</p>
          <p className="flex items-center gap-1">
            Developed with <Heart className="h-3 w-3 md:h-3.5 md:w-3.5 fill-red-500 text-red-500" /> by Burhanuddin Rajkotwala
          </p>
        </div>
      </div>
    </footer>
  );
}
