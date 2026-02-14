import { BUILD_CONFIG } from './config.js';
import { readCache, writeCache, cacheKey } from './utils/cache.js';
import { logger } from './utils/logger.js';
import { throttle } from './utils/rateLimit.js';
import { sleep } from './utils/sleep.js';

const ENDPOINT = 'https://graphql.anilist.co';

function computeAdaptiveDelay(response: Response): number {
  const retryAfter = Number(response.headers.get('retry-after') ?? 0);
  if (!Number.isNaN(retryAfter) && retryAfter > 0) return retryAfter * 1000;

  const remaining = Number(response.headers.get('x-ratelimit-remaining') ?? NaN);
  const reset = Number(response.headers.get('x-ratelimit-reset') ?? NaN);
  if (!Number.isNaN(remaining) && remaining <= 1 && !Number.isNaN(reset)) {
    const untilReset = reset * 1000 - Date.now();
    if (untilReset > 0) return untilReset + 250;
  }
  return 0;
}

export async function queryAniList<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const key = cacheKey(query, variables);
  const cached = await readCache<T>(key);
  if (cached) return cached;

  let retries = 0;
  let wait = 1000;

  while (true) {
    await throttle(BUILD_CONFIG.requestPerSecond);
    try {
      const response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ query, variables })
      });

      const adaptiveDelay = computeAdaptiveDelay(response);
      if (adaptiveDelay > 0) {
        logger.info('Applying adaptive rate delay', adaptiveDelay);
        await sleep(adaptiveDelay);
      }

      if (response.status === 429) {
        throw new Error('429');
      }

      if (!response.ok) {
        const txt = await response.text();
        throw new Error(`AniList request failed ${response.status}: ${txt}`);
      }

      const payload = await response.json();
      if (payload.errors) {
        throw new Error(`AniList GraphQL errors: ${JSON.stringify(payload.errors)}`);
      }

      await writeCache(key, payload.data);
      return payload.data as T;
    } catch (error) {
      retries += 1;
      if (retries > BUILD_CONFIG.maxRetries) throw error;
      logger.warn('Retrying AniList request', { retries, wait, error: String(error) });
      await sleep(wait);
      wait = Math.min(wait * 2, 30_000);
    }
  }
}
