import { test, expect, describe, mock, beforeAll, afterAll, afterEach } from "bun:test";

describe("fetchTMDB error paths", () => {
  let fetchTMDB: (path: string, options?: { timeoutMs?: number }) => Promise<any>;
  let originalFetch: typeof global.fetch;
  let originalApiKey: string | undefined;

  beforeAll(async () => {
    originalFetch = global.fetch;
    originalApiKey = process.env.TMDB_API_KEY;

    // Set a fake API key so fetchTMDB proceeds past the early-return guard.
    // TMDB_API_KEY is captured at module level, so we must import a fresh
    // module instance after setting the env var.
    process.env.TMDB_API_KEY = "test-api-key-12345";
    const mod = await import(`./tmdb?cache=${Date.now()}`);
    fetchTMDB = mod.fetchTMDB;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  afterAll(() => {
    global.fetch = originalFetch;
    if (originalApiKey === undefined) {
      delete process.env.TMDB_API_KEY;
    } else {
      process.env.TMDB_API_KEY = originalApiKey;
    }
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
-<<<<<<< coderabbitai/chat/0745faa
-    global.fetch = mock(async (_input: RequestInfo | URL, init?: RequestInit) => {
-=======
-    global.fetch = mock(async (input: any, init: any) => {
->>>>>>> test-tmdb-error-paths-10385787311398840115
+    global.fetch = mock(
+      async (_input: RequestInfo | URL, init?: RequestInit) => {
      // Simulate a long delay that exceeds the timeout
      return new Promise<Response>((_resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new Error("Should have been aborted before this fires"));
        }, 5000);

        if (init?.signal) {
          init.signal.addEventListener("abort", () => {
            clearTimeout(timer);
            // Use DOMException with name "AbortError" to match the real fetch API
            reject(new DOMException("The operation was aborted.", "AbortError"));
          });
        }
      });
    }) as unknown as typeof fetch;

    // Use a very short timeout so the AbortController fires quickly
    const result = await fetchTMDB("/test-timeout", { timeoutMs: 10 });
    expect(result).toEqual({ results: [] });
  });

