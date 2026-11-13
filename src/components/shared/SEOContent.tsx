import { Link } from 'react-router-dom'

const BROWSE_LINKS = [
  { to: '/movies', label: 'Watch movies online' },
  { to: '/tv', label: 'Watch TV shows online' },
  { to: '/anime', label: 'Watch anime online' },
  { to: '/documentaries', label: 'Watch documentaries' },
]

const FAQ = [
  {
    q: 'Is StreamVault free?',
    a: 'Yes. You can watch movies, TV shows and anime on StreamVault for free, without creating an account. An optional Premium plan adds the Premium server.',
  },
  {
    q: 'Do I need to sign up to watch?',
    a: 'No. Press play on any title and it starts. Signing in only adds extras like My List, Continue Watching across devices and personalised CineMatch recommendations.',
  },
  {
    q: 'Can I watch every episode of a series?',
    a: 'Yes. Every TV series lists all of its seasons and episodes, and the player moves on to the next episode for you.',
  },
  {
    q: 'Can I download movies and episodes?',
    a: 'Yes. Open a title, or press Download while it plays, to get the movie or the current episode along with subtitles.',
  },
  {
    q: 'What quality can I stream in?',
    a: 'Most titles play in HD, and many in 4K. Switch servers from the player if one is slow.',
  },
]

/** The home page's about text: the page's H1, what the site is, and links into each section. */
export function SEOContent() {
  return (
    <section aria-labelledby="sv-about" className="mx-auto max-w-5xl px-1 py-14 text-muted-foreground">
      <h1 id="sv-about" className="mb-4 text-2xl font-bold tracking-tight text-foreground">
        StreamVault — Watch Movies, TV Shows &amp; Anime Online Free
      </h1>
      <div className="space-y-4 text-sm leading-relaxed">
        <p>
          <strong className="text-foreground">StreamVault</strong> is a free streaming site for movies, TV series and
          anime. Browse what&apos;s trending this week, the most popular titles right now and the best-rated of all time,
          then press play: no account, no card. Titles stream in HD and often 4K, and every show comes with all of its
          seasons and episodes.
        </p>
        <p>
          CineMatch, StreamVault&apos;s recommendation engine, learns from what you watch, like and skip, so your home page
          fills up with things you&apos;ll actually want to see. The catalogue comes from TMDB and updates every day.
        </p>
      </div>

      <nav aria-label="Browse StreamVault" className="mt-6">
        <ul className="flex flex-wrap gap-2">
          {BROWSE_LINKS.map((link) => (
            <li key={link.to}>
              <Link
                to={link.to}
                className="inline-flex h-9 items-center rounded-full border border-border/60 bg-secondary/40 px-4 text-[13px] font-medium text-foreground/85 transition-colors hover:border-primary/40 hover:bg-primary/10 hover:text-foreground"
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <h2 className="mb-3 mt-10 text-lg font-semibold text-foreground">Frequently asked questions</h2>
      <div className="divide-y divide-border/50 rounded-xl border border-border/50">
        {FAQ.map(({ q, a }) => (
          <details key={q} className="group px-4 py-3">
            <summary className="cursor-pointer list-none text-sm font-medium text-foreground/90 marker:hidden">
              {q}
            </summary>
            <p className="mt-2 text-sm leading-relaxed">{a}</p>
          </details>
        ))}
      </div>
    </section>
  )
}
