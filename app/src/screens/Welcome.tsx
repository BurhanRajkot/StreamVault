import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { EASE_OUT, spring } from '@app/lib/motion'
import { fetchTrending } from '@/lib/api'
import { updateSettings } from '@app/lib/settings'
import { tmdbImg } from '@app/components/media'
import { LogoMark } from '@app/components/Logo'

export function Welcome() {
  // A wall of this week's posters behind the welcome
  const { data } = useQuery({ queryKey: ['app-row', 'home', 'top'], queryFn: () => fetchTrending('home'), staleTime: 30 * 60 * 1000 })
  const posters = (data ?? []).filter((m) => m.poster_path).slice(0, 18)
  // Columns of this week's posters drifting past at different speeds
  const columns = [0, 1, 2, 3, 4].map((c) => posters.filter((_, i) => i % 5 === c))
  return (
    <div className="relative flex min-h-[100dvh] flex-col overflow-hidden bg-background">
      <div className="absolute inset-0 flex justify-center gap-2 opacity-45 [mask-image:linear-gradient(to_bottom,black_30%,transparent_85%)]" aria-hidden="true">
        {columns.map((col, c) => (
          <motion.div
            key={c}
            className={c > 2 ? 'hidden w-[24%] shrink-0 flex-col gap-2 lg:flex lg:w-[16%]' : 'flex w-[32%] shrink-0 flex-col gap-2 lg:w-[16%]'}
            initial={{ y: c % 2 ? -260 : 0 }}
            animate={{ y: c % 2 ? 0 : -260 }}
            transition={{ duration: 28 + c * 4, repeat: Infinity, repeatType: 'mirror', ease: 'linear' }}
          >
            {[...col, ...col].map((m, i) => (
              <img key={`${m.id}-${i}`} src={tmdbImg(m.poster_path, 'w342')} alt="" className="aspect-[2/3] w-full rounded-xl object-cover" />
            ))}
          </motion.div>
        ))}
      </div>
      <div className="absolute inset-0 bg-gradient-to-b from-background/30 via-background/80 to-background" />

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: EASE_OUT, delay: 0.2 }}
        className="relative mt-auto px-6 pb-[calc(var(--sab)+28px)] lg:mx-auto lg:mb-auto lg:max-w-lg lg:text-center"
      >
        <motion.div initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ ...spring, delay: 0.4 }} className="mb-6 inline-block">
          <LogoMark className="h-16 w-16" />
        </motion.div>
        <h1 className="font-display text-[34px] font-extrabold leading-[1.05] tracking-tight text-white lg:text-[48px]">
          Movies, shows
          <br />
          and anime.
        </h1>
        <p className="mt-4 text-[15px] leading-relaxed text-white/65">Stream in HD, keep your list and progress in step with the website, and download for offline viewing.</p>
        <p className="mt-5 text-[11.5px] leading-relaxed text-white/40">
          StreamVault doesn&apos;t host any video — titles play from third-party servers. By continuing you agree to use it only for content you have the right to watch.
        </p>
        <motion.button
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.96 }}
          onClick={() => updateSettings({ acceptedTerms: true })}
          className="bg-primary mt-6 w-full rounded-full py-4 text-[16px] font-extrabold text-white"
        >
          Get started
        </motion.button>
      </motion.div>
    </div>
  )
}
