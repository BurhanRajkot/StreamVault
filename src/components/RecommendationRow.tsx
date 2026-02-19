// ============================================================
// CineMatch AI — RecommendationRow Component
// Netflix-style horizontal scroll row for "Because you watched X"
// and "Recommended For You" sections
// ============================================================

import React, { useRef } from 'react'
import { ChevronLeft, ChevronRight, Sparkles } from 'lucide-react'
import { RecoSection, RecoItem, getImageUrl } from '../lib/api'
import './RecommendationRow.css'

interface RecommendationRowProps {
  section: RecoSection
  onCardClick: (item: RecoItem) => void
}

export function RecommendationRow({ section, onCardClick }: RecommendationRowProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  const scroll = (direction: 'left' | 'right') => {
    if (!scrollRef.current) return
    const scrollAmount = scrollRef.current.clientWidth * 0.8
    scrollRef.current.scrollBy({
      left: direction === 'right' ? scrollAmount : -scrollAmount,
      behavior: 'smooth',
    })
  }

  if (section.items.length === 0) return null

  return (
    <section className="reco-row">
      {/* Section header */}
      <div className="reco-row__header">
        <div className="reco-row__title-wrap">
          <Sparkles className="reco-row__icon" size={16} />
          <h2 className="reco-row__title">{section.title}</h2>
        </div>
        <div className="reco-row__controls">
          <button
            className="reco-row__btn"
            onClick={() => scroll('left')}
            aria-label="Scroll left"
          >
            <ChevronLeft size={20} />
          </button>
          <button
            className="reco-row__btn"
            onClick={() => scroll('right')}
            aria-label="Scroll right"
          >
            <ChevronRight size={20} />
          </button>
        </div>
      </div>

      {/* Horizontal scroll track */}
      <div className="reco-row__track" ref={scrollRef}>
        {section.items.map((item) => (
          <RecoCard key={`${item.mediaType}:${item.tmdbId}`} item={item} onClick={onCardClick} />
        ))}
      </div>
    </section>
  )
}

// ── Individual card ───────────────────────────────────────────
interface RecoCardProps {
  item: RecoItem
  onClick: (item: RecoItem) => void
}

function RecoCard({ item, onClick }: RecoCardProps) {
  const imgSrc = item.posterPath
    ? getImageUrl(item.posterPath, 'thumbnail')
    : null

  return (
    <button
      className="reco-card"
      onClick={() => onClick(item)}
      aria-label={`Play ${item.title}`}
    >
      {/* Poster */}
      <div className="reco-card__poster">
        {imgSrc ? (
          <img
            src={imgSrc}
            alt={item.title}
            className="reco-card__img"
            loading="lazy"
          />
        ) : (
          <div className="reco-card__placeholder">
            <span>{item.title.charAt(0)}</span>
          </div>
        )}

        {/* Hover overlay */}
        <div className="reco-card__overlay">
          <div className="reco-card__score">
            <span className="reco-card__score-dot" />
            {Math.round(item.voteAverage * 10) / 10}
          </div>
        </div>
      </div>

      {/* Info below poster */}
      <div className="reco-card__info">
        <p className="reco-card__name">{item.title}</p>
        <p className="reco-card__reason">{item.sourceReason}</p>
      </div>
    </button>
  )
}
