import { MediaMode } from '@/lib/config'
import GooeyNav from './ui/GooeyNav'

interface MediaTypeSwitcherProps {
  mode: MediaMode
  onModeChange: (mode: MediaMode) => void
}

export function MediaTypeSwitcher({ mode, onModeChange }: MediaTypeSwitcherProps) {
  const modes = [
    { id: 'movie', label: 'Movies' },
    { id: 'tv', label: 'TV Shows' },
    { id: 'downloads', label: 'Downloads' },
  ]

  const activeIndex = modes.findIndex((m) => m.id === mode)

  const navItems = modes.map((m) => ({
    label: m.label,
    href: '#',
    onClick: () => onModeChange(m.id as MediaMode),
  }))

  return (
    <div className="relative z-10">
      <GooeyNav
        items={navItems}
        initialActiveIndex={activeIndex !== -1 ? activeIndex : 0}
        particleCount={12}
        particleDistances={[50, 80]}
        particleR={60}
        animationTime={500}
        colors={[1, 2, 3]} // Will use CSS vars or fallback
      />
    </div>
  )
}
