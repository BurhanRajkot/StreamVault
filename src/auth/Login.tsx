import { useAuth0 } from "@auth0/auth0-react";
import { Button } from "@/components/ui/button";
import { useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Film, Sparkles, ArrowRight } from "lucide-react";

export default function Login() {
  const { loginWithRedirect, isAuthenticated, isLoading } = useAuth0();
  const navigate = useNavigate();

  useEffect(() => {
    if (isAuthenticated) {
      navigate("/");
    }
  }, [isAuthenticated, navigate]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-cyan-900/20 via-background to-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary/30 border-t-primary" />
          <p className="text-sm text-muted-foreground animate-pulse">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden px-4">
      {/* Animated gradient background */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-cyan-900/20 via-background to-background" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,_var(--tw-gradient-stops))] from-violet-900/20 via-transparent to-transparent" />
      
      {/* Floating orbs */}
      <div className="absolute top-20 left-20 h-72 w-72 rounded-full bg-cyan-500/10 blur-3xl animate-pulse" style={{ animationDuration: '4s' }} />
      <div className="absolute bottom-20 right-20 h-96 w-96 rounded-full bg-violet-500/10 blur-3xl animate-pulse" style={{ animationDuration: '6s', animationDelay: '1s' }} />

      {/* Main content */}
      <div className="relative z-10 w-full max-w-md animate-fade-in">
        {/* Glass card */}
        <div className="relative group">
          {/* Glow effect */}
          <div className="absolute -inset-0.5 bg-gradient-to-r from-cyan-500 to-violet-500 rounded-2xl opacity-20 group-hover:opacity-30 blur transition duration-500" />
          
          {/* Card */}
          <div className="relative backdrop-blur-xl bg-background/40 border border-white/10 rounded-2xl p-8 shadow-2xl">
            {/* Logo */}
            <div className="flex justify-center mb-8">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-r from-cyan-500 to-violet-500 rounded-2xl blur-lg opacity-50" />
                <div className="relative flex items-center gap-3 bg-gradient-to-br from-cyan-500 to-violet-500 px-6 py-3 rounded-2xl">
                  <Film className="h-6 w-6 text-white" />
                  <span className="text-xl font-bold text-white">StreamVault</span>
                </div>
              </div>
            </div>

            {/* Header */}
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold mb-2 bg-gradient-to-r from-cyan-400 via-violet-400 to-fuchsia-400 bg-clip-text text-transparent">
                Welcome back
              </h1>
              <p className="text-muted-foreground">
                Sign in to continue your streaming journey
              </p>
            </div>

            {/* Sign in button */}
            <Button
              onClick={() => loginWithRedirect()}
              className="w-full h-12 bg-gradient-to-r from-cyan-500 to-violet-500 hover:from-cyan-600 hover:to-violet-600 text-white font-medium rounded-xl shadow-lg shadow-cyan-500/25 transition-all duration-300 hover:shadow-xl hover:shadow-cyan-500/40 hover:scale-[1.02] active:scale-[0.98] group"
            >
              <span className="flex items-center gap-2">
                Sign in with Auth0
                <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
              </span>
            </Button>

            {/* Features */}
            <div className="mt-8 pt-6 border-t border-white/5">
              <div className="grid gap-3 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Sparkles className="h-4 w-4 text-cyan-400" />
                  <span>Access thousands of movies & shows</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Sparkles className="h-4 w-4 text-violet-400" />
                  <span>Save your favorites and continue watching</span>
                </div>
              </div>
            </div>

            {/* Sign up link */}
            <p className="text-center text-sm text-muted-foreground mt-6">
              Don't have an account?{" "}
              <Link 
                to="/signup" 
                className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-violet-400 hover:from-cyan-300 hover:to-violet-300 font-medium transition-all"
              >
                Sign up
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
