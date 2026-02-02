import { useAuth0 } from "@auth0/auth0-react";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Film, Play, Heart, Download, Sparkles, ChevronRight } from "lucide-react";
import { Helmet } from "react-helmet-async";

// Sample movie posters for the collage
const MOVIE_POSTERS = [
  "https://image.tmdb.org/t/p/w500/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg", // Interstellar
  "https://image.tmdb.org/t/p/w500/udDclJoHjfjb8Ekgsd4FDteOkCU.jpg", // Joker
  "https://image.tmdb.org/t/p/w500/f89U3ADr1oiB1s9GkdPOEpXUk5H.jpg", // The Matrix
  "https://image.tmdb.org/t/p/w500/d5NXSklXo0qyIYkgV94XAgMIckC.jpg", // Dune
  "https://image.tmdb.org/t/p/w500/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg", // Fight Club
  "https://image.tmdb.org/t/p/w500/7WsyChQLEftFiDOVTGkv3hFpyyt.jpg", // Inception
];

const VALUE_PROPS = [
  { icon: Play, text: "Stream unlimited movies & TV shows" },
  { icon: Heart, text: "Save your favorites for later" },
  { icon: Download, text: "Track your watch history" },
  { icon: Sparkles, text: "Premium ad-free experience" },
];

export default function Login() {
  const { loginWithRedirect, isAuthenticated, isLoading } = useAuth0();
  const navigate = useNavigate();
  const [activeText, setActiveText] = useState(0);

  const headlines = [
    "Your Entertainment Journey Starts Here",
    "Thousands of Movies Await You",
    "Binge-Worthy TV Shows, Anytime",
  ];

  useEffect(() => {
    if (isAuthenticated) {
      navigate("/");
    }
  }, [isAuthenticated, navigate]);

  // Rotate headline text
  useEffect(() => {
    const interval = setInterval(() => {
      setActiveText((prev) => (prev + 1) % headlines.length);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

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
        <title>Sign In - StreamVault</title>
      </Helmet>

      <div className="min-h-screen flex bg-black overflow-hidden">
        {/* LEFT SIDE - Movie Poster Collage */}
        <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden">
          {/* Animated poster grid */}
          <div className="absolute inset-0 grid grid-cols-3 gap-2 p-4 animate-pulse-slow">
            {MOVIE_POSTERS.map((poster, i) => (
              <div
                key={i}
                className="relative overflow-hidden rounded-xl transform transition-all duration-700 hover:scale-105"
                style={{
                  animationDelay: `${i * 0.2}s`,
                }}
              >
                <img
                  src={poster}
                  alt="Movie poster"
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
              </div>
            ))}
          </div>

          {/* Gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-transparent to-black/90 z-10" />
          <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-black/50 z-10" />

          {/* Floating badge */}
          <div className="absolute bottom-10 left-10 z-20 bg-primary/90 backdrop-blur-sm rounded-full px-6 py-3 flex items-center gap-2 animate-bounce-slow">
            <Sparkles className="h-5 w-5 text-white" />
            <span className="text-white font-semibold">10,000+ Titles</span>
          </div>
        </div>

        {/* RIGHT SIDE - Login Form */}
        <div className="w-full lg:w-1/2 flex flex-col justify-center items-center px-8 lg:px-16 relative">
          {/* Background gradient for mobile */}
          <div className="absolute inset-0 lg:hidden">
            <div
              className="absolute inset-0 bg-cover bg-center opacity-30"
              style={{
                backgroundImage: `url(${MOVIE_POSTERS[0]})`,
              }}
            />
            <div className="absolute inset-0 bg-black/80" />
          </div>

          <div className="relative z-10 w-full max-w-md">
            {/* Logo */}
            <div className="flex items-center gap-3 mb-12">
              <div className="p-2 bg-primary/20 rounded-xl">
                <Film className="h-8 w-8 text-primary" />
              </div>
              <span className="text-3xl font-bold tracking-tight bg-gradient-to-r from-primary to-red-400 bg-clip-text text-transparent">
                StreamVault
              </span>
            </div>

            {/* Animated headline */}
            <div className="mb-8 h-20 overflow-hidden">
              <h1 className="text-4xl lg:text-5xl font-bold text-white leading-tight transition-all duration-500 ease-out">
                {headlines[activeText]}
              </h1>
            </div>

            <p className="text-gray-400 text-lg mb-8">
              Sign in to unlock your personalized streaming experience.
            </p>

            {/* Value props */}
            <div className="grid grid-cols-2 gap-4 mb-10">
              {VALUE_PROPS.map(({ icon: Icon, text }, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/10 transition-all hover:bg-white/10 hover:border-primary/50"
                >
                  <Icon className="h-5 w-5 text-primary flex-shrink-0" />
                  <span className="text-sm text-gray-300">{text}</span>
                </div>
              ))}
            </div>

            {/* Login Button */}
            <Button
              onClick={() => loginWithRedirect()}
              className="w-full h-14 bg-gradient-to-r from-primary to-red-500 hover:from-primary/90 hover:to-red-500/90 text-white font-semibold text-lg rounded-full shadow-lg shadow-primary/25 transition-all hover:shadow-xl hover:shadow-primary/40 hover:scale-[1.02] active:scale-95"
            >
              Sign In
              <ChevronRight className="ml-2 h-5 w-5" />
            </Button>

            {/* Divider */}
            <div className="flex items-center my-8">
              <div className="flex-1 h-px bg-white/10" />
              <span className="px-4 text-gray-500 text-sm">or</span>
              <div className="flex-1 h-px bg-white/10" />
            </div>

            {/* Signup link */}
            <div className="text-center">
              <span className="text-gray-400">New to StreamVault? </span>
              <Link
                to="/signup"
                className="text-primary hover:text-primary/80 font-semibold transition-colors"
              >
                Create an account
              </Link>
            </div>

            {/* Footer */}
            <p className="text-center text-gray-600 text-xs mt-8">
              By signing in, you agree to our Terms of Service and Privacy Policy.
            </p>
          </div>
        </div>
      </div>

      {/* Custom animations */}
      <style>{`
        @keyframes pulse-slow {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.8; }
        }
        @keyframes bounce-slow {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }
        .animate-pulse-slow {
          animation: pulse-slow 4s ease-in-out infinite;
        }
        .animate-bounce-slow {
          animation: bounce-slow 3s ease-in-out infinite;
        }
      `}</style>
    </>
  );
}
