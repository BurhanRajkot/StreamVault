import { describe, beforeAll, afterAll, test, expect } from "bun:test";

describe("fetchTMDB without API KEY", () => {
  let savedTmdbApiKey: string | undefined;
  let savedViteTmdbApiKey: string | undefined;

  beforeAll(() => {
    // Save the actual values (not a reference) so afterAll can restore them.
    savedTmdbApiKey = process.env.TMDB_API_KEY;
    savedViteTmdbApiKey = process.env.VITE_TMDB_API_KEY;
    delete process.env.TMDB_API_KEY;
    delete process.env.VITE_TMDB_API_KEY;
  });

  afterAll(() => {
    if (savedTmdbApiKey === undefined) {
      delete process.env.TMDB_API_KEY;
    } else {
      process.env.TMDB_API_KEY = savedTmdbApiKey;
    }
    if (savedViteTmdbApiKey === undefined) {
      delete process.env.VITE_TMDB_API_KEY;
    } else {
      process.env.VITE_TMDB_API_KEY = savedViteTmdbApiKey;
    }
  });

  test("returns { results: [] } when TMDB_API_KEY is missing", async () => {
    // Dynamically import the module so it reads the cleared env variables.
    // The query string makes Bun treat this as a distinct cache entry,
    // ensuring TMDB_API_KEY is evaluated at import time (not from a cached module).
    const { fetchTMDB } = await import("./tmdb?test=" + Date.now());
    const result = await fetchTMDB("/test-no-key");
    expect(result).toEqual({ results: [] });
  });
});
