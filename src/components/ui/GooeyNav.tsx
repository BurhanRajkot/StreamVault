import { CSSProperties, useRef, useEffect, useState } from 'react';
import './GooeyNav.css';

interface GooeyNavProps {
  items: { label: string; onClick?: () => void }[];
  animationTime?: number;
  particleCount?: number;
  particleDistances?: [number, number];
  particleR?: number;
  timeVariance?: number;
  colors?: number[];
  initialActiveIndex?: number;
}

const GooeyNav = ({
  items,
  animationTime = 600,
  particleCount = 15,
  particleDistances = [90, 10],
  particleR = 100,
  timeVariance = 300,
  colors = [1, 2, 3, 1, 2, 3, 1, 4],
  initialActiveIndex = 0
}: GooeyNavProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLUListElement>(null);
  const [activeIndex, setActiveIndex] = useState(initialActiveIndex);
  const safeAnimationTime = Math.max(220, animationTime);
  const navStyle = {
    '--gooey-duration': `${safeAnimationTime}ms`,
  } as CSSProperties;



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
    <div className="gooey-nav-container" ref={containerRef} style={navStyle}>
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
