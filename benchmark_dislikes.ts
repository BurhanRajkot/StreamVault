import { performance } from 'perf_hooks'

interface DislikeItem {
  id: string
  tmdbId: number
  mediaType: 'movie' | 'tv'
}

const generateMockDislikes = (count: number): DislikeItem[] => {
  const items: DislikeItem[] = []
  for (let i = 0; i < count; i++) {
    items.push({
      id: `id-${i}`,
      tmdbId: i,
      mediaType: i % 2 === 0 ? 'movie' : 'tv',
    })
  }
  return items
}

const numItems = 10000;
const dislikes = generateMockDislikes(numItems);

// Test some and find
const testId = numItems - 1;
const testType = testId % 2 === 0 ? 'movie' : 'tv';

const numIterations = 10000;

// BASELINE
const startBaseline = performance.now();
for (let i = 0; i < numIterations; i++) {
  const exists = dislikes.some(d => d.tmdbId === testId && d.mediaType === testType);
  const item = dislikes.find(d => d.tmdbId === testId && d.mediaType === testType);
}
const endBaseline = performance.now();

// OPTIMIZED
const startMapCreation = performance.now();
const dislikesMap = new Map<string, DislikeItem>();
dislikes.forEach(d => dislikesMap.set(`${d.mediaType}:${d.tmdbId}`, d));
const endMapCreation = performance.now();

const startOptimized = performance.now();
for (let i = 0; i < numIterations; i++) {
  const exists = dislikesMap.has(`${testType}:${testId}`);
  const item = dislikesMap.get(`${testType}:${testId}`);
}
const endOptimized = performance.now();

console.log(`Baseline (some/find): ${(endBaseline - startBaseline).toFixed(2)} ms`);
console.log(`Optimized map creation: ${(endMapCreation - startMapCreation).toFixed(2)} ms`);
console.log(`Optimized (has/get): ${(endOptimized - startOptimized).toFixed(2)} ms`);
console.log(`Total Optimized: ${(endMapCreation - startMapCreation + endOptimized - startOptimized).toFixed(2)} ms`);
