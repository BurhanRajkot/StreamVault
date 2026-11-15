import { useQuery } from '@tanstack/react-query'
import { fetchTrending } from '@/lib/api'
import { updateSettings } from '@app/lib/settings'
import { tmdbImg } from '@app/components/media'
import { LogoMark } from '@app/components/Logo'

export function Welcome() {
  // A wall of this week's posters behind the welcome
  const { data } = useQuery({ queryKey: ['app-row', 'home', 'top'], queryFn: () => fetchTrending('home'), staleTime: 30 * 60 * 1000 })
  const posters = (data ?? []).filter((m) => m.poster_path).slice(0, 9)
  return (
    <div className="relative flex min-h-[100dvh] flex-col overflow-hidden bg-[#0a0a0c]">
      <div className="absolute inset-0 grid grid-cols-3 content-start gap-1.5 p-1.5 opacity-40" aria-hidden="true">
        {posters.map((m) => (
          <img key={m.id} src={tmdbImg(m.poster_path, 'w342')} alt="" className="aspect-[2/3] w-full rounded object-cover" />
        ))}
      </div>
      <div className="absolute inset-0 bg-gradient-to-b from-[#0a0a0c]/40 via-[#0a0a0c]/85 to-[#0a0a0c]" />

      <div className="relative mt-auto px-6 pb-[calc(var(--sab)+28px)] lg:mx-auto lg:mb-auto lg:mt-auto lg:max-w-md">
        <LogoMark className="mb-5 h-14 w-14" />
        <h1 className="text-[30px] font-extrabold leading-[1.1] tracking-tight text-white">
          Movies, shows &amp; anime.
          <br />
          All in one place.
        </h1>
        <p className="mt-3 text-[14px] leading-relaxed text-white/65">Stream in HD, pick up where you left off, and download for offline viewing.</p>
        <p className="mt-5 text-[11.5px] leading-relaxed text-white/40">
          StreamVault doesn&apos;t host any video — titles play from third-party servers. By continuing you agree to use it only for content you have the right to watch.
        </p>
        <button
          onClick={() => updateSettings({ acceptedTerms: true })}
          className="press mt-5 w-full rounded-md bg-primary py-3.5 text-[15px] font-bold text-white shadow-lg shadow-primary/25"
        >
          Get started
        </button>
      </div>
    </div>
  )
}
