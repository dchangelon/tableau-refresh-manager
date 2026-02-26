/**
 * In-memory cache with TTL for MCP server.
 * Replaces Next.js unstable_cache for the standalone MCP context.
 */

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const store = new Map<string, CacheEntry<unknown>>();

/**
 * Get a value from cache, or compute and cache it if missing/expired.
 *
 * @param key - Cache key
 * @param ttlMs - Time-to-live in milliseconds
 * @param fetcher - Async function to compute the value on cache miss
 */
export async function getCached<T>(
  key: string,
  ttlMs: number,
  fetcher: () => Promise<T>,
): Promise<T> {
  const cached = store.get(key) as CacheEntry<T> | undefined;
  if (cached && Date.now() < cached.expiresAt) {
    return cached.data;
  }

  const data = await fetcher();
  store.set(key, { data, expiresAt: Date.now() + ttlMs });
  return data;
}

/**
 * Invalidate all cache entries (e.g., after a reschedule).
 */
export function invalidateAll(): void {
  store.clear();
}

/**
 * Invalidate a specific cache key.
 */
export function invalidate(key: string): void {
  store.delete(key);
}
