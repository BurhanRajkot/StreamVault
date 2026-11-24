import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Star } from 'lucide-react'
import { item, stagger, EASE_OUT } from '@app/lib/motion'
import { fetchCollection } from '@app/lib/extras'
import { today } from '@app/lib/catalog'
import { FadeImg, TitleLink, tmdbImg, titleOf, yearOf } from '@app/components/media'
import { NavBar } from '@app/components/kit'

/** A film series: its artwork, what it's about, and every film in order — numbered, the way it's meant to be watched. */
export function CollectionScreen() {
  const id = Number(useParams().id)
  const { data: collection, isLoading } = useQuery({
    queryKey: ['app-collection', id],
    queryFn: () => fetchCollection(id),
    enabled: id > 0,
    staleTime: 24 * 60 * 60 * 1000,
  })
  const name = collection?.name.replace(/ Collection$/, '') ?? ''

  return (
    <div className="pb-tabbar">
      <NavBar title={name} back />

      {/* The series' artwork, fading into the page */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[58vh] overflow-hidden lg:h-[72vh]">
        {collection?.backdrop_path && (
          <FadeImg src={tmdbImg(collection.backdrop_path, 'w1280')} fetchPriority="high" className="h-full w-full object-cover object-top" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-black/20" />
        <div className="absolute inset-0 hidden bg-gradient-to-r from-black/85 via-black/40 to-transparent lg:block" />
      </div>

      <motion.header
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, ease: EASE_OUT }}
        className="relative z-10 px-4 pb-8 pt-[34vh] lg:max-w-[min(52rem,62%)] lg:px-12 lg:pb-12 lg:pt-[calc(var(--topbar-h)+22vh)]"
      >
        {isLoading || !collection ? (
          <div className="space-y-3">
            <div className="skeleton h-9 w-2/3 rounded" />
            <div className="skeleton h-4 w-full rounded" />
            <div className="skeleton h-4 w-4/5 rounded" />
          </div>
        ) : (
          <>
            <p className="t-caption mb-2 font-semibold uppercase tracking-[0.1em] text-white/60">Film series · {collection.parts.length} films</p>
            <h1 className="t-large lg:text-[clamp(2.5rem,4vw,4rem)] lg:leading-[1.05] lg:tracking-[-0.02em]">{collection.name}</h1>
            {collection.overview && <p className="t-subhead mt-3 text-white/80 lg:text-[16px] lg:leading-[1.55]">{collection.overview}</p>}
          </>
        )}
      </motion.header>

      {collection && (
        <motion.ol
          variants={stagger(0.04)}
          initial="hidden"
          animate="show"
          className="relative z-10 grid gap-3 px-4 lg:grid-cols-2 lg:gap-4 lg:px-12 2xl:grid-cols-3"
        >
          {collection.parts.map((m, i) => {
            const upcoming = !m.release_date || m.release_date > today()
            return (
              <motion.li key={m.id} variants={item}>
                <TitleLink item={m} kind="movie" className="group/part press flex items-center gap-4 rounded-[16px] bg-white/[0.05] p-3 ring-1 ring-white/[0.06] transition-colors hover:bg-white/[0.09]">
                  <span className="w-7 shrink-0 text-center text-[26px] font-bold tabular-nums text-white/35">{i + 1}</span>
                  <span className="skeleton relative w-[72px] shrink-0 overflow-hidden rounded-[8px] lg:w-[84px]">
                    <FadeImg src={tmdbImg(m.poster_path, 'w185')} loading="lazy" className="aspect-[2/3] w-full object-cover" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="t-headline line-clamp-2 text-white">{titleOf(m)}</span>
                    <span className="t-footnote mt-0.5 flex items-center gap-1.5 text-label-2">
                      {upcoming ? (
                        <span className="text-tint">Coming {m.release_date ? yearOf(m) : 'soon'}</span>
                      ) : (
                        <>
                          {yearOf(m)}
                          {m.vote_average > 0 && (
                            <span className="inline-flex items-center gap-1">
                              · <Star className="h-3 w-3 fill-ios-yellow text-ios-yellow" /> {m.vote_average.toFixed(1)}
                            </span>
                          )}
                        </>
                      )}
                    </span>
                    {m.overview && <span className="t-footnote mt-1 line-clamp-2 text-white/60">{m.overview}</span>}
                  </span>
                </TitleLink>
              </motion.li>
            )
          })}
        </motion.ol>
      )}
    </div>
  )
}
