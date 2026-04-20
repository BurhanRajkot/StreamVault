import { seedTrieBackground } from './src/cinematch/search/trieAutocomplete';

// Mock fetch
const originalFetch = global.fetch;
global.fetch = async (url: RequestInfo | URL, options?: RequestInit) => {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(new Response(JSON.stringify({ results: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }));
    }, 50); // Simulate 50ms network delay
  });
};

process.env.TMDB_API_KEY = 'dummy_key';

async function run() {
  const start = Date.now();
  await seedTrieBackground();
  console.log(`Duration: ${Date.now() - start}ms`);
}

run();
