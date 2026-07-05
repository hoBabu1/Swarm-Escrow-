// Bounded-concurrency map: runs `fn` over `items` with at most `limit` in
// flight at once. Plain Promise.all would fire everything at once (risking
// GitHub/Anthropic/Supabase rate limits); a fixed batch-of-N loop wastes time
// waiting for the slowest item in each batch before starting the next. This
// keeps `limit` slots continuously busy instead.
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const i = nextIndex++;
      if (i >= items.length) return;
      results[i] = await fn(items[i] as T, i);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
