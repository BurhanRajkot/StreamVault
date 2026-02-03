import { useTheme } from "next-themes";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { Sun, Moon, Cloud } from "lucide-react";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  const isDark = theme === "dark";

  const toggleTheme = (e: React.MouseEvent<HTMLButtonElement>) => {
    const x = e.clientX;
    const y = e.clientY;
    const endRadius = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y)
    );

    // @ts-ignore: Transition API
    if (!document.startViewTransition) {
      setTheme(isDark ? "light" : "dark");
      return;
    }

    // @ts-ignore: Transition API
    const transition = document.startViewTransition(() => {
      setTheme(isDark ? "light" : "dark");
    });

    transition.ready.then(() => {
      const clipPath = [
        `circle(0px at ${x}px ${y}px)`,
        `circle(${endRadius}px at ${x}px ${y}px)`,
      ];
      document.documentElement.animate(
        {
          clipPath: isDark ? [...clipPath].reverse() : clipPath,
        },
        {
          duration: 400,
          easing: "cubic-bezier(0.4, 0.0, 0.2, 1)",
          pseudoElement: isDark
            ? "::view-transition-old(root)"
            : "::view-transition-new(root)",
        }
      );
    });
  };

  return (
    <div className="flex items-center justify-center">
      <motion.button
        onClick={toggleTheme}
        className={`relative w-20 h-10 rounded-full p-1 shadow-inner transition-colors duration-200 overflow-hidden ${
          isDark ? "bg-[#0f172a] shadow-black/50" : "bg-[#87CEEB] shadow-blue-400/30"
        }`}
        whileTap={{ scale: 0.95 }}
        style={{
          boxShadow: isDark
            ? "inset 0px 4px 8px rgba(0,0,0,0.6), 0px 2px 4px rgba(255,255,255,0.05)"
            : "inset 0px 4px 8px rgba(0,0,0,0.1), 0px 2px 4px rgba(255,255,255,0.5)",
        }}
      >
        {/* Background Stars (Dark Mode) */}
        {isDark && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 z-0"
          >
           {[...Array(6)].map((_, i) => (
              <div
                key={i}
                className="absolute bg-white rounded-full"
                style={{
                  width: Math.random() * 2 + 1 + "px",
                  height: Math.random() * 2 + 1 + "px",
                  top: Math.random() * 80 + 10 + "%",
                  left: Math.random() * 50 + 40 + "%",
                  opacity: Math.random() * 0.5 + 0.3,
                }}
              />
            ))}
          </motion.div>
        )}

        {/* Background Clouds (Light Mode) */}
        {!isDark && (
            <motion.div
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.2 }}
                className="absolute inset-0 z-0 pointer-events-none"
            >
                <Cloud className="absolute text-white/50 w-4 h-4 top-2 right-6" />
                <Cloud className="absolute text-white/40 w-3 h-3 bottom-1 right-2" />
                <Cloud className="absolute text-white/60 w-5 h-5 top-1 right-12" />
            </motion.div>
        )}

        {/* The Toggle Knob */}
        <motion.div
           initial={false}
           animate={{ left: isDark ? "44px" : "4px" }}
           transition={{
            type: "tween",
            duration: 0.4,
            ease: [0.4, 0.0, 0.2, 1],
          }}
          className={`absolute top-1 z-10 w-8 h-8 rounded-full shadow-md flex items-center justify-center ${
            isDark
              ? "bg-slate-300 bg-gradient-to-br from-slate-200 to-slate-400"
              : "bg-yellow-400 bg-gradient-to-br from-yellow-300 to-yellow-500"
          }`}
          style={{
             boxShadow: isDark
                ? "2px 2px 6px rgba(0,0,0,0.4), inset -2px -2px 4px rgba(0,0,0,0.2), inset 2px 2px 4px rgba(255, 255, 255, 0.8)"
                : "2px 2px 6px rgba(0,0,0,0.2), inset -2px -2px 4px rgba(0,0,0,0.1), inset 2px 2px 4px rgba(255, 255, 255, 0.6)"
          }}
        >
          {/* Icon inside the knob */}
          <motion.div
             initial={false}
             animate={{ rotate: isDark ? 360 : 0 }}
             transition={{ duration: 0.4, ease: [0.4, 0.0, 0.2, 1] }}
          >
              {isDark ? (
                <div className="relative w-full h-full">
                   {/* Craters for Moon */}
                   <div className="absolute top-2 left-2 w-2 h-2 rounded-full bg-slate-400/50 shadow-inner" />
                   <div className="absolute bottom-2 right-3 w-1.5 h-1.5 rounded-full bg-slate-400/50 shadow-inner" />
                   <div className="absolute top-4 right-1.5 w-1 h-1 rounded-full bg-slate-400/50 shadow-inner" />
                </div>
              ) : (
                <Sun className="w-5 h-5 text-yellow-100 fill-yellow-100 drop-shadow-sm" />
              )}
          </motion.div>
        </motion.div>

        {/* Glow/Glare overlay for 3D glass effect on container */}
        <div className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/10 to-transparent rounded-t-full pointer-events-none" />
      </motion.button>
    </div>
  );
}
