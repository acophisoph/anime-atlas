import { logger } from './utils/logger.js';

type JikanStudio = { mal_id: number; name: string };
type JikanGenre = { mal_id: number; name: string };
type JikanRelation = { relation: string; entry: Array<{ mal_id: number; type: string }> };

type JikanMedia = {
  mal_id: number;
  title?: string;
  title_english?: string;
  title_japanese?: string;
  year?: number;
  aired?: { from?: string };
  published?: { from?: string };
  popularity?: number;
  score?: number;
  url?: string;
  type?: string;
  studios?: JikanStudio[];
  genres?: JikanGenre[];
  themes?: JikanGenre[];
  demographics?: JikanGenre[];
  relations?: JikanRelation[];
};

type JikanEnvelope<T> = { data?: T; pagination?: { has_next_page?: boolean } };

const JIKAN_BASE = 'https://api.jikan.moe/v4';
const JIKAN_RPS = Number(process.env.JIKAN_REQUESTS_PER_SECOND ?? 2.4);
const JIKAN_RPM = Number(process.env.JIKAN_REQUESTS_PER_MINUTE ?? 55);
const JIKAN_MAX_RETRIES = Number(process.env.JIKAN_MAX_RETRIES ?? 8);

let nextAllowedAt = 0;
const reqTimestamps: number[] = [];

function parseYear(fromDate?: string): number {
  if (!fromDate) return 0;
  const m = fromDate.match(/^(\d{4})/);
  return m ? Number(m[1]) : 0;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function throttleJikan(): Promise<void> {
  const now = Date.now();
  const perReqInterval = Math.ceil(1000 / Math.max(JIKAN_RPS, 0.05));
  if (now < nextAllowedAt) {
    await sleep(nextAllowedAt - now);
  }
  nextAllowedAt = Date.now() + perReqInterval;

  const minuteAgo = Date.now() - 60_000;
  while (reqTimestamps.length && reqTimestamps[0] < minuteAgo) reqTimestamps.shift();
  if (reqTimestamps.length >= Math.max(1, JIKAN_RPM)) {
    const wait = 60_000 - (Date.now() - reqTimestamps[0]) + 50;
    if (wait > 0) await sleep(wait);
  }
  reqTimestamps.push(Date.now());
}

async function getJson<T>(url: string): Promise<T | null> {
  let retries = 0;
  let wait = 1500;

  while (true) {
    await throttleJikan();
    const resp = await fetch(url);

    if (resp.status === 404) {
      logger.warn('Jikan request not found', { url, status: resp.status });
      return null;
    }

    if (resp.status === 429 || resp.status >= 500) {
      retries += 1;
      const retryAfterMs = Number(resp.headers.get('retry-after') ?? 0) * 1000;
      const backoff = retryAfterMs > 0 ? retryAfterMs : wait;
      logger.warn('Jikan retrying request', { url, status: resp.status, retries, backoff });
      if (retries > JIKAN_MAX_RETRIES) {
        throw new Error(`Jikan request failed after retries (${resp.status}): ${url}`);
      }
      await sleep(backoff + Math.floor(Math.random() * 500));
      wait = Math.min(wait * 2, 60_000);
      continue;
    }

    if (!resp.ok) {
      const txt = await resp.text();
      throw new Error(`Jikan request failed ${resp.status}: ${url} ${txt}`);
    }

    return (await resp.json()) as T;
  }
}

export async function fetchJikanTopIds(type: 'ANIME' | 'MANGA', targetCount: number): Promise<number[]> {
  const endpoint = type === 'ANIME' ? 'top/anime' : 'top/manga';
  const perPage = 25;
  const ids: number[] = [];
  let page = 1;

  while (ids.length < targetCount) {
    const payload = await getJson<JikanEnvelope<Array<{ mal_id: number }>>>(`${JIKAN_BASE}/${endpoint}?page=${page}&limit=${perPage}&sfw=true`);
    const data = payload?.data ?? [];
    if (!data.length) break;
    ids.push(...data.map((x) => x.mal_id));
    if (!payload?.pagination?.has_next_page) break;
    page += 1;
  }

  return ids.slice(0, targetCount);
}

export async function fetchJikanMediaDetail(type: 'ANIME' | 'MANGA', malId: number): Promise<null | {
  malId: number;
  type: 'ANIME' | 'MANGA';
  title: { romaji?: string; english?: string; native?: string };
  year: number;
  format: string;
  popularity: number;
  averageScore: number;
  siteUrl: string;
  genres: string[];
  tags: Array<{ name: string; rank: number }>;
  studios: Array<{ id: number; name: string; siteUrl: string; isAnimationStudio: boolean }>;
  relations: Array<{ idMal: number; relationType: string; type: 'ANIME' | 'MANGA' }>;
}> {
  const endpoint = type === 'ANIME' ? `anime/${malId}/full` : `manga/${malId}/full`;
  const payload = await getJson<JikanEnvelope<JikanMedia>>(`${JIKAN_BASE}/${endpoint}`);
  const data = payload?.data;
  if (!data) return null;

  const studios = (data.studios ?? []).map((s) => ({
    id: s.mal_id,
    name: s.name,
    siteUrl: `https://myanimelist.net/anime/producer/${s.mal_id}`,
    isAnimationStudio: true
  }));

  const year = type === 'ANIME' ? data.year ?? parseYear(data.aired?.from) : parseYear(data.published?.from);
  const genres = [...(data.genres ?? []), ...(data.themes ?? []), ...(data.demographics ?? [])].map((g) => g.name);
  const tags = genres.map((name) => ({ name, rank: 60 }));

  const relations = (data.relations ?? []).flatMap((r) =>
    (r.entry ?? []).map((e) => ({
      relationType: r.relation,
      idMal: e.mal_id,
      type: e.type?.toUpperCase().includes('MANGA') ? 'MANGA' : ('ANIME' as 'ANIME' | 'MANGA')
    }))
  );

  return {
    malId,
    type,
    title: { romaji: data.title, english: data.title_english, native: data.title_japanese },
    year,
    format: data.type ?? type,
    popularity: data.popularity ?? 0,
    averageScore: data.score ? Math.round(data.score * 10) : 0,
    siteUrl: data.url ?? `https://myanimelist.net/${type === 'ANIME' ? 'anime' : 'manga'}/${malId}`,
    genres,
    tags,
    studios,
    relations
  };
}

export async function fetchJikanFallback(type: 'ANIME' | 'MANGA', malId?: number): Promise<null | {
  title: { romaji?: string; english?: string; native?: string };
  year: number;
  studios: Array<{ id: number; name: string; siteUrl: string; isAnimationStudio: boolean }>;
}> {
  if (!malId) return null;
  const detail = await fetchJikanMediaDetail(type, malId);
  if (!detail) return null;
  return { title: detail.title, year: detail.year, studios: detail.studios };
}
