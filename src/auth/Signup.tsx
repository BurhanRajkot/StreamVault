import { useAuth0 } from "@auth0/auth0-react";
import { Button } from "@/components/ui/button";
import { useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Film, ArrowRight } from "lucide-react";
import { Helmet } from "react-helmet-async";

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
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <>
      <Helmet>
        <title>Sign Up - StreamVault</title>
      </Helmet>

      <div className="min-h-screen relative flex items-center justify-center bg-black overflow-hidden">
        {/* Cinematic Background */}
        <div className="absolute inset-0 z-0">
            <div className="absolute inset-0 bg-[url('https://assets.nflxext.com/ffe/siteui/vlv3/c38a2d52-138e-48a3-ab68-36787ece46b3/eeb03fc9-99bf-440f-9d7a-11af9e5fd52f/IN-en-20240101-popsignuptwoweeks-perspective_alpha_website_large.jpg')] bg-cover bg-center opacity-50 scale-105" />
            <div className="absolute inset-0 bg-black/60 bg-gradient-to-input from-black via-transparent to-black" />
        </div>

        {/* Top Logo */}
        <div className="absolute top-0 left-0 p-6 z-20">
             <div className="flex items-center gap-2">
                <Film className="h-8 w-8 text-primary" />
                <span className="text-2xl font-bold tracking-tighter text-red-600 shadow-glow">StreamVault</span>
             </div>
        </div>

        {/* Login Card */}
        <div className="relative z-10 w-full max-w-[450px] p-16 rounded-xl bg-black/75 border border-white/10 backdrop-blur-sm shadow-2xl animate-fade-in mx-4">
            <h1 className="text-3xl font-bold text-white mb-2">Unlimited movies, TV</h1>
            <h2 className="text-xl font-medium text-white mb-8">shows, and more.</h2>

            <div className="grid gap-6">
                <Button
                    onClick={() => loginWithRedirect({ authorizationParams: { screen_hint: "signup" } })}
                    className="h-12 w-full bg-[#e50914] hover:bg-[#c11119] text-white font-medium text-base rounded transition-all transform active:scale-95"
                >
                    Start Membership
                    <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
            </div>

            <div className="mt-8 text-sm text-[#737373]">
                <div className="mt-10">
                    <span className="text-[#737373]">Already have an account? </span>
                    <Link to="/login" className="text-white hover:underline font-medium">
                        Sign in now.
                    </Link>
                </div>

                <p className="mt-4 text-xs">
                    Ready to watch? Enter your email to create or restart your membership.
                </p>
            </div>
        </div>
      </div>
    </>
  );
}
