import { useRef, useEffect, useState } from 'react';
import './GooeyNav.css';

// The particle/animation props (animationTime, particleCount, particleDistances,
// particleR, timeVariance, colors) were declared and destructured but never read
// by the component — dead API surface, now removed.
interface GooeyNavProps {
  items: { label: string; onClick?: () => void }[];
  initialActiveIndex?: number;
}

const GooeyNav = ({
  items,
  initialActiveIndex = 0
}: GooeyNavProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLUListElement>(null);
  const [activeIndex, setActiveIndex] = useState(initialActiveIndex);



  const handleClick = (e: React.MouseEvent<HTMLButtonElement>, index: number) => {
    const liEl = e.currentTarget.parentElement;
    if (!liEl) return;
    if (activeIndex === index) return;

    setActiveIndex(index);

    // Call external handler
    items[index].onClick?.();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (activeIndex === index) return;
      setActiveIndex(index);
      items[index].onClick?.();
    }
  };

  // Removed empty useEffect for activeIndex  // Sync internal state if initialActiveIndex changes
  useEffect(() => {
      setActiveIndex(prev => prev === initialActiveIndex ? prev : initialActiveIndex);
  }, [initialActiveIndex]);

  return (
    <div className="gooey-nav-container" ref={containerRef}>
      <nav>
        <ul ref={navRef}>
          {items.map((item, index) => (
            <li key={index} className={activeIndex === index ? 'active' : ''}>
              <button
                type="button"
                aria-pressed={activeIndex === index}
                onClick={e => handleClick(e, index)}
                onKeyDown={e => handleKeyDown(e, index)}
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
};

export default GooeyNav;
