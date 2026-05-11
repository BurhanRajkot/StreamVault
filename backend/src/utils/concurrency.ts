/**
 * Maps over an array concurrently with a strict concurrency limit.
 * This prevents creating an unbounded number of Promises simultaneously,
 * optimizing memory usage and event loop overhead for large inputs.
 *
 * @param items The array of items to map over.
 * @param mapper The asynchronous mapping function.
 * @param concurrency The maximum number of concurrent executions.
 * @returns An array of resolved results.
 */
export async function mapConcurrent<T, R>(
  items: T[],
  mapper: (item: T, index: number) => Promise<R>,
  concurrency: number
): Promise<R[]> {
  const results = new Array(items.length);
  let currentIndex = 0;

  const worker = async () => {
    while (currentIndex < items.length) {
      const index = currentIndex++;
      results[index] = await mapper(items[index], index);
    }
  };

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => worker()
  );

  await Promise.all(workers);
  return results;
}
