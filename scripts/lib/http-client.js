import fetch from 'node-fetch';

// AniList hard limit: 90 req/min = 1.5 req/sec.
// We run at 1.2 req/sec (80% of max) as default — safe from burst limiter,
// backs off further when X-RateLimit-Remaining drops low.
const REQUESTS_PER_SECOND = parseFloat(process.env.REQUESTS_PER_SECOND ?? '1.2');
const BATCH_MAX_RETRIES   = parseInt(process.env.BATCH_MAX_RETRIES ?? '5', 10);
const ANILIST_URL = 'https://graphql.anilist.co';
const RATE_LIMIT_CAPACITY = 90; // requests per minute (AniList hard cap)

// Token bucket — capacity 1 token (one request at a time through the pacer)
let tokens    = 1.0;
let lastRefill = Date.now();

// Remaining quota from last response header — used for adaptive pacing
let remainingQuota = RATE_LIMIT_CAPACITY;

function refillTokens() {
  const now = Date.now();
  const elapsed = (now - lastRefill) / 1000;
  // Adaptive rate: slow to 0.5/s when quota is low (< 15 remaining)
  const effectiveRate = remainingQuota < 15
    ? Math.min(REQUESTS_PER_SECOND, 0.5)
    : REQUESTS_PER_SECOND;
  tokens = Math.min(1.0, tokens + elapsed * effectiveRate);
  lastRefill = now;
}

async function waitForToken() {
  refillTokens();
  while (tokens < 1.0) {
    const effectiveRate = remainingQuota < 15 ? 0.5 : REQUESTS_PER_SECOND;
    const waitMs = Math.ceil((1.0 - tokens) / effectiveRate * 1000);
    await sleep(Math.min(waitMs, 2000));
    refillTokens();
  }
  tokens -= 1.0;
}

export function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * Execute a GraphQL query against AniList with:
 * - Token-bucket pacing at 1.2 req/sec (configurable)
 * - Adaptive slowdown when X-RateLimit-Remaining < 15
 * - Exponential backoff on errors
 * - Precise Retry-After / X-RateLimit-Reset honor
 */
export async function anilistQuery(query, variables, label = 'query') {
  let attempt = 0;
  while (attempt <= BATCH_MAX_RETRIES) {
    await waitForToken();
    const t0 = Date.now();
    let res;
    try {
      res = await fetch(ANILIST_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ query, variables }),
      });
    } catch (err) {
      const wait = backoffMs(attempt);
      console.warn(`[http] ${label} network-err attempt=${attempt} wait=${wait}ms: ${err.message}`);
      await sleep(wait);
      attempt++;
      continue;
    }

    const elapsed = Date.now() - t0;

    // Read quota headers — update adaptive pacer
    const remaining = readHeader(res.headers, ['x-ratelimit-remaining']);
    if (remaining !== null) remainingQuota = remaining;

    const resetAt  = readHeader(res.headers, ['x-ratelimit-reset']); // unix timestamp
    const retryAfterSecs = readHeader(res.headers, ['retry-after']);

    if (res.status === 429 || res.status === 503) {
      let waitMs;
      if (retryAfterSecs !== null) {
        waitMs = retryAfterSecs * 1000 + 500;
      } else if (resetAt !== null) {
        waitMs = Math.max(1000, resetAt * 1000 - Date.now() + 500);
      } else {
        waitMs = backoffMs(attempt);
      }
      console.warn(`[http] ${label} status=${res.status} remaining=${remaining} attempt=${attempt} wait=${Math.round(waitMs/1000)}s`);
      await sleep(waitMs);
      attempt++;
      continue;
    }

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      const wait = backoffMs(attempt);
      console.warn(`[http] ${label} status=${res.status} attempt=${attempt} wait=${wait}ms body=${body.slice(0, 200)}`);
      if (attempt >= BATCH_MAX_RETRIES) throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
      await sleep(wait);
      attempt++;
      continue;
    }

    const json = await res.json();
    if (json.errors) {
      const msg = json.errors.map(e => e.message).join('; ');
      const isTransient = json.errors.some(e => (e.status ?? 0) >= 500 || e.status === 429);
      if (isTransient && attempt < BATCH_MAX_RETRIES) {
        const wait = backoffMs(attempt);
        console.warn(`[http] ${label} gql-err attempt=${attempt} wait=${wait}ms: ${msg}`);
        await sleep(wait);
        attempt++;
        continue;
      }
      throw new Error(`GraphQL: ${msg}`);
    }

    if (attempt > 0 || remaining !== null) {
      console.log(`[http] ${label} ok elapsed=${elapsed}ms remaining=${remaining ?? '?'} attempt=${attempt}`);
    } else {
      process.stdout.write('.');
    }
    return json.data;
  }
  throw new Error(`${label}: exceeded max retries (${BATCH_MAX_RETRIES})`);
}

function backoffMs(attempt) {
  return Math.min(65000, 1000 * Math.pow(2, attempt) + Math.random() * 500);
}

function readHeader(headers, names) {
  for (const name of names) {
    const val = headers.get(name);
    if (val != null) {
      const n = parseInt(val, 10);
      if (!isNaN(n)) return n;
    }
  }
  return null;
}
