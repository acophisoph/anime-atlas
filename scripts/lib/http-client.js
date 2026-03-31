import fetch from 'node-fetch';

const REQUESTS_PER_SECOND = parseFloat(process.env.REQUESTS_PER_SECOND ?? '0.35');
const BATCH_MAX_RETRIES = parseInt(process.env.BATCH_MAX_RETRIES ?? '5', 10);
const ANILIST_URL = 'https://graphql.anilist.co';

// Token bucket
let tokens = 1.0;
let lastRefill = Date.now();

function refillTokens() {
  const now = Date.now();
  const elapsed = (now - lastRefill) / 1000;
  tokens = Math.min(1.0, tokens + elapsed * REQUESTS_PER_SECOND);
  lastRefill = now;
}

async function waitForToken() {
  refillTokens();
  while (tokens < 1.0) {
    const waitMs = Math.ceil((1.0 - tokens) / REQUESTS_PER_SECOND * 1000);
    await sleep(waitMs);
    refillTokens();
  }
  tokens -= 1.0;
}

export function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * Execute a GraphQL query against AniList with pacing, retries, and backoff.
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
      console.warn(`[http] ${label} network error attempt=${attempt} err=${err.message} wait=${wait}ms`);
      await sleep(wait);
      attempt++;
      continue;
    }

    const elapsed = Date.now() - t0;

    // Honor Retry-After from any header that looks like it
    const retryAfter = findRetryAfter(res.headers);

    if (res.status === 429 || res.status === 503) {
      const wait = retryAfter != null ? retryAfter * 1000 : backoffMs(attempt);
      console.warn(`[http] ${label} status=${res.status} attempt=${attempt} wait=${wait}ms`);
      await sleep(wait);
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
      // Some AniList errors are permanent (not found), some are transient
      const isTransient = json.errors.some(e => e.status >= 500 || e.status === 429);
      if (isTransient && attempt < BATCH_MAX_RETRIES) {
        const wait = backoffMs(attempt);
        console.warn(`[http] ${label} gql-error attempt=${attempt} wait=${wait}ms: ${msg}`);
        await sleep(wait);
        attempt++;
        continue;
      }
      throw new Error(`GraphQL: ${msg}`);
    }

    console.log(`[http] ${label} ok elapsed=${elapsed}ms attempt=${attempt}`);
    return json.data;
  }
  throw new Error(`${label}: exceeded max retries (${BATCH_MAX_RETRIES})`);
}

function backoffMs(attempt) {
  return Math.min(60000, 1000 * Math.pow(2, attempt) + Math.random() * 500);
}

function findRetryAfter(headers) {
  // Try multiple possible header names case-insensitively
  const candidates = ['retry-after', 'x-ratelimit-reset', 'ratelimit-reset'];
  for (const name of candidates) {
    const val = headers.get(name);
    if (val != null) {
      const n = parseInt(val, 10);
      if (!isNaN(n)) return n;
    }
  }
  return null;
}
