/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import Header from './components/Header';
import { Play, Info } from 'lucide-react';

export default function App() {
  return (
    <div className="min-h-screen bg-black font-sans text-white selection:bg-blue-500/30">
      <Header />
      
      <main>
        {/* Hero Section */}
        <div className="relative h-screen w-full">
          {/* Intense dark gradient overlays */}
          <div className="absolute inset-0 bg-gradient-to-r from-black via-black/60 to-transparent z-10" />
          <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent z-10" />
          
          {/* Background image */}
          <img 
            src="https://images.unsplash.com/photo-1536440136628-849c177e76a1?q=80&w=2025&auto=format&fit=crop" 
            alt="Hero Background" 
            className="absolute inset-0 w-full h-full object-cover opacity-50"
          />
          
          <div className="absolute bottom-1/4 left-6 md:left-16 z-20 max-w-3xl">
            <h1 className="text-5xl md:text-7xl font-bold tracking-tighter mb-4 drop-shadow-2xl">
              Winter is coming.
            </h1>
            <p className="text-lg md:text-xl text-gray-300 mb-8 max-w-2xl leading-relaxed drop-shadow-lg">
              Seven noble families fight for control of the mythical land of Westeros. Friction between the houses leads to full-scale war. All while a very ancient evil awakens in the farthest north.
            </p>
            <div className="flex flex-wrap gap-4">
              <button className="flex items-center gap-2 px-8 py-3.5 bg-white text-black rounded-full font-bold hover:bg-gray-200 transition-all transform hover:scale-105">
                <Play className="w-5 h-5 fill-black" />
                Play Now
              </button>
              <button className="flex items-center gap-2 px-8 py-3.5 bg-white/10 backdrop-blur-md border border-white/20 rounded-full font-bold hover:bg-white/20 transition-all transform hover:scale-105">
                <Info className="w-5 h-5" />
                More Info
              </button>
            </div>
          </div>
        </div>
        
        {/* Content padding to show scrolling effect */}
        <div className="px-6 md:px-16 pb-24 relative z-20 -mt-24">
          <h2 className="text-2xl font-semibold mb-6 flex items-center gap-2">
            <span className="w-1 h-6 bg-blue-500 rounded-full"></span>
            Trending Now
          </h2>
          <div className="flex gap-4 overflow-x-auto pb-8 scrollbar-hide">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <div 
                key={i} 
                className="min-w-[200px] md:min-w-[240px] aspect-[2/3] bg-zinc-900 rounded-xl border border-white/5 hover:border-white/20 transition-all cursor-pointer hover:scale-105 hover:shadow-2xl hover:shadow-blue-500/10" 
              />
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
