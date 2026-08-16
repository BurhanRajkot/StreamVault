import * as React from "react";

/**
 * Mirrors Tailwind's `md` breakpoint (min-width: 768px). The .98 matters:
 * a plain `max-width: 767px` leaves the fractional range [767, 768) matching
 * neither rule, so at some zoom levels and device pixel ratios the JS layout
 * and the CSS one disagree about which UI is showing.
 */
const query = "(max-width: 767.98px)";

/**
 * True below the `md` breakpoint.
 *
 * Resolved synchronously on the first render rather than in an effect: callers
 * use it to pick between whole layouts, and a first paint that always claims
 * "desktop" makes every phone load flash the wrong one before correcting.
 */
export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState(() =>
    typeof window === "undefined" ? false : window.matchMedia(query).matches
  );

  React.useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);

    // Re-sync in case the viewport changed between render and effect
    setIsMobile(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return isMobile;
}
