import { describe, it, expect, mock, afterEach } from 'bun:test';
import { adminLogin, getImageSrcSet, buildEmbedUrl } from './api';
import { CONFIG } from './config';

const originalFetch = globalThis.fetch;

describe('adminLogin', () => {
  afterEach(() => {
    // Restore fetch after each test
    globalThis.fetch = originalFetch;
  });

  it('should return token on successful login', async () => {
    const mockResponse = { token: 'mock-jwt-token' };
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify(mockResponse), { status: 200 }))
    );

    const result = await adminLogin('valid-code');
    expect(result).toEqual(mockResponse);
  });

  it('should throw error with specific message when login fails with message', async () => {
    const mockErrorResponse = { message: 'Invalid daily code' };
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify(mockErrorResponse), { status: 401 }))
    );

    expect(adminLogin('invalid-code')).rejects.toThrow('Invalid daily code');
  });

  it('should throw fallback error when login fails without message', async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify({}), { status: 401 }))
    );

    expect(adminLogin('invalid-code')).rejects.toThrow('Login failed');
  });

  it('should throw network error when fetch fails', async () => {
    const networkError = new Error('Network failure');
    globalThis.fetch = mock(() => Promise.reject(networkError));

    expect(adminLogin('some-code')).rejects.toThrow('Network failure');
  });
});

describe('getImageSrcSet', () => {
  it('should return undefined if path is null', () => {
    expect(getImageSrcSet(null)).toBeUndefined();
  });

  it('should return undefined if path is undefined (defensive)', () => {
    expect(getImageSrcSet(undefined as any)).toBeUndefined();
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
      media: { media_type: 'tv' } as any,
    });
    const expected = CONFIG.STREAM_PROVIDERS.vidfast_pro
      .replace('{tmdbId}', '1399')
      .replace('{season}', '1')
      .replace('{episode}', '1');
    expect(result).toBe(expected);
  });

  it('resolves a documentary as a movie embed when media.media_type is movie', () => {
    const result = buildEmbedUrl('documentary', 'vidfast_pro', 550, {
      media: { media_type: 'movie' } as any,
    });
    const expected = CONFIG.STREAM_PROVIDERS.vidfast_pro_movie.replace('{tmdbId}', '550');
    expect(result).toBe(expected);
  });
});
