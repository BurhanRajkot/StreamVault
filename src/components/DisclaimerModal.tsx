import { AlertTriangle, Shield, Check } from 'lucide-react';

interface DisclaimerModalProps {
  isOpen: boolean;
  onAccept: () => void;
}

export function DisclaimerModal({ isOpen, onAccept }: DisclaimerModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-background/95 backdrop-blur-md" />

      <div className="relative z-10 w-full max-w-lg animate-scale-in rounded-2xl bg-card p-8 shadow-elevated">
        {/* Icon */}
        <div className="mb-6 flex justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 ring-4 ring-primary/20">
            <AlertTriangle className="h-8 w-8 text-primary" />
          </div>
        </div>

        {/* Title */}
        <h2 className="mb-4 text-center text-2xl font-bold text-foreground">
          Important Disclosure
        </h2>

        {/* Content */}
        <div className="mb-6 space-y-4 text-center">
          <p className="text-muted-foreground">
            This website is built for{' '}
            <span className="font-medium text-foreground">
              educational and portfolio demonstration
            </span>{' '}
            purposes. It uses the TMDB API and embeds content from external sources.
          </p>

          <div className="rounded-lg bg-highlight/10 p-4">
            <p className="text-sm font-medium text-highlight">
              We do not host or upload any content. Everything is served by third-party
              providers.
            </p>
          </div>

          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Shield className="h-4 w-4 text-primary" />
            <span>
              <span className="font-medium text-foreground">Pro Tip:</span> Use a trusted
              ad-blocker for a smooth experience.
            </span>
          </div>
        </div>

        {/* Accept Button */}
        <button
          onClick={onAccept}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-primary py-4 font-semibold text-primary-foreground transition-all hover:shadow-glow hover:scale-[1.02]"
        >
          <Check className="h-5 w-5" />
          I Understand & Accept
        </button>
      </div>
    </div>
  );
}
