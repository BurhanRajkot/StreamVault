import { MediaType } from './src/cinematch/types';

// Mocking fetchFeatures to simulate network delay
async function mockFetchFeatures(tmdbId: number, mediaType: MediaType) {
  const delay = Math.random() * 100 + 50; // 50-150ms delay
  await new Promise(resolve => setTimeout(resolve, delay));
  return { tmdbId, mediaType };
}

async function runUnbounded(selections: any[]) {
  const start = performance.now();
  await Promise.allSettled(
    selections.map((item) => mockFetchFeatures(item.tmdbId, item.mediaType))
  );
  return performance.now() - start;
}

async function runChunked(selections: any[], chunkSize: number) {
  const start = performance.now();
  const results = [];
  for (let i = 0; i < selections.length; i += chunkSize) {
    const chunk = selections.slice(i, i + chunkSize);
    const chunkResults = await Promise.allSettled(
      chunk.map((item) => mockFetchFeatures(item.tmdbId, item.mediaType))
    );
    results.push(...chunkResults);
  }
  return performance.now() - start;
}

async function main() {
  const selections = Array.from({ length: 50 }, (_, i) => ({
    tmdbId: i + 1,
    mediaType: 'movie' as MediaType,
  }));

  console.log(`Running benchmark with ${selections.length} items...`);

  // Warmup
  await runUnbounded(selections);
  await runChunked(selections, 10);

  let totalUnbounded = 0;
  let totalChunked = 0;
  const iterations = 5;

  for (let i = 0; i < iterations; i++) {
    totalUnbounded += await runUnbounded(selections);
    totalChunked += await runChunked(selections, 10);
  }

  console.log(`Average Unbounded: ${(totalUnbounded / iterations).toFixed(2)}ms`);
  console.log(`Average Chunked (size 10): ${(totalChunked / iterations).toFixed(2)}ms`);
  console.log('Note: Chunked will be slower in a simple mock because it limits parallelism, but it prevents resource exhaustion and rate limiting in reality.');
}

main().catch(console.error);
