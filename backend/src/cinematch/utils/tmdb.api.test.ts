import { describe, beforeAll, afterAll, test, expect } from "bun:test";

describe("fetchTMDB without API KEY", () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeAll(() => {
    originalEnv = process.env;
    delete process.env.TMDB_API_KEY;
    delete process.env.VITE_TMDB_API_KEY;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test("returns { results: [] } when TMDB_API_KEY is missing", async () => {
    // Dynamically import the module so it reads the empty env variables
    const { fetchTMDB } = await import("./tmdb?test=" + Date.now());
    const result = await fetchTMDB("/test-no-key");
    expect(result).toEqual({ results: [] });
  });
});
