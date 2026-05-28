import { describe, it, expect, mock, afterEach } from 'bun:test';
import { adminLogin, getImageUrl } from './api';
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

describe('getImageUrl', () => {
  it('should return /placeholder.svg for null, undefined, or empty path', () => {
    expect(getImageUrl(null)).toBe('/placeholder.svg');
    expect(getImageUrl(undefined)).toBe('/placeholder.svg');
    expect(getImageUrl('')).toBe('/placeholder.svg');
  });

  it('should return default poster size URL for valid path without size', () => {
    expect(getImageUrl('/test.jpg')).toBe(`${CONFIG.IMG_BASE_URL}${CONFIG.IMG_SIZES.poster}/test.jpg`);
  });

  it('should return valid size URL when size is provided', () => {
    expect(getImageUrl('/test.jpg', 'backdrop')).toBe(`${CONFIG.IMG_BASE_URL}${CONFIG.IMG_SIZES.backdrop}/test.jpg`);
    expect(getImageUrl('/test.jpg', 'thumbnail')).toBe(`${CONFIG.IMG_BASE_URL}${CONFIG.IMG_SIZES.thumbnail}/test.jpg`);
    expect(getImageUrl('/test.jpg', 'logo')).toBe(`${CONFIG.IMG_BASE_URL}${CONFIG.IMG_SIZES.logo}/test.jpg`);
    expect(getImageUrl('/test.jpg', 'hero')).toBe(`${CONFIG.IMG_BASE_URL}${CONFIG.IMG_SIZES.hero}/test.jpg`);
  });

  it('should add missing leading slash if path is missing it', () => {
    expect(getImageUrl('test.jpg')).toBe(`${CONFIG.IMG_BASE_URL}${CONFIG.IMG_SIZES.poster}/test.jpg`);
  });

  it('should fallback to poster size for invalid size argument', () => {
    expect(getImageUrl('/test.jpg', 'invalid-size' as any)).toBe(`${CONFIG.IMG_BASE_URL}${CONFIG.IMG_SIZES.poster}/test.jpg`);
  });

  it('should return absolute URLs as-is', () => {
    const urls = [
      'http://example.com/image.jpg',
      'https://example.com/image.jpg',
      '//example.com/image.jpg',
      'data:image/jpeg;base64,/9j/4AAQSkZJRg'
    ];

    urls.forEach(url => {
      expect(getImageUrl(url)).toBe(url);
    });
  });
});
