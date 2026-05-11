import { useEffect } from 'react';
import { Film, Github, ArrowRight, Shield, Server, Sparkles } from 'lucide-react';
import { useAuth0 } from "@auth0/auth0-react";
import { useNavigate, Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";

// Real TMDB movie posters split across 3 columns — hardcoded, zero flicker
const COL1 = [
  "https://image.tmdb.org/t/p/w500/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg", // Interstellar
  "https://image.tmdb.org/t/p/w500/7WsyChQLEftFiDOVTGkv3hFpyyt.jpg", // Inception
  "https://image.tmdb.org/t/p/w500/lyQBXAFkuhiCO6IeiDfh3Y0hlsT.jpg", // Shawshank
  "https://image.tmdb.org/t/p/w500/hA2ple9q4qnwxp3hKVNhroipsir.jpg", // Mad Max
  "https://image.tmdb.org/t/p/w500/x2FJsf1ElAgr63Y3PNPtJrcmpoe.jpg", // Arrival
  "https://image.tmdb.org/t/p/w500/eWdyYQreja6JivjKpE7PDFqCfTh.jpg", // Grand Budapest
];

const COL2 = [
  "https://image.tmdb.org/t/p/w500/udDclJoHjfjb8Ekgsd4FDteOkCU.jpg", // Joker
  "https://image.tmdb.org/t/p/w500/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg", // Fight Club
  "https://image.tmdb.org/t/p/w500/or06FN3Dka5tukK1e9sl16pB3iy.jpg", // Avengers
  "https://image.tmdb.org/t/p/w500/uDO8zWDhfWwoFdKS4fzkUJt0Rf0.jpg", // La La Land
  "https://image.tmdb.org/t/p/w500/iZf0KyrE25z1sage4SYQLAjPole.jpg", // 1917
  "https://image.tmdb.org/t/p/w500/3nSJBFCuLmPIg5dRkzU9jEFbFEd.jpg", // The Lighthouse
];

const COL3 = [
  "https://image.tmdb.org/t/p/w500/d5NXSklXo0qyIYkgV94XAgMIckC.jpg", // Dune
  "https://image.tmdb.org/t/p/w500/qJ2tW6WMUDux911r6m7haRef0WH.jpg", // The Dark Knight
  "https://image.tmdb.org/t/p/w500/7IiTTgloJzvGI1TAYymCfbfl3vT.jpg", // Parasite
  "https://image.tmdb.org/t/p/w500/gajva2L0rPYkEWjzgFlBXCAVBE5.jpg", // Blade Runner 2049
  "https://image.tmdb.org/t/p/w500/pThyQovXQrw2m0s9x82twj48Jq4.jpg", // Knives Out
  "https://image.tmdb.org/t/p/w500/7fn624j5lj3xTme2SgiLCeuedmO.jpg", // Whiplash
];

// Repeat each column so the infinite loop is seamless
const repeatPosters = (arr: string[]) => [...arr, ...arr, ...arr, ...arr];

export default function Signup() {
  const { loginWithRedirect, isAuthenticated, isLoading } = useAuth0();
  const navigate = useNavigate();

  useEffect(() => {
    if (isAuthenticated) navigate("/");
  }, [isAuthenticated, navigate]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#020617]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  const col1 = repeatPosters(COL1);
  const col2 = repeatPosters(COL2);
  const col3 = repeatPosters(COL3);

  return (
    <>
      <Helmet>
        <title>Sign Up – StreamVault</title>
      </Helmet>

      <div className="h-screen w-full flex bg-[#020617] text-white font-sans overflow-hidden selection:bg-blue-500/30">

        {/* ── LEFT: Infinite Scrolling Poster Columns ─────────────── */}
        <div className="hidden lg:block w-[55%] xl:w-[60%] relative overflow-hidden bg-[#020617]">

          {/* Edge fades */}
          <div className="absolute inset-y-0 right-0  w-56 bg-gradient-to-l from-[#020617] to-transparent z-20 pointer-events-none" />
          <div className="absolute inset-y-0 left-0   w-20 bg-gradient-to-r from-[#020617] to-transparent z-20 pointer-events-none" />
          <div className="absolute inset-x-0 top-0    h-40 bg-gradient-to-b from-[#020617] to-transparent z-20 pointer-events-none" />
          <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-[#020617] to-transparent z-20 pointer-events-none" />

          {/* Subtle blue tint */}
          <div className="absolute inset-0 bg-blue-900/10 z-10 pointer-events-none mix-blend-overlay" />

          {/* 3-column scrolling grid — slightly rotated for drama */}
          <div className="absolute inset-0 flex gap-4 px-4 py-2" style={{ transform: 'rotate(-4deg) scale(1.1)', transformOrigin: 'center center' }}>

            {/* Column 1 — scrolls UP */}
            <div className="flex-1 flex flex-col gap-4 signup-scroll-up">
              {col1.map((src, i) => (
                <div key={i} className="flex-shrink-0 w-full aspect-[2/3] rounded-xl overflow-hidden border border-white/[0.06] shadow-[0_4px_24px_rgba(0,0,0,0.7)]">
                  <img src={src} alt="" className="w-full h-full object-cover" loading="eager" />
                </div>
              ))}
            </div>

            {/* Column 2 — scrolls DOWN (offset start) */}
            <div className="flex-1 flex flex-col gap-4 signup-scroll-down" style={{ marginTop: '-30%' }}>
              {col2.map((src, i) => (
                <div key={i} className="flex-shrink-0 w-full aspect-[2/3] rounded-xl overflow-hidden border border-white/[0.06] shadow-[0_4px_24px_rgba(0,0,0,0.7)]">
                  <img src={src} alt="" className="w-full h-full object-cover" loading="eager" />
                </div>
              ))}
            </div>

            {/* Column 3 — scrolls UP (offset start) */}
            <div className="flex-1 flex flex-col gap-4 signup-scroll-up" style={{ marginTop: '-15%' }}>
              {col3.map((src, i) => (
                <div key={i} className="flex-shrink-0 w-full aspect-[2/3] rounded-xl overflow-hidden border border-white/[0.06] shadow-[0_4px_24px_rgba(0,0,0,0.7)]">
                  <img src={src} alt="" className="w-full h-full object-cover" loading="eager" />
                </div>
              ))}
            </div>

          </div>

          {/* Overlaid text on left side */}
          <div className="absolute inset-0 z-30 flex flex-col justify-end p-12 lg:p-16 pb-20">
            <div className="max-w-md space-y-4">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/50 border border-white/10 backdrop-blur-md text-xs font-bold uppercase tracking-widest text-blue-400">
                <Github className="w-3.5 h-3.5" />
                Open Source. Free Forever.
              </div>
              <h2 className="text-5xl xl:text-[56px] font-bold text-white leading-[1.05] tracking-tight drop-shadow-[0_4px_8px_rgba(0,0,0,0.9)]">
                Your ultimate <br />
                <span className="text-blue-500">streaming library.</span>
              </h2>
              <p className="text-zinc-300 text-base xl:text-lg leading-relaxed drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
                Self-host your favourite movies and TV shows. No ads, no tracking, just pure cinematic entertainment.
              </p>
            </div>
          </div>
        </div>

        {/* ── RIGHT: Signup Form ──────────────────────────────────── */}
        <div className="w-full lg:w-[45%] xl:w-[40%] flex flex-col justify-center px-8 sm:px-14 xl:px-20 relative z-40 bg-[#020617] border-l border-white/[0.04]">

          {/* Ambient glow blobs */}
          <div className="absolute top-0 right-0 w-96 h-96 bg-blue-600/10 blur-[130px] translate-x-1/3 -translate-y-1/3 rounded-full pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-80 h-80 bg-indigo-600/10 blur-[120px] -translate-x-1/4 translate-y-1/4 rounded-full pointer-events-none" />

          <div className="max-w-md w-full mx-auto relative z-10">

            {/* Logo */}
            <div className="flex items-center gap-3 mb-14">
              <div className="bg-blue-500/10 border border-blue-500/20 p-2.5 rounded-xl">
                <Film className="w-6 h-6 text-blue-500" />
              </div>
              <span className="text-2xl font-bold tracking-tight">
                Stream<span className="text-blue-500">Vault</span>
              </span>
            </div>

            {/* Heading */}
            <div className="mb-10">
              <h1 className="text-4xl xl:text-5xl font-bold mb-4 tracking-tight leading-[1.1]">
                Unlock Your <br />
                Cinematic Vault.
              </h1>
              <p className="text-zinc-400 text-base leading-relaxed">
                Join the definitive open-source streaming revolution. Access your curated collections seamlessly and securely.
              </p>
            </div>

            {/* CTA */}
            <button
              onClick={() => loginWithRedirect({ authorizationParams: { screen_hint: "signup" } })}
              className="group w-full bg-white text-black py-4 px-6 rounded-2xl font-bold text-[15px] transition-all duration-200 active:scale-[0.98] flex items-center justify-center gap-3 hover:bg-blue-50 shadow-[0_0_30px_rgba(255,255,255,0.12)] hover:shadow-[0_0_40px_rgba(255,255,255,0.22)] border border-white/20 mb-10"
            >
              Create an Account
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1.5 transition-transform duration-200" />
            </button>

            {/* Value props */}
            <div className="space-y-4 border-t border-white/[0.06] pt-8 mb-10">
              {[
                { icon: Shield,   label: "Secure Authentication", sub: "Powered safely by Auth0"        },
                { icon: Server,   label: "Self-Hosted Ecosystem",  sub: "Absolute privacy & control"    },
                { icon: Sparkles, label: "Next-Gen Streaming",     sub: "4K HDR, gapless experience"    },
              ].map(({ icon: Icon, label, sub }, i) => (
                <div key={i} className="flex items-center gap-4 group">
                  <div className="shrink-0 bg-[#0a0f1e] p-2.5 rounded-xl border border-white/[0.05] group-hover:border-blue-500/30 group-hover:bg-blue-500/10 transition-all duration-300">
                    <Icon className="w-5 h-5 text-blue-400" />
                  </div>
                  <div>
                    <span className="block text-sm font-semibold text-zinc-200">{label}</span>
                    <span className="block text-xs text-zinc-500">{sub}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Sign in link */}
            <div className="text-center space-y-2">
              <p className="text-[14px] text-slate-400">
                Already have an account?{' '}
                <Link to="/login" className="text-blue-400 font-semibold hover:text-blue-300 transition-colors underline underline-offset-4 decoration-blue-500/40">
                  Sign in
                </Link>
              </p>
              <p className="text-[11px] text-slate-600 max-w-[260px] mx-auto leading-relaxed">
                By continuing, you agree to our Terms of Service and Privacy Policy.
              </p>
            </div>

          </div>
        </div>
      </div>

      {/* Signup-specific infinite scroll animations */}
      <style>{`
        @keyframes signup-up {
          from { transform: translateY(0); }
          to   { transform: translateY(-50%); }
        }
        @keyframes signup-down {
          from { transform: translateY(-50%); }
          to   { transform: translateY(0); }
        }
        .signup-scroll-up {
          animation: signup-up 30s linear infinite;
        }
        .signup-scroll-down {
          animation: signup-down 36s linear infinite;
        }
      `}</style>
    </>
  );
}
