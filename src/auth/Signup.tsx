import { useAuth0 } from "@auth0/auth0-react";
import { Button } from "@/components/ui/button";
import { useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Film, Sparkles, ArrowRight, Star, Play } from "lucide-react";

export default function Signup() {
  const { loginWithRedirect, isAuthenticated, isLoading } = useAuth0();
  const navigate = useNavigate();

  useEffect(() => {
    if (isAuthenticated) {
      navigate("/");
    }
  }, [isAuthenticated, navigate]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-violet-900/20 via-background to-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary/30 border-t-primary" />
          <p className="text-sm text-muted-foreground animate-pulse">Loading...</p>
        </div>
      </div>
    );
  }

    return (
        <div className="relative min-h-screen flex items-center justify-center overflow-hidden px-4">
          {/* Enhanced animated background with mesh gradient effect */}
          <div className="absolute inset-0 bg-gradient-to-br from-background via-background to-golden-amber/5" />
          
          {/* Animated mesh gradient orbs */}
          <div className="absolute top-0 right-0 h-[700px] w-[700px] rounded-full bg-golden-amber/15 blur-[130px] animate-glow-pulse" style={{ animationDuration: '9s' }} />
          <div className="absolute bottom-0 left-0 h-[600px] w-[600px] rounded-full bg-deep-purple/12 blur-[120px] animate-glow-pulse" style={{ animationDuration: '11s', animationDelay: '1.5s' }} />
          <div className="absolute top-1/3 left-1/3 h-[500px] w-[500px] rounded-full bg-emerald-teal/8 blur-[115px] animate-float" style={{ animationDuration: '15s', animationDelay: '0.5s' }} />

          {/* Main content */}
          <div className="relative z-10 w-full max-w-md animate-fade-in" style={{ animationDelay: '0.1s' }}>
            {/* Glass card with enhanced effects */}
            <div className="relative group">
              {/* Animated glow ring */}
              <div className="absolute -inset-1 bg-gradient-sunset rounded-3xl opacity-0 group-hover:opacity-60 blur-xl transition-all duration-700 animate-pulse-glow" />
              
              {/* Card */}
              <div className="relative backdrop-blur-2xl bg-card/60 border-2 border-golden-amber/25 rounded-3xl p-10 shadow-2xl hover:border-golden-amber/40 transition-all duration-500">
                {/* Logo with stagger animation */}
                <div className="flex justify-center mb-10 animate-scale-in" style={{ animationDelay: '0.2s' }}>
                  <div className="relative group/logo">
                    <div className="absolute inset-0 bg-gradient-sunset rounded-2xl blur-2xl opacity-70 group-hover/logo:opacity-100 transition-opacity duration-500" />
                    <div className="relative flex items-center gap-3 bg-gradient-sunset px-8 py-4 rounded-2xl shadow-glow-amber hover:scale-110 transition-all duration-300">
                      <Film className="h-7 w-7 text-white drop-shadow-lg" />
                      <span className="text-2xl font-bold text-white tracking-tight drop-shadow-lg">StreamVault</span>
                    </div>
                  </div>
                </div>

                {/* Header with stagger */}
                <div className="text-center mb-10 animate-fade-in" style={{ animationDelay: '0.3s' }}>
                  <h1 className="text-4xl font-bold mb-3 bg-gradient-sunset bg-clip-text text-transparent leading-tight">
                    Start streaming today
                  </h1>
                  <p className="text-muted-foreground text-base">
                    Join thousands discovering unlimited entertainment
                  </p>
                </div>

                {/* Sign up button with enhanced effects */}
                <div className="animate-fade-in" style={{ animationDelay: '0.4s' }}>
                  <Button
                    onClick={() => loginWithRedirect({ authorizationParams: { screen_hint: "signup" } })}
                    className="w-full h-14 bg-gradient-sunset hover:shadow-glow-amber text-white font-semibold rounded-2xl shadow-xl shadow-golden-amber/30 transition-all duration-300 hover:scale-[1.05] active:scale-[0.95] group relative overflow-hidden"
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/25 to-transparent translate-x-[-200%] group-hover:translate-x-[200%] transition-transform duration-700" />
                    <span className="flex items-center gap-2 relative z-10">
                      Create account with Auth0
                      <ArrowRight className="h-5 w-5 group-hover:translate-x-2 transition-transform duration-300" />
                    </span>
                  </Button>
                </div>

                {/* Features with stagger */}
                <div className="mt-10 pt-8 border-t border-border/50 animate-fade-in" style={{ animationDelay: '0.5s' }}>
                  <div className="grid gap-4 text-sm">
                    <div className="flex items-center gap-3 text-foreground/80 hover:text-foreground transition-all duration-300 group/item">
                      <div className="p-2.5 rounded-xl bg-golden-amber/10 group-hover/item:bg-golden-amber/20 transition-all duration-300 group-hover/item:scale-110">
                        <Play className="h-4 w-4 text-golden-amber" />
                      </div>
                      <span className="font-medium">Stream unlimited movies & TV shows</span>
                    </div>
                    <div className="flex items-center gap-3 text-foreground/80 hover:text-foreground transition-all duration-300 group/item">
                      <div className="p-2.5 rounded-xl bg-deep-purple/10 group-hover/item:bg-deep-purple/20 transition-all duration-300 group-hover/item:scale-110">
                        <Star className="h-4 w-4 text-deep-purple" />
                      </div>
                      <span className="font-medium">Build your personal watchlist</span>
                    </div>
                    <div className="flex items-center gap-3 text-foreground/80 hover:text-foreground transition-all duration-300 group/item">
                      <div className="p-2.5 rounded-xl bg-emerald-teal/10 group-hover/item:bg-emerald-teal/20 transition-all duration-300 group-hover/item:scale-110">
                        <Sparkles className="h-4 w-4 text-emerald-teal" />
                      </div>
                      <span className="font-medium">Resume watching across devices</span>
                    </div>
                  </div>
                </div>

                {/* Sign in link */}
                <p className="text-center text-sm text-muted-foreground mt-8 animate-fade-in" style={{ animationDelay: '0.6s' }}>
                  Already have an account?{" "}
                  <Link 
                    to="/login" 
                    className="text-transparent bg-clip-text bg-gradient-sunset hover:opacity-80 font-semibold transition-all hover:tracking-wide inline-block"
                  >
                    Sign in
                  </Link>
                </p>
              </div>
            </div>
          </div>
      </div>
    );
}
