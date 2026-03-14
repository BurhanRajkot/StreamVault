import { useState, useEffect, useRef } from 'react';
import { Clapperboard, Search, Crown, Heart, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

const NAV_ITEMS = ['Home', 'Movies', 'TV Shows', 'Docs', 'Downloads'];

export default function Header() {
  const [activeTab, setActiveTab] = useState('Home');
  const [isScrolled, setIsScrolled] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  // Add a subtle background blur when scrolling down
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Close search when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsSearchOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header 
      className={`fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 md:px-12 transition-all duration-500 ${
        isScrolled 
          ? 'py-2.5 bg-black/60 backdrop-blur-2xl border-b border-white/10 shadow-2xl' 
          : 'py-5 bg-gradient-to-b from-black/80 to-transparent border-b border-transparent'
      }`}
    >
      {/* Logo */}
      <motion.div 
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        className="flex items-center gap-2 cursor-pointer group"
      >
        <Clapperboard className="w-6 h-6 text-blue-500" strokeWidth={2.5} />
        <span className="text-2xl font-bold tracking-tight text-white">
          Stream<span className="text-blue-500">Vault</span>
        </span>
      </motion.div>

      {/* Navigation with Animations */}
      <nav className="hidden md:flex items-center gap-1">
        {NAV_ITEMS.map((item) => (
          <button
            key={item}
            onClick={() => setActiveTab(item)}
            className={`relative px-5 py-2 text-sm font-medium transition-colors duration-300 ${
              activeTab === item ? 'text-white' : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            {activeTab === item && (
              <motion.div
                layoutId="active-nav-pill"
                className="absolute inset-0 bg-white/10 rounded-full"
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              />
            )}
            <span className="relative z-10">{item}</span>
          </button>
        ))}
      </nav>

      {/* Actions */}
      <div className="flex items-center gap-4 md:gap-6">
        
        {/* Animated Search Bar */}
        <div ref={searchRef} className="relative flex items-center">
          <motion.div
            initial={false}
            animate={{ 
              width: isSearchOpen ? 240 : 40,
              backgroundColor: isSearchOpen ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0)',
              borderColor: isSearchOpen ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0)'
            }}
            className="flex items-center rounded-full border overflow-hidden transition-colors"
          >
            <AnimatePresence>
              {isSearchOpen && (
                <motion.input
                  initial={{ opacity: 0, paddingLeft: 0 }}
                  animate={{ opacity: 1, paddingLeft: 16 }}
                  exit={{ opacity: 0, paddingLeft: 0 }}
                  transition={{ duration: 0.2 }}
                  type="text"
                  placeholder="Search titles..."
                  className="w-full bg-transparent text-sm text-white placeholder-gray-400 focus:outline-none py-2"
                  autoFocus
                />
              )}
            </AnimatePresence>
            <motion.button 
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => setIsSearchOpen(!isSearchOpen)}
              className={`p-2.5 flex-shrink-0 transition-colors ${isSearchOpen ? 'text-white' : 'text-gray-400 hover:text-white'}`}
            >
              {isSearchOpen ? <X className="w-5 h-5" /> : <Search className="w-5 h-5" />}
            </motion.button>
          </motion.div>
        </div>
        
        <motion.button 
          whileHover={{ scale: 1.1, rotate: -5 }}
          whileTap={{ scale: 0.9 }}
          className="text-gray-400 hover:text-pink-500 transition-colors"
        >
          <Heart className="w-5 h-5" />
        </motion.button>

        {/* Glassy Golden Upgrade Button */}
        <motion.button 
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="hidden sm:flex items-center gap-2 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 hover:border-amber-400/60 backdrop-blur-md px-5 py-2.5 rounded-full text-xs font-bold tracking-wider text-amber-400 transition-all"
        >
          <Crown className="w-4 h-4" />
          UPGRADE
        </motion.button>

        <motion.div 
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          className="w-9 h-9 rounded-full bg-zinc-800 flex items-center justify-center text-white font-bold text-sm cursor-pointer border border-white/10 hover:border-blue-500 transition-colors"
        >
          B
        </motion.div>
      </div>
    </header>
  );
}
