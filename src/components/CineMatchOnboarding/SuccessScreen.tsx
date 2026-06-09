export function SuccessScreen() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white flex items-center justify-center p-6">
      <div className="text-center space-y-6 max-w-lg animate-in fade-in duration-500">
        <div
          className="w-24 h-24 bg-blue-500 rounded-full flex items-center justify-center mx-auto mb-8 shadow-[0_0_40px_rgba(59,130,246,0.4)]"
          style={{ animation: 'successPop 0.5s cubic-bezier(0.34,1.56,0.64,1) 0.2s both' }}
        >
          <svg viewBox="0 0 24 24" fill="none" className="w-12 h-12 text-white" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-4xl md:text-5xl font-bold tracking-tight">Personalizing your experience...</h2>
        <p className="text-zinc-400 text-lg">
          CineMatch is building your recommendation engine. Get ready for your perfect watchlist.
        </p>
        <div className="flex justify-center gap-2 pt-4">
          {[0, 1, 2].map(i => (
            <div
              key={i}
              className="w-2 h-2 bg-blue-500 rounded-full"
              style={{ animation: `bounce 1s infinite ${i * 0.2}s` }}
            />
          ))}
        </div>
      </div>
      <style>{`
        @keyframes successPop {
          from { transform: scale(0); opacity: 0; }
          to   { transform: scale(1); opacity: 1; }
        }
        @keyframes bounce {
          0%, 80%, 100% { transform: translateY(0); }
          40%           { transform: translateY(-8px); }
        }
      `}</style>
    </div>
  )
}
