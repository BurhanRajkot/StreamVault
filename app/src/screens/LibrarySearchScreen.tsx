import { useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { FileVideo, Film, Loader2, Search } from 'lucide-react'
import { useIsAdmin } from '@/hooks/useIsAdmin'
import { formatBytes } from '@/lib/debridApi'
import { libraryPlayPath, searchLibraryFiles } from '@/lib/librarySearch'
import { useSettings } from '@app/lib/settings'
import { PageHeader } from '@app/components/PageHeader'
import { IconTile, ListRow, ListSection } from '@app/components/kit'

/**
 * Keyword search over the files in the Real-Debrid account. Admin only, and
 * only while "File search" is on in My Space — anyone else is sent away.
 * Every word must match the torrent's or the file's name; a hit plays in the
 * Premium player.
 */
export function LibrarySearchScreen() {
  const isAdmin = useIsAdmin()
  const { fileSearch } = useSettings()
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')

  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(query.trim()), 350)
    return () => window.clearTimeout(id)
  }, [query])

  const { data, isFetching, error } = useQuery({
    queryKey: ['app-library-search', debounced],
    queryFn: ({ signal }) => searchLibraryFiles(debounced, signal),
    enabled: isAdmin && fileSearch && debounced.length >= 2,
    placeholderData: keepPreviousData,
    // While the indexer is still reading files, look again: older multi-file torrents show up as it goes
    refetchInterval: (q) => (q.state.data?.indexing ? 10_000 : false),
    staleTime: 30_000,
    retry: false,
  })

  if (!isAdmin) return <Navigate to="/admin" replace />
  if (!fileSearch) return <Navigate to="/me" replace />

  const results = data?.results ?? []
  const searched = debounced.length >= 2

  return (
    <div className="px-4 pb-tabbar pt-page lg:px-12">
      <div className="mx-auto max-w-[900px]">
        <PageHeader back backTo="/me" title="My files" subtitle="Search the files in your Real-Debrid account — admin only" />

        <div className="mb-5 flex h-11 items-center gap-2 rounded-full bg-fill px-3.5 lg:h-12 lg:px-5">
          {isFetching ? <Loader2 className="h-[18px] w-[18px] shrink-0 animate-spin text-label-2" /> : <Search className="h-[18px] w-[18px] shrink-0 text-label-2" strokeWidth={2.2} />}
          <input
            ref={inputRef}
            autoFocus
            data-tv-autofocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Any keyword — every word must match"
            aria-label="Search your files"
            className="t-body h-full min-w-0 flex-1 bg-transparent text-white caret-tint outline-none placeholder:text-label-2 lg:text-[18px]"
            enterKeyHint="search"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.blur()}
          />
        </div>

        {error ? (
          <p className="t-body text-ios-red">{error instanceof Error ? error.message : 'Search failed'}</p>
        ) : !searched ? (
          <p className="t-body text-label-2">Type a word or two — a title, a name, a quality, anything in a file&apos;s name.</p>
        ) : results.length === 0 && !isFetching ? (
          <p className="t-body text-label-2">
            Nothing in your account matches “{debounced}”.
            {data?.indexing ? ' Still reading your older torrents — this looks again by itself.' : ''}
          </p>
        ) : (
          <ListSection header={`${results.length}${results.length >= 80 ? '+' : ''} found`}>
            {results.map((hit) => (
              <ListRow
                key={`${hit.torrentId}:${hit.file?.id ?? 0}`}
                onClick={() => navigate(libraryPlayPath(hit))}
                icon={
                  <IconTile color={hit.file?.video === false ? 'gray' : 'teal'}>
                    {hit.file?.video === false ? <FileVideo /> : <Film />}
                  </IconTile>
                }
                label={hit.file?.name ?? hit.torrentName}
                detail={hit.file ? `${hit.torrentName} · ${formatBytes(hit.file.bytes)}` : 'Plays the largest video inside'}
                disabled={hit.file?.video === false}
              />
            ))}
          </ListSection>
        )}

        {data && data.indexing && (
          <p className="t-footnote mt-4 text-center text-label-3">
            Reading file lists: {data.indexed} of {data.torrents} torrents. Older ones appear as this goes.
          </p>
        )}
      </div>
    </div>
  )
}
