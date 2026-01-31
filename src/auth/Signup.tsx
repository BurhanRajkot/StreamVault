import { useAuth0 } from "@auth0/auth0-react";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Film, Zap, Shield, Users, Tv, Check, ArrowRight, Star } from "lucide-react";
import { Helmet } from "react-helmet-async";

// Featured movies backdrop
const BACKDROP_IMAGES = [
  "https://image.tmdb.org/t/p/original/xJHokMbljvjADYdit5fK5VQsXEG.jpg", // Dune
  "https://image.tmdb.org/t/p/original/s3TBrRGB1iav7gFOCNx3H31MoES.jpg", // Avatar
  "https://image.tmdb.org/t/p/original/7WsyChQLEftFiDOVTGkv3hFpyyt.jpg", // Inception
];

const FEATURES = [
  { icon: Zap, title: "Instant Streaming", desc: "No downloads, just click and watch" },
  { icon: Shield, title: "Ad-Free Experience", desc: "Enjoy uninterrupted viewing" },
  { icon: Users, title: "Multiple Profiles", desc: "Everyone gets their own space" },
  { icon: Tv, title: "Watch Anywhere", desc: "Phone, tablet, or TV" },
];

const BENEFITS = [
  "Unlimited movies and TV shows",
  "Personalized recommendations",
  "Continue watching across devices",
  "Add favorites to your watchlist",
];

export default function Signup() {
  const { loginWithRedirect, isAuthenticated, isLoading } = useAuth0();
  const navigate = useNavigate();
  const [bgIndex, setBgIndex] = useState(0);

  useEffect(() => {
    if (isAuthenticated) {
      navigate("/");
    }
  }, [isAuthenticated, navigate]);

  // Rotate background images
  useEffect(() => {
    const interval = setInterval(() => {
      setBgIndex((prev) => (prev + 1) % BACKDROP_IMAGES.length);
    }, 5000);
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
        <title>Sign Up - StreamVault</title>
      </Helmet>

      <div className="min-h-screen flex bg-black overflow-hidden">
        {/* LEFT SIDE - Signup Form */}
        <div className="w-full lg:w-1/2 flex flex-col justify-center items-center px-8 lg:px-16 relative z-10">
          {/* Background for mobile */}
          <div className="absolute inset-0 lg:hidden">
            <div
              className="absolute inset-0 bg-cover bg-center opacity-20 transition-all duration-1000"
              style={{ backgroundImage: `url(${BACKDROP_IMAGES[bgIndex]})` }}
            />
            <div className="absolute inset-0 bg-black/80" />
          </div>

          <div className="relative z-10 w-full max-w-md">
            {/* Logo */}
            <div className="flex items-center gap-3 mb-8">
              <div className="p-2 bg-primary/20 rounded-xl">
                <Film className="h-8 w-8 text-primary" />
              </div>
              <span className="text-3xl font-bold tracking-tight bg-gradient-to-r from-primary to-red-400 bg-clip-text text-transparent">
                StreamVault
              </span>
            </div>

            {/* Header */}
            <div className="mb-10">
              <h1 className="text-4xl lg:text-5xl font-bold text-white leading-tight mb-4">
                Join the <span className="text-primary">StreamVault</span> Family
              </h1>
              <p className="text-xl text-gray-400">
                Start your premium entertainment journey today.
              </p>
            </div>

            {/* Benefits checklist */}
            <div className="space-y-3 mb-10">
              {BENEFITS.map((benefit, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 text-gray-300"
                  style={{ animationDelay: `${i * 0.1}s` }}
                >
                  <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                    <Check className="h-4 w-4 text-primary" />
                  </div>
                  <span>{benefit}</span>
                </div>
              ))}
            </div>

            {/* Signup Button */}
            <Button
              onClick={() => loginWithRedirect({ authorizationParams: { screen_hint: "signup" } })}
              className="w-full h-14 bg-gradient-to-r from-primary to-red-500 hover:from-primary/90 hover:to-red-500/90 text-white font-semibold text-lg rounded-full shadow-lg shadow-primary/25 transition-all hover:shadow-xl hover:shadow-primary/40 hover:scale-[1.02] active:scale-95 group"
            >
              Get Started Free
              <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
            </Button>

            {/* Trust badges */}
            <div className="flex items-center justify-center gap-6 mt-8 text-gray-500 text-sm">
              <div className="flex items-center gap-1">
                <Star className="h-4 w-4 text-yellow-500" />
                <span>4.9 Rating</span>
              </div>
              <div className="w-1 h-1 rounded-full bg-gray-600" />
              <span>100K+ Users</span>
              <div className="w-1 h-1 rounded-full bg-gray-600" />
              <span>Free Forever</span>
            </div>

            {/* Login link */}
            <div className="text-center mt-8">
              <span className="text-gray-400">Already have an account? </span>
              <Link
                to="/login"
                className="text-primary hover:text-primary/80 font-semibold transition-colors"
              >
                Sign in
              </Link>
            </div>
          </div>
        </div>

        {/* RIGHT SIDE - Feature Showcase */}
        <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden">
          {/* Animated background */}
          <div className="absolute inset-0">
            {BACKDROP_IMAGES.map((img, i) => (
              <div
                key={i}
                className={`absolute inset-0 bg-cover bg-center transition-opacity duration-1000 ${
                  i === bgIndex ? "opacity-100" : "opacity-0"
                }`}
                style={{ backgroundImage: `url(${img})` }}
              />
            ))}
            <div className="absolute inset-0 bg-gradient-to-l from-transparent via-black/50 to-black" />
            <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-black/50" />
          </div>

          {/* Feature cards */}
          <div className="absolute inset-0 flex flex-col justify-center items-center p-12 z-10">
            <div className="grid grid-cols-2 gap-4 max-w-lg">
              {FEATURES.map(({ icon: Icon, title, desc }, i) => (
                <div
                  key={i}
                  className="p-6 rounded-2xl bg-black/40 backdrop-blur-md border border-white/10 transition-all hover:bg-black/60 hover:border-primary/50 hover:scale-105 cursor-default"
                  style={{
                    animationDelay: `${i * 0.15}s`,
                  }}
                >
                  <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center mb-4">
                    <Icon className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="text-white font-semibold mb-1">{title}</h3>
                  <p className="text-gray-400 text-sm">{desc}</p>
                </div>
              ))}
            </div>

            {/* Bottom tagline */}
            <div className="mt-12 text-center">
              <p className="text-2xl font-bold text-white">
                Your movies, your way.
              </p>
              <p className="text-gray-400 mt-2">
                Join thousands who've made the switch.
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
