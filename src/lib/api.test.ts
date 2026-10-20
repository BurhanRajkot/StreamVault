import { describe, it, expect, mock, afterEach } from 'bun:test';
import { adminLogin, getImageSrcSet, buildEmbedUrl, fetchAnimeRow, fetchMediaSummaries, fetchPopular, fetchTrending, isSearchResultWorthShowing, searchMedia } from './api';
import { CONFIG, DEBRID_SERVER_ID, serverOptions, type Media } from './config';

const originalFetch = globalThis.fetch;

/**
 * React 19 augments the global `fetch` type with its own `preconnect` property,
 * so a bare `mock()` is not assignable to `typeof fetch` and every stub was a
 * type error. Only the call signature matters to these tests, so launder the
 * mock through this helper rather than repeating the cast at each call site.
 */
const stubFetch = (impl: () => Promise<Response>) => {
  globalThis.fetch = mock(impl) as unknown as typeof fetch;
};

describe('adminLogin', () => {
  afterEach(() => {
    // Restore fetch after each test
    globalThis.fetch = originalFetch;
  });

  it('should return token on successful login', async () => {
    // Must be a complete AdminLoginResponse — adminLogin is typed to resolve to
    // one, so a `{ token }`-only fixture fails to typecheck against the result.
    const mockResponse = { success: true, token: 'mock-jwt-token', expiresIn: '24h' };
    stubFetch(() =>
      Promise.resolve(new Response(JSON.stringify(mockResponse), { status: 200 }))
    );

    const result = await adminLogin('valid-code');
    expect(result).toEqual(mockResponse);
  });

  // The three rejection cases below must stay `await`ed. Without it the
  // assertion is a floating promise that settles after the test has already
  // returned, so the test passes even when adminLogin resolves instead of
  // throwing — which is the exact regression they exist to catch.
  it('should throw error with specific message when login fails with message', async () => {
    const mockErrorResponse = { message: 'Invalid daily code' };
    stubFetch(() =>
      Promise.resolve(new Response(JSON.stringify(mockErrorResponse), { status: 401 }))
    );

    await expect(adminLogin('invalid-code')).rejects.toThrow('Invalid daily code');
  });

  it('should throw fallback error when login fails without message', async () => {
    stubFetch(() =>
      Promise.resolve(new Response(JSON.stringify({}), { status: 401 }))
    );

    await expect(adminLogin('invalid-code')).rejects.toThrow('Login failed');
  });

  it('should throw network error when fetch fails', async () => {
    const networkError = new Error('Network failure');
    stubFetch(() => Promise.reject(networkError));

    await expect(adminLogin('some-code')).rejects.toThrow('Network failure');
  });
});

describe('getImageSrcSet', () => {
  it('should return undefined if path is null', () => {
    expect(getImageSrcSet(null)).toBeUndefined();
  });

  it('should return undefined if path is undefined (defensive)', () => {
    expect(getImageSrcSet(undefined as unknown as string)).toBeUndefined();
  });

  it('should return undefined if path is empty string', () => {
    expect(getImageSrcSet('')).toBeUndefined();
  });

  it('should return correct srcSet for default size (poster)', () => {
    const path = '/testpath.jpg';
    const result = getImageSrcSet(path);
    const breakpoints = CONFIG.IMG_SRCSET_SIZES['poster'];
    const expected = breakpoints
      .map(({ tmdbSize, displayW }) => `${CONFIG.IMG_BASE_URL}${tmdbSize}${path} ${displayW}w`)
      .join(', ');

    expect(result).toBe(expected);
    expect(result).toContain('/w185/testpath.jpg 185w');
  });

  it('should return correct srcSet for specific size (backdrop)', () => {
    const path = '/backdroppath.jpg';
    const result = getImageSrcSet(path, 'backdrop');
    const breakpoints = CONFIG.IMG_SRCSET_SIZES['backdrop'];
    const expected = breakpoints
      .map(({ tmdbSize, displayW }) => `${CONFIG.IMG_BASE_URL}${tmdbSize}${path} ${displayW}w`)
      .join(', ');

    expect(result).toBe(expected);
    expect(result).toContain('/w300/backdroppath.jpg 300w');
  });
});

describe('buildEmbedUrl', () => {
  it('fills the movie template for a known provider', () => {
    const result = buildEmbedUrl('movie', 'vidfast_pro', 550, {});
    const expected = CONFIG.STREAM_PROVIDERS.vidfast_pro_movie.replace('{tmdbId}', '550');
    expect(result).toBe(expected);
  });

  it('fills the tv template with season/episode for a known provider', () => {
    const result = buildEmbedUrl('tv', 'vidfast_pro', 1399, { season: 3, episode: 7 });
    const expected = CONFIG.STREAM_PROVIDERS.vidfast_pro
      .replace('{tmdbId}', '1399')
      .replace('{season}', '3')
      .replace('{episode}', '7');
    expect(result).toBe(expected);
  });

  it('defaults season/episode to 1 when omitted', () => {
    const result = buildEmbedUrl('tv', 'vidfast_pro', 1399, {});
    const expected = CONFIG.STREAM_PROVIDERS.vidfast_pro
      .replace('{tmdbId}', '1399')
      .replace('{season}', '1')
      .replace('{episode}', '1');
    expect(result).toBe(expected);
  });

  it('returns an empty string for an unknown provider', () => {
    expect(buildEmbedUrl('movie', 'not_a_real_provider', 550, {})).toBe('');
    expect(buildEmbedUrl('tv', 'not_a_real_provider', 550, {})).toBe('');
  });

  it('returns an empty string for a mode with no embed (e.g. home)', () => {
    expect(buildEmbedUrl('home', 'vidfast_pro', 550, {})).toBe('');
  });

  it('resolves a documentary as a tv embed when media.media_type is tv', () => {
    const result = buildEmbedUrl('documentary', 'vidfast_pro', 1399, {
      season: 1,
      episode: 1,
      media: { media_type: 'tv' } as Media,
    });
    const expected = CONFIG.STREAM_PROVIDERS.vidfast_pro
      .replace('{tmdbId}', '1399')
      .replace('{season}', '1')
      .replace('{episode}', '1');
    expect(result).toBe(expected);
  });

  it('resolves a documentary as a movie embed when media.media_type is movie', () => {
    const result = buildEmbedUrl('documentary', 'vidfast_pro', 550, {
      media: { media_type: 'movie' } as Media,
    });
    const expected = CONFIG.STREAM_PROVIDERS.vidfast_pro_movie.replace('{tmdbId}', '550');
    expect(result).toBe(expected);
  });

  it('resolves anime by media.media_type too — the tab mixes films and series', () => {
    const result = buildEmbedUrl('anime', 'vidfast_pro', 95479, {
      season: 2,
      episode: 5,
      media: { media_type: 'tv' } as Media,
    });
    const expected = CONFIG.STREAM_PROVIDERS.vidfast_pro
      .replace('{tmdbId}', '95479')
      .replace('{season}', '2')
      .replace('{episode}', '5');
    expect(result).toBe(expected);
  });
});

// Every provider listed in PROVIDER_NAMES is rendered as a selectable option in
// the server dropdown, so each one must actually resolve to a playable embed.
// These run over the whole list so adding a provider can't half-land again.
describe('stream provider registry', () => {
  const providerKeys = Object.keys(CONFIG.PROVIDER_NAMES);

  it('exposes at least one selectable provider', () => {
    expect(providerKeys.length).toBeGreaterThan(0);
  });

  for (const key of providerKeys) {
    it(`${key}: builds a movie and a tv embed URL`, () => {
      const movie = buildEmbedUrl('movie', key, 550, {});
      const tv = buildEmbedUrl('tv', key, 1399, { season: 1, episode: 1 });

      expect(movie, `${key} has no movie template`).not.toBe('');
      expect(tv, `${key} has no tv template`).not.toBe('');
      // An unsubstituted placeholder means a template/mode mismatch.
      expect(movie).not.toContain('{');
      expect(tv).not.toContain('{');
    });

    it(`${key}: embeds over https from a declared streaming domain`, () => {
      for (const url of [
        buildEmbedUrl('movie', key, 550, {}),
        buildEmbedUrl('tv', key, 1399, { season: 1, episode: 1 }),
      ]) {
        const { protocol, hostname } = new URL(url);
        expect(protocol).toBe('https:');
        expect(
          CONFIG.STREAMING_DOMAINS,
          `${hostname} is missing from CONFIG.STREAMING_DOMAINS`
        ).toContain(hostname);
      }
    });
  }
});

describe('serverOptions', () => {
  it('puts Premium first for movies and TV, with the free tag only while the promotion runs', () => {
    const free = serverOptions('movie', { debridFree: true })
    expect(free[0]).toMatchObject({ id: DEBRID_SERVER_ID, name: 'Premium', detail: '4K/1080p', free: true })
    expect(free[0].label).toBe('Premium (4K/1080p) · Free')

    const paid = serverOptions('tv')
    expect(paid[0]).toMatchObject({ id: DEBRID_SERVER_ID, free: false, label: 'Premium (4K/1080p)' })
  })

  it('offers only the embed servers, labelled by name, outside movies and TV', () => {
    const options = serverOptions('documentary')
    expect(options.some((o) => o.id === DEBRID_SERVER_ID)).toBe(false)
    for (const o of options) expect(o.label).toBe(o.name)
  })

  it('never puts an emoji in a label — a native <select> shows them raw', () => {
    for (const o of serverOptions('movie', { debridFree: true })) {
      expect(o.label).not.toMatch(/\p{Extended_Pictographic}/u)
    }
  })
})

describe('fetchMediaSummaries', () => {
  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('asks for every title in one request and tags each result with its type', async () => {
    let body: unknown
    globalThis.fetch = mock((_url: string, init?: RequestInit) => {
      body = JSON.parse(String(init?.body))
      return Promise.resolve(
        new Response(
          JSON.stringify([
            { media: { id: 238, title: 'The Godfather' }, item: { tmdbId: 238, mediaType: 'movie' } },
            { media: { id: 1396, name: 'Breaking Bad' }, item: { tmdbId: 1396, mediaType: 'tv' } },
          ]),
          { status: 200 }
        )
      )
    }) as unknown as typeof fetch

    const items = [
      { tmdbId: 238, mediaType: 'movie' as const },
      { tmdbId: 1396, mediaType: 'tv' as const },
    ]
    const media = await fetchMediaSummaries(items)

    expect(globalThis.fetch).toHaveBeenCalledTimes(1)
    expect(body).toEqual(items)
    expect(media.map((m) => [m.id, m.media_type])).toEqual([
      [238, 'movie'],
      [1396, 'tv'],
    ])
  })

  it('makes no request for an empty list', async () => {
    stubFetch(() => Promise.reject(new Error('should not be called')))
    expect(await fetchMediaSummaries([])).toEqual([])
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('throws when the backend fails, so the row can show its error state', async () => {
    stubFetch(() => Promise.resolve(new Response('{}', { status: 502 })))
    await expect(fetchMediaSummaries([{ tmdbId: 1, mediaType: 'movie' }])).rejects.toThrow('502')
  })
})

describe('fetchMediaSummaries batching', () => {
  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('splits a long list into requests of 20 and keeps the order asked for', async () => {
    const bodies: { tmdbId: number }[][] = []
    globalThis.fetch = mock((_url: string, init?: RequestInit) => {
      const batch = JSON.parse(String(init?.body)) as { tmdbId: number; mediaType: 'movie' | 'tv' }[]
      bodies.push(batch)
      return Promise.resolve(
        new Response(JSON.stringify(batch.map((item) => ({ media: { id: item.tmdbId }, item }))), { status: 200 })
      )
    }) as unknown as typeof fetch

    const items = Array.from({ length: 45 }, (_, i) => ({ tmdbId: i + 1, mediaType: 'movie' as const }))
    const media = await fetchMediaSummaries(items)

    expect(bodies.map((b) => b.length)).toEqual([20, 20, 5])
    expect(media.map((m) => m.id)).toEqual(items.map((i) => i.tmdbId))
  })
})

describe('isSearchResultWorthShowing', () => {
  const base = { id: 1, title: 'X', overview: '', vote_average: 0, backdrop_path: null }

  it('keeps movies and shows with artwork', () => {
    expect(isSearchResultWorthShowing({ ...base, media_type: 'movie', poster_path: '/p.jpg' })).toBe(true)
    expect(isSearchResultWorthShowing({ ...base, media_type: 'tv', poster_path: '/p.jpg', vote_count: 0 })).toBe(true)
  })

  it('drops people — they have no poster and open nothing', () => {
    expect(isSearchResultWorthShowing({ ...base, media_type: 'person', poster_path: '/p.jpg' })).toBe(false)
  })

  it('drops posterless filler nobody has rated, but keeps a posterless title people have', () => {
    expect(isSearchResultWorthShowing({ ...base, media_type: 'movie', poster_path: null, vote_count: 3 })).toBe(false)
    expect(isSearchResultWorthShowing({ ...base, media_type: 'movie', poster_path: null, vote_count: 400 })).toBe(true)
  })
})

describe('anime feeds', () => {
  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  /** Answers discover by media type and records every URL asked for. */
  const stubDiscover = (results: { movie: object[]; tv: object[] }) => {
    const urls: URL[] = []
    globalThis.fetch = mock((input: string) => {
      const url = new URL(input)
      urls.push(url)
      const type = url.pathname.endsWith('/movie') ? 'movie' : 'tv'
      return Promise.resolve(new Response(JSON.stringify({ results: results[type], total_pages: 3 }), { status: 200 }))
    }) as unknown as typeof fetch
    return urls
  }

  it('asks discover for Japanese animation, films and series both, tagging each', async () => {
    const urls = stubDiscover({
      movie: [{ id: 129, title: 'Spirited Away', popularity: 50 }],
      tv: [{ id: 95479, name: 'JUJUTSU KAISEN', popularity: 90 }],
    })

    const { results, total_pages } = await fetchPopular('anime')

    expect(urls.map((u) => u.pathname).sort()).toEqual(['/tmdb/discover/movie', '/tmdb/discover/tv'])
    for (const url of urls) {
      expect(url.searchParams.get('with_genres')).toBe('16')
      expect(url.searchParams.get('with_original_language')).toBe('ja')
    }
    expect(results.map((m) => [m.id, m.media_type])).toEqual([
      [95479, 'tv'],
      [129, 'movie'],
    ])
    expect(total_pages).toBe(3)
  })

  it('ranks the top-rated row across films and series, with a vote floor on each', async () => {
    const urls = stubDiscover({
      movie: [{ id: 129, title: 'Spirited Away', vote_average: 8.5 }],
      tv: [
        { id: 209867, name: 'Frieren', vote_average: 8.8 },
        { id: 1429, name: 'Attack on Titan', vote_average: 8.4 },
      ],
    })

    const media = await fetchAnimeRow('top-rated')

    expect(media.map((m) => m.id)).toEqual([209867, 129, 1429])
    for (const url of urls) {
      expect(url.searchParams.get('sort_by')).toBe('vote_average.desc')
      expect(Number(url.searchParams.get('vote_count.gte'))).toBeGreaterThan(0)
    }
  })

  it('features well-known anime, films and series both, not the raw popularity chart', async () => {
    const urls = stubDiscover({
      movie: [{ id: 129, title: 'Spirited Away', popularity: 50 }],
      tv: [{ id: 95479, name: 'JUJUTSU KAISEN', popularity: 90 }],
    })

    const featured = await fetchTrending('anime')

    expect(featured.map((m) => m.id)).toEqual([95479, 129])
    for (const url of urls) {
      expect(url.searchParams.get('with_original_language')).toBe('ja')
      expect(Number(url.searchParams.get('vote_count.gte'))).toBeGreaterThanOrEqual(1000)
    }
  })

  it('searches only anime from the Anime tab', async () => {
    let asked: URL | undefined
    globalThis.fetch = mock((input: string) => {
      asked = new URL(input)
      return Promise.resolve(new Response(JSON.stringify({ results: [], has_more: false }), { status: 200 }))
    }) as unknown as typeof fetch

    await searchMedia('anime', 'naruto')

    expect(asked?.searchParams.get('anime')).toBe('true')
    expect(asked?.searchParams.get('mediaOnly')).toBe('true')
    expect(asked?.searchParams.has('mediaType')).toBe(false)
  })
})
