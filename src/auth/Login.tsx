import { useAuth0 } from "@auth0/auth0-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Sparkles, Play, Heart, Download, Film, ArrowRight } from 'lucide-react';

// Verified-working TMDB poster paths only
const MOVIE_POSTERS = [
  "https://image.tmdb.org/t/p/w154/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg", // Interstellar
  "https://image.tmdb.org/t/p/w154/udDclJoHjfjb8Ekgsd4FDteOkCU.jpg", // Joker
  "https://image.tmdb.org/t/p/w154/d5NXSklXo0qyIYkgV94XAgMIckC.jpg", // Dune
  "https://image.tmdb.org/t/p/w154/qJ2tW6WMUDux911r6m7haRef0WH.jpg", // The Dark Knight
  "https://image.tmdb.org/t/p/w154/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg", // Fight Club
  "https://image.tmdb.org/t/p/w154/7WsyChQLEftFiDOVTGkv3hFpyyt.jpg", // Inception
  "https://image.tmdb.org/t/p/w154/7IiTTgloJzvGI1TAYymCfbfl3vT.jpg", // Parasite
  "https://image.tmdb.org/t/p/w154/or06FN3Dka5tukK1e9sl16pB3iy.jpg", // Avengers Endgame
  "https://image.tmdb.org/t/p/w154/gajva2L0rPYkEWjzgFlBXCAVBE5.jpg", // Blade Runner 2049
  "https://image.tmdb.org/t/p/w154/hA2ple9q4qnwxp3hKVNhroipsir.jpg", // Mad Max
  "https://image.tmdb.org/t/p/w154/x2FJsf1ElAgr63Y3PNPtJrcmpoe.jpg", // Arrival
  "https://image.tmdb.org/t/p/w154/uDO8zWDhfWwoFdKS4fzkUJt0Rf0.jpg", // La La Land
  "https://image.tmdb.org/t/p/w154/eWdyYQreja6JivjKpE7PDFqCfTh.jpg", // Grand Budapest Hotel
  "https://image.tmdb.org/t/p/w154/iZf0KyrE25z1sage4SYQLAjPole.jpg", // 1917
  "https://image.tmdb.org/t/p/w154/pThyQovXQrw2m0s9x82twj48Jq4.jpg", // Knives Out
  "https://image.tmdb.org/t/p/w154/k68nPLbIST6NP96JmTxmZijZchr.jpg", // Tenet
  "https://image.tmdb.org/t/p/w154/lyQBXAFkuhiCO6IeiDfh3Y0hlsT.jpg", // Shawshank
  "https://image.tmdb.org/t/p/w154/7fn624j5lj3xTme2SgiLCeuedmO.jpg", // Whiplash
  "https://image.tmdb.org/t/p/w154/3nSJBFCuLmPIg5dRkzU9jEFbFEd.jpg", // The Lighthouse
  "https://image.tmdb.org/t/p/w154/4dzUP7RtI5yxhJjXQJsGNGPHj9l.jpg", // Hereditary
  "https://image.tmdb.org/t/p/w154/f89U3ADr1oiB1s9GkdPOEpXUk5H.jpg", // The Matrix
  "https://image.tmdb.org/t/p/w154/oF80kEMK2zS4PoywGvWnLz18dZc.jpg", // Goodfellas
  "https://image.tmdb.org/t/p/w154/bI37vIHcs7A1k0Wn2s3iB374q8V.jpg", // Pulp Fiction
  "https://image.tmdb.org/t/p/w154/rSPw7tgCH9c6NqICZef4kZjFOQ5.jpg", // The Godfather
  "https://image.tmdb.org/t/p/w154/ry2S0Wn09YkYy92gY9Z01I6G5Zf.jpg", // Spirited Away
  "https://image.tmdb.org/t/p/w154/c24sv2weTHPsmDa7jEMN0m2P3RT.jpg", // Into the Spider-Verse
  "https://image.tmdb.org/t/p/w154/5VTN0YW7iPqAENWpED2pG0B25Qo.jpg", // Star Wars
  "https://image.tmdb.org/t/p/w154/q719jXXEzOoYaps6babgKnONONX.jpg", // Your Name
  "https://image.tmdb.org/t/p/w154/78lPtwv72eTNqFW9COBYI0dWDJa.jpg", // Iron Man
  "https://image.tmdb.org/t/p/w154/1hRoyzDtpgMU7Dz4PF22siCEVgc.jpg", // The Truman Show
  "https://image.tmdb.org/t/p/w154/saHP97rTPS5eLmrLQEcANmKrsFl.jpg", // Forrest Gump
  "https://image.tmdb.org/t/p/w154/sF1U4EUQS8YHUYjNl3pMGNIQyr0.jpg", // Schindler's List
  "https://image.tmdb.org/t/p/w154/rCzpDGLbOoPwLjy3OAm5NUPOTrC.jpg", // Lord of the Rings
  "https://image.tmdb.org/t/p/w154/aAmfIX3TT40zUHGcCKrlOZRKC7u.jpg", // Inside Out
  "https://image.tmdb.org/t/p/w154/w7RDIgQM6bLT7JXtH4iUQd3Iwxm.jpg", // Seven
  "https://image.tmdb.org/t/p/w154/5M0j0B18abuTqsCGcTtdq77ZA6I.jpg", // Silence of the Lambs
  "https://image.tmdb.org/t/p/w154/2TeCGhnnD0BvEDnF0H9QoX7yYnA.jpg", // Up
  "https://image.tmdb.org/t/p/w154/eKi8dIrr8waobnENzQEqgMeb8qH.jpg", // The Incredibles
  "https://image.tmdb.org/t/p/w154/c54NpAWpzjcjm02fbH7zJv8w70h.jpg", // Wall-E
  "https://image.tmdb.org/t/p/w154/vqzNJRH4YyquRiWxCCOH0aXggHI.jpg", // Terminator 2
];

const FEATURES = [
  { icon: Play,     text: "Unlimited access to our library" },
  { icon: Heart,    text: "Curated collections & watchlist" },
  { icon: Download, text: "Offline viewing available"       },
  { icon: Sparkles, text: "Ad-free, 4K HDR playback"       },
];

const NUM_COLS = 5;

// Distribute posters round-robin across columns, then triple for seamless loop.
// We animate translateY(0 → -33.333%) so one full "original" set scrolls away
// and lands back exactly where it started — zero jump, zero flicker.
function buildColumns(posters: string[], count: number): string[][] {
  const cols: string[][] = Array.from({ length: count }, () => []);
  posters.forEach((p, i) => cols[i % count].push(p));
  return cols.map(col => [...col, ...col, ...col]);
}

const COLUMNS = buildColumns(MOVIE_POSTERS, NUM_COLS);

// Slow, cinematic speeds. Fast = cheap. 120–160s feels like a luxury product.
const COLUMN_CONFIG = [
  { direction: 'up',   duration: 120 },
  { direction: 'down', duration: 150 },
  { direction: 'up',   duration: 130 },
  { direction: 'down', duration: 160 },
  { direction: 'up',   duration: 140 },
] as const;

// Vertical offsets so columns don't all start at the same position
const COLUMN_OFFSETS = ['-8%', '-20%', '-4%', '-28%', '-14%'];

const KEYFRAMES = `
  @keyframes sv-scrollUp {
    from { transform: translateY(0); }
    to   { transform: translateY(-33.333%); }
  }
  @keyframes sv-scrollDown {
    from { transform: translateY(-33.333%); }
    to   { transform: translateY(0); }
  }
`;

if (typeof document !== 'undefined' && !document.getElementById('sv-poster-kf')) {
  const style = document.createElement('style');
  style.id = 'sv-poster-kf';
  style.textContent = KEYFRAMES;
  document.head.appendChild(style);
}

export default function Login() {
  const { loginWithRedirect, isAuthenticated, isLoading } = useAuth0();
  const navigate = useNavigate();
  const wallRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isAuthenticated) navigate("/");
  }, [isAuthenticated, navigate]);

  // Pause all columns on hover — cinematic freeze
  const handleWallEnter = () => {
    wallRef.current?.querySelectorAll<HTMLDivElement>('.sv-col').forEach(el => {
      el.style.animationPlayState = 'paused';
    });
  };
  const handleWallLeave = () => {
    wallRef.current?.querySelectorAll<HTMLDivElement>('.sv-col').forEach(el => {
      el.style.animationPlayState = 'running';
    });
  };

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
        <title>Sign In – StreamVault</title>
      </Helmet>

      <div className="min-h-screen bg-[#020617] text-slate-100 flex flex-col lg:flex-row font-sans selection:bg-blue-500/30 overflow-hidden">

        {/* ── LEFT: Scrolling Poster Wall ─────────────────────────── */}
        <div
          ref={wallRef}
          className="hidden lg:block flex-1 relative overflow-hidden bg-[#020617]"
          onMouseEnter={handleWallEnter}
          onMouseLeave={handleWallLeave}
        >
          <div
            style={{
              position: 'absolute',
              top: '-10%',
              left: '-5%',
              right: '-5%',
              bottom: '-10%',
              transform: 'rotate(-8deg)',
              transformOrigin: 'center center',
              display: 'flex',
              gap: '10px',
              alignItems: 'flex-start',
            }}
          >
            {COLUMNS.map((posters, colIdx) => {
              const { direction, duration } = COLUMN_CONFIG[colIdx];
              return (
                <div
                  key={colIdx}
                  className="sv-col"
                  style={{
                    flex: '1',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                    marginTop: COLUMN_OFFSETS[colIdx],
                    willChange: 'transform',
                    animation: `sv-scroll${direction === 'up' ? 'Up' : 'Down'} ${duration}s linear infinite`,
                  }}
                >
                  {posters.map((src, i) => (
                    <PosterCard key={`${colIdx}-${i}`} src={src} />
                  ))}
                </div>
              );
            })}
          </div>

          {/* Edge fades */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: 'linear-gradient(to right, #020617 0%, transparent 14%, transparent 50%, rgba(2,6,23,0.7) 72%, #020617 100%)',
              zIndex: 11,
            }}
          />
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: 'linear-gradient(to bottom, #020617 0%, transparent 14%, transparent 84%, #020617 100%)',
              zIndex: 12,
            }}
          />
          <div className="absolute inset-0 bg-[#020617]/25 z-10 pointer-events-none" />

          {/* Premium badge */}
          <div className="absolute bottom-10 left-10 z-20">
            <div className="flex items-center gap-3 bg-white/[0.06] border border-white/10 backdrop-blur-xl rounded-2xl px-5 py-3 shadow-2xl">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center shadow-lg shadow-blue-500/30">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-white">Premium Select</p>
                <p className="text-[11px] text-blue-300/60 font-medium uppercase tracking-wider">10,000+ Titles</p>
              </div>
            </div>
          </div>
        </div>

        {/* ── RIGHT: Login Form ───────────────────────────────────── */}
        <div className="w-full lg:w-[460px] xl:w-[520px] flex flex-col justify-center relative z-30 bg-[#020617] px-8 py-12 md:px-14">
          <div className="w-full max-w-[370px] mx-auto flex flex-col">

            {/* Logo */}
            <div className="flex items-center gap-3 mb-12">
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                <Film className="w-5 h-5 text-blue-500" strokeWidth={2.5} />
              </div>
              <span className="text-[24px] font-bold tracking-tight text-white">
                Stream<span className="text-blue-500">Vault</span>
              </span>
            </div>

            {/* Headline */}
            <h1 className="text-[36px] xl:text-[42px] font-bold tracking-tight text-white mb-4 leading-[1.05]">
              Immersive<br />entertainment.
            </h1>
            <p className="text-slate-400 text-[15px] mb-10 leading-relaxed">
              Sign in to access your curated library, personalised watchlists, and ad-free streaming.
            </p>

            {/* Feature grid */}
            <div className="grid grid-cols-2 gap-3 mb-10">
              {FEATURES.map(({ icon: Icon, text }, i) => (
                <div
                  key={i}
                  className="group p-4 rounded-2xl bg-[#060e22] border border-white/[0.04] hover:border-blue-500/30 transition-all duration-300 cursor-default"
                >
                  <div className="w-8 h-8 rounded-lg bg-[#0a1430] flex items-center justify-center text-blue-500/60 group-hover:text-blue-400 group-hover:bg-blue-500/15 group-hover:scale-110 transition-all duration-300 mb-3">
                    <Icon className="w-4 h-4" strokeWidth={2} />
                  </div>
                  <p className="text-[13px] text-slate-300 leading-snug font-medium">{text}</p>
                </div>
              ))}
            </div>

            {/* Sign-in button */}
            <button
              onClick={() => loginWithRedirect()}
              className="group relative w-full overflow-hidden rounded-xl bg-blue-600 hover:-translate-y-0.5 active:translate-y-0 transition-transform duration-200 shadow-[0_4px_24px_rgba(37,99,235,0.3)] hover:shadow-[0_8px_40px_rgba(37,99,235,0.45)]"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-blue-600 group-hover:opacity-0 transition-opacity duration-300" />
              <div className="absolute inset-0 bg-gradient-to-r from-blue-400 to-blue-500 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              <div className="relative flex items-center justify-center gap-2 px-6 py-[17px]">
                <span className="text-[15px] font-bold text-white tracking-wide">Sign In to Account</span>
                <ArrowRight className="w-4 h-4 text-blue-100 group-hover:translate-x-1 transition-transform duration-300" strokeWidth={2.5} />
              </div>
            </button>

            {/* Divider */}
            <div className="flex items-center gap-4 mt-8 mb-6">
              <div className="flex-1 h-px bg-gradient-to-r from-transparent to-blue-900/40" />
              <span className="text-[10px] font-semibold text-slate-600 uppercase tracking-widest">or</span>
              <div className="flex-1 h-px bg-gradient-to-l from-transparent to-blue-900/40" />
            </div>

            {/* Link to signup */}
            <div className="text-center space-y-3">
              <p className="text-[14px] text-slate-400">
                Don't have an account?{' '}
                <Link to="/signup" className="text-blue-400 font-semibold hover:text-blue-300 transition-colors underline underline-offset-4 decoration-blue-500/40">
                  Create one now
                </Link>
              </p>
              <p className="text-[11px] text-slate-600 max-w-[260px] mx-auto leading-relaxed">
                By continuing, you agree to our Terms of Service and Privacy Policy.
              </p>
            </div>

          </div>
        </div>

      </div>
    </>
  );
}

// ── Poster card ──────────────────────────────────────────────────────────────
// Isolated so poster hover doesn't re-render the whole wall.
// onError hides the card entirely — no broken icons, no grey boxes.
function PosterCard({ src }: { src: string }) {
  const [hidden, setHidden] = useState(false);

  if (hidden) return null;

  return (
    <div
      style={{
        aspectRatio: '2/3',
        borderRadius: '10px',
        overflow: 'hidden',
        background: '#040c1f',
        border: '1px solid rgba(255,255,255,0.05)',
        boxShadow: '0 4px 20px rgba(0,0,0,0.55)',
        flexShrink: 0,
        transition: 'transform 0.45s cubic-bezier(.22,1,.36,1), box-shadow 0.45s ease, filter 0.45s ease',
        cursor: 'default',
        position: 'relative',
      }}
      onMouseEnter={e => {
        const el = e.currentTarget as HTMLDivElement;
        el.style.transform = 'scale(1.07)';
        el.style.boxShadow = '0 16px 48px rgba(0,0,0,0.85), 0 0 0 2px rgba(96,165,250,0.45)';
        el.style.filter = 'brightness(1.2)';
        el.style.zIndex = '20';
      }}
      onMouseLeave={e => {
        const el = e.currentTarget as HTMLDivElement;
        el.style.transform = '';
        el.style.boxShadow = '0 4px 20px rgba(0,0,0,0.55)';
        el.style.filter = '';
        el.style.zIndex = '';
      }}
    >
      <img
        src={src}
        alt=""
        loading="eager"
        decoding="async"
        onError={() => setHidden(true)}
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
      />
    </div>
  );
}
