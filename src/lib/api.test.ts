import { describe, it, expect, mock, afterEach } from 'bun:test';
import { adminLogin } from './api';

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
