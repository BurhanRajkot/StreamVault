import { describe, it, expect, mock, afterEach } from 'bun:test';
import { adminLogin, getImageSrcSet } from './api';
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
