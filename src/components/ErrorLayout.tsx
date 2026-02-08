
import { Button } from "@/components/ui/button";
import { ArrowLeft, Home, RotateCcw } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface ErrorLayoutProps {
  code: string;
  title: string;
  description: string;
  imageSrc: string;
  showRetry?: boolean;
  onRetry?: () => void;
  action?: React.ReactNode;
}

const ErrorLayout = ({
  code,
  title,
  description,
  imageSrc,
  showRetry,
  onRetry,
  action,
}: ErrorLayoutProps) => {
  const navigate = useNavigate();

  const handleGoBack = () => {
    // Check if there is a previous page in the history stack
    if (window.history.state && window.history.state.idx > 0) {
      navigate(-1);
    } else {
      // Fallback to home if no history (e.g. user landed directly on error page)
      navigate("/");
    }
  };

  return (
    <div className="relative h-screen w-full overflow-hidden bg-background font-sans selection:bg-primary/30">
      {/* Fullscreen Background Image with Parallax-like feel */}
      <div className="absolute inset-0 z-0">
        <img
          src={imageSrc}
          alt={title}
          className="h-full w-full object-cover transition-transform duration-[20s] ease-linear hover:scale-110 animate-pulse-glow"
          style={{ animationDuration: '8s' }} // Slow down the pulse for background
        />
        {/* Cinematic Overlays */}
        {/* 1. Darken the image overall for text readability */}
        <div className="absolute inset-0 bg-black/60" />
        {/* 2. Gradient from bottom to top to integrate with page structure */}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent/20" />
        {/* 3. Radial gradient to focus attention on center */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(0,0,0,0.8)_100%)]" />
      </div>

      {/* Content Container */}
      <div className="relative z-10 flex h-full flex-col items-center justify-center px-4 text-center">
        <div className="max-w-4xl space-y-8 animate-fade-in relative">
            {/* Visual Error Code Background Element - Centered behind text */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 -z-10 select-none pointer-events-none w-full">
                <h1 className="text-[12rem] sm:text-[18rem] md:text-[25rem] leading-none font-black text-white/[0.1] font-display blur-sm tracking-tighter">
                  {code}
                </h1>
            </div>

            {/* Main textual content */}
            <div className="relative space-y-6">
                 <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 backdrop-blur-md shadow-lg mb-4">
                    <span className="flex h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                    <span className="text-sm font-medium text-white/90 uppercase tracking-widest leading-none">{code} Error</span>
                 </div>

                <div className="space-y-4">
                  <h2 className="text-5xl md:text-7xl lg:text-8xl font-black tracking-tight text-white drop-shadow-2xl font-display uppercase">
                    {title}
                  </h2>

                  <p className="mx-auto max-w-xl text-lg md:text-xl text-gray-300 font-light leading-relaxed drop-shadow-md">
                    {description}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex flex-col sm:flex-row gap-4 justify-center items-center pt-8">
                    <Button
                      size="lg"
                      onClick={() => navigate("/")}
                      className="bg-primary hover:bg-primary/90 text-white min-w-[160px] h-12 text-base shadow-xl shadow-primary/20 border-0 rounded-full transition-all duration-300 hover:scale-105"
                    >
                      <Home className="mr-2 h-4 w-4" />
                      Return Home
                    </Button>

                    {showRetry && (
                      <Button
                        variant="secondary"
                        size="lg"
                        onClick={onRetry ? onRetry : () => window.location.reload()}
                        className="bg-white/10 hover:bg-white/20 text-white border border-white/10 backdrop-blur-md min-w-[160px] h-12 text-base rounded-full transition-all duration-300 hover:scale-105"
                      >
                        <RotateCcw className="mr-2 h-4 w-4" />
                        Try Again
                      </Button>
                    )}

                     <Button
                      variant="outline"
                      size="lg"
                      onClick={handleGoBack}
                      className="bg-transparent border-white/20 text-white hover:bg-white/10 min-w-[160px] h-12 text-base rounded-full backdrop-blur-sm transition-all duration-300 hover:scale-105"
                    >
                      <ArrowLeft className="mr-2 h-4 w-4" />
                      Go Back
                    </Button>

                    {action}
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};

export default ErrorLayout;
