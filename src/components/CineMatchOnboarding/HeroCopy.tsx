interface Props {
  minSelections: number
}

export function HeroCopy({ minSelections }: Props) {
  return (
    <div className="max-w-2xl mb-12 px-6">
      <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight mb-5 leading-tight">
        What do you love watching?
      </h1>
      <p className="text-lg md:text-xl text-zinc-400">
        Select at least{' '}
        <strong className="text-white">{minSelections} titles</strong>{' '}
        you enjoy and CineMatch will instantly calibrate your personal recommendation engine.
        The more you pick, the smarter it gets.
      </p>
    </div>
  )
}
