import { useAuth0 } from "@auth0/auth0-react";
import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { fetchTrending, getImageUrl } from "@/lib/api";
import {
  Sparkles,
  Play,
  Heart,
  Download,
  Film,
  ArrowRight
} from 'lucide-react';

const FALLBACK_POSTERS = [
  'https://images.unsplash.com/photo-1614730321146-b6fa6a46bcb4?q=80&w=800&auto=format&fit=crop', 
  'https://images.unsplash.com/photo-1541882897987-0b16f15777df?q=80&w=800&auto=format&fit=crop', 
  'https://images.unsplash.com/photo-1526362804561-12ecdbd28120?q=80&w=800&auto=format&fit=crop', 
  'https://images.unsplash.com/photo-1547638375-ebf04735d792?q=80&w=800&auto=format&fit=crop', 
  'https://images.unsplash.com/photo-1555597673-b21d5c935865?q=80&w=800&auto=format&fit=crop', 
  'https://images.unsplash.com/photo-1605806616949-1e87b487cb2a?q=80&w=800&auto=format&fit=crop', 
];

export default function Login() {
  const { loginWithRedirect, isAuthenticated, isLoading } = useAuth0();
  const navigate = useNavigate();
  const [posters, setPosters] = useState<string[]>(FALLBACK_POSTERS);

  useEffect(() => {
    if (isAuthenticated) {
      navigate("/");
    }
  }, [isAuthenticated, navigate]);

  useEffect(() => {
    async function loadPosters() {
      try {
        const movies = await fetchTrending('movie');
        if (movies && movies.length > 0) {
          // Get the first 20 movie posters
          const moviePosters = movies
            .slice(0, 20)
            .map(m => getImageUrl(m.poster_path, 'poster'))
            .filter(Boolean);
          
          if (moviePosters.length > 0) {
            setPosters(moviePosters);
          }
        }
      } catch (err) {
        console.error("Failed to fetch login posters", err);
      }
    }
    loadPosters();
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#020617]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <>
      <Helmet>
        <title>Sign In - StreamVault</title>
      </Helmet>

      <div className="min-h-screen bg-[#020617] text-slate-100 flex flex-col lg:flex-row font-sans selection:bg-blue-500/30 overflow-hidden">
        
        {/* Left Section - Immersive Posters Gallery */}
        <div className="hidden lg:flex flex-1 relative bg-[#020617]">
          {/* The Grid */}
          <div className="grid grid-cols-4 xl:grid-cols-5 gap-4 w-[120%] h-[120%] absolute -top-[10%] -left-[10%] -rotate-2 transform-gpu">
            {posters.map((src, index) => (
              <div
                key={index}
                className="w-full h-full relative rounded-2xl overflow-hidden bg-[#040a1b] group shadow-2xl"
              >
                <img
                  src={src}
                  alt={`Cinematic poster ${index + 1}`}
                  className="w-full h-full object-cover opacity-80 group-hover:opacity-100 group-hover:scale-105 transition-all duration-[1.5s] ease-out hover:mix-blend-normal"
                />
                <div className="absolute inset-0 bg-blue-900/5 group-hover:bg-transparent transition-colors duration-1000 pointer-events-none mix-blend-overlay" />
              </div>
            ))}
          </div>
          
          {/* Seamless Blend Gradients */}
          <div className="absolute inset-y-0 right-0 w-1/2 bg-gradient-to-l from-[#020617] via-[#020617]/50 to-transparent z-20 pointer-events-none" />
          <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-[#020617] via-[#020617]/50 to-transparent z-20 pointer-events-none" />
          <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-[#020617] to-transparent z-20 pointer-events-none opacity-80" />
          <div className="absolute inset-y-0 left-0 w-32 bg-gradient-to-r from-[#020617] to-transparent z-20 pointer-events-none" />
          
          {/* Premium Badge - Redesigned to be a sleek glass card instead of a glowing pill */}
          <div className="absolute bottom-12 left-12 z-30">
             <div className="flex items-center gap-4 bg-[#020617]/60 border border-white/5 backdrop-blur-xl rounded-2xl px-5 py-3.5 shadow-2xl transition-colors hover:bg-[#020617]/80">
               <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center shadow-lg shadow-blue-500/20">
                 <Sparkles className="w-5 h-5 text-white" />
               </div>
               <div className="flex flex-col pr-2">
                 <span className="font-display text-sm font-bold tracking-wide text-blue-50 uppercase">Premium Select</span>
                 <span className="text-[11px] font-medium text-blue-200/60 uppercase tracking-wider">10,000+ Titles</span>
               </div>
             </div>
          </div>
        </div>

        {/* Right Section - Login Form */}
        <div className="w-full lg:w-[480px] xl:w-[560px] flex flex-col justify-center relative z-30 bg-[#020617] px-8 py-12 md:px-16 xl:px-20 overflow-y-auto">
          <div className="w-full max-w-[380px] mx-auto flex flex-col">
            
            {/* Logo */}
            <div className="flex items-center gap-3 mb-12">
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shrink-0">
                 <Film className="w-5 h-5 text-blue-500" strokeWidth={2.5} />
              </div>
              <span className="font-display text-[24px] font-bold tracking-tight text-white">
                Stream<span className="text-blue-500">Vault</span>
              </span>
            </div>

            {/* Header */}
            <h1 className="font-display text-[38px] xl:text-[44px] font-bold tracking-tight text-white mb-5 leading-[1.05]">
              Immersive<br/>entertainment.
            </h1>
            <p className="text-slate-400 text-[15px] mb-12 leading-relaxed font-light">
              Sign in to access your curated library, personalized watchlists, and ad-free streaming.
            </p>

            {/* Feature Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-10">
              {[
                { icon: Play, text: "Unlimited access to our library" },
                { icon: Heart, text: "Curated collections & watchlist" },
                { icon: Download, text: "Offline viewing available" },
                { icon: Sparkles, text: "Ad-free, 4K HDR playback" }
              ].map((feature, i) => (
                <div key={i} className="relative group p-4 rounded-2xl bg-[#060e22] border border-white/[0.03] hover:border-blue-500/30 transition-all duration-300 pointer-events-none sm:pointer-events-auto">
                  <div className="absolute inset-0 bg-blue-500/[0.02] opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl" />
                  <div className="relative z-10 flex flex-col gap-3">
                    <div className="w-8 h-8 rounded-lg bg-[#0a1430] flex items-center justify-center text-blue-500/70 group-hover:scale-110 group-hover:text-blue-400 group-hover:bg-blue-500/15 transition-all duration-300">
                      <feature.icon className="w-4 h-4" strokeWidth={2} />
                    </div>
                    <p className="text-[13.5px] text-slate-300 leading-snug font-medium">
                      {feature.text}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* Action Button */}
            <button 
              onClick={() => loginWithRedirect()}
              className="relative w-full group overflow-hidden rounded-xl bg-blue-600 outline-none hover:-translate-y-0.5 transition-transform duration-300 active:translate-y-0 shadow-[0_4px_20px_rgba(37,99,235,0.2)] hover:shadow-[0_8px_30px_rgba(37,99,235,0.3)]"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-blue-600 opacity-100 group-hover:opacity-0 transition-opacity duration-300" />
              <div className="absolute inset-0 bg-gradient-to-r from-blue-400 to-blue-500 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              
              <div className="relative flex items-center justify-center gap-2 px-6 py-[18px]">
                <span className="font-display text-[16px] font-bold text-white tracking-wide">
                  Sign In to Account
                </span>
                <ArrowRight className="w-[18px] h-[18px] text-blue-100 group-hover:translate-x-1 transition-transform duration-300" strokeWidth={2.5} />
              </div>
            </button>

            {/* Divider */}
            <div className="flex items-center gap-4 mt-10 mb-8">
              <div className="flex-1 h-[1px] bg-gradient-to-r from-transparent to-blue-900/30" />
              <span className="text-[10px] font-semibold text-blue-200/40 uppercase tracking-widest">or</span>
              <div className="flex-1 h-[1px] bg-gradient-to-l from-transparent to-blue-900/30" />
            </div>

            {/* Links */}
            <div className="text-center space-y-4">
              <p className="text-[14px] text-slate-400 font-normal">
                Don't have an account?{' '}
                <Link to="/signup" className="font-display text-blue-400 font-semibold hover:text-blue-300 transition-colors underline decoration-blue-500/30 underline-offset-4 hover:decoration-blue-400">
                  Create one now
                </Link>
              </p>
              <p className="text-[11px] text-slate-500/80 leading-relaxed max-w-[280px] mx-auto">
                By continuing, you agree to our Terms of Service and Privacy Policy.
              </p>
            </div>

          </div>
        </div>

      </div>
    </>
  );
}
