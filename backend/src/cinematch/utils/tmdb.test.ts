import { test, expect, describe, mock, beforeAll, afterAll, afterEach } from "bun:test";
import { fetchTMDB } from "./tmdb";

describe("fetchTMDB error paths", () => {
  let originalFetch: typeof global.fetch;
  let originalEnv: NodeJS.ProcessEnv;

  beforeAll(() => {
    originalFetch = global.fetch;
    originalEnv = process.env;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    global.fetch = originalFetch;
    process.env = originalEnv;
  });

  test("returns { results: [] } when fetch response is not ok", async () => {
    global.fetch = mock(() =>
      Promise.resolve(new Response(null, { status: 500 }))
    ) as unknown as typeof fetch;

    const result = await fetchTMDB("/test-not-ok");
    expect(result).toEqual({ results: [] });
  });

  test("returns { results: [] } when fetch throws a network error", async () => {
    global.fetch = mock(() =>
      Promise.reject(new Error("Network connection lost"))
    ) as unknown as typeof fetch;

    const result = await fetchTMDB("/test-network-error");
    expect(result).toEqual({ results: [] });
  });

  test("returns { results: [] } when response JSON parsing fails", async () => {
    global.fetch = mock(() =>
      Promise.resolve(new Response("invalid json", { status: 200 }))
    ) as unknown as typeof fetch;

    const result = await fetchTMDB("/test-json-error");
    expect(result).toEqual({ results: [] });
  });

  test("returns { results: [] } when request times out", async () => {
    global.fetch = mock(async (input: any, init: any) => {
      // Simulate a long delay that exceeds the timeout
      return new Promise<Response>((resolve, reject) => {
        const timeout = setTimeout(() => {
          resolve(new Response(JSON.stringify({ results: [{ id: 1 }] }), { status: 200 }));
        }, 100);

        if (init?.signal) {
          init.signal.addEventListener('abort', () => {
            clearTimeout(timeout);
            reject(new Error("AbortError"));
          });
        }
      });
    }) as unknown as typeof fetch;

    // Use a very short timeout
    const result = await fetchTMDB("/test-timeout", { timeoutMs: 10 });
    expect(result).toEqual({ results: [] });
  });
});
