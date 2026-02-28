import { useEffect, useState } from 'react'

export function CircularRating({ rating }: { rating: number }) {
  const [progress, setProgress] = useState(0)
  const percentage = (rating / 10) * 100
  const radius = 22
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = circumference - (progress / 100) * circumference

  useEffect(() => {
    const timer = setTimeout(() => {
      setProgress(percentage)
    }, 300)
    return () => clearTimeout(timer)
  }, [percentage])

  return (
    <div className="relative flex items-center justify-center w-16 h-16">
      <svg className="transform -rotate-90 w-16 h-16">
        <circle
          cx="32"
          cy="32"
          r={radius}
          stroke="currentColor"
          strokeWidth="3"
          fill="transparent"
          className="text-white/10"
        />
        <circle
          cx="32"
          cy="32"
          r={radius}
          stroke="currentColor"
          strokeWidth="3"
          fill="transparent"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          className="text-emerald-400 transition-all duration-1000 ease-out"
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute flex flex-col items-center justify-center">
        <span className="text-sm font-bold font-display tracking-tighter leading-none">
          {rating.toFixed(1)}
        </span>
      </div>
    </div>
  )
}
