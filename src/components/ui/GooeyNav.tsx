import { useRef, useEffect, useState } from 'react';
import './GooeyNav.css';

interface GooeyNavProps {
  items: { label: string; href: string; onClick?: () => void }[];
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



  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>, index: number) => {
    e.preventDefault();
    const liEl = e.currentTarget.parentElement;
    if (!liEl) return;
    if (activeIndex === index) return;

    setActiveIndex(index);

    // Call external handler
    items[index].onClick?.();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLAnchorElement>, index: number) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const liEl = e.currentTarget.parentElement;
      if (liEl) {
        handleClick({ currentTarget: e.currentTarget, preventDefault: () => {} } as unknown as React.MouseEvent<HTMLAnchorElement>, index);
      }
    }
  };

  useEffect(() => {
    if (!navRef.current || !containerRef.current) return;
    // Removed resize observer since effect spans are removed.
  }, [activeIndex]);

  // Sync internal state if initialActiveIndex changes
  useEffect(() => {
      if (activeIndex !== initialActiveIndex) {
          setActiveIndex(initialActiveIndex);
      }
  }, [initialActiveIndex]);

  return (
    <div className="gooey-nav-container" ref={containerRef}>
      <nav>
        <ul ref={navRef}>
          {items.map((item, index) => (
            <li key={index} className={activeIndex === index ? 'active' : ''}>
              <a href={item.href} onClick={e => handleClick(e, index)} onKeyDown={e => handleKeyDown(e, index)}>
                {item.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
};

export default GooeyNav;
