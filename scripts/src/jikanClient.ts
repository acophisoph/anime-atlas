import { logger } from './utils/logger.js';

type JikanStudio = { mal_id: number; name: string };

type JikanAnime = {
  mal_id: number;
  title?: string;
  title_english?: string;
  title_japanese?: string;
  year?: number;
  aired?: { from?: string };
  studios?: JikanStudio[];
};

type JikanManga = {
  mal_id: number;
  title?: string;
  title_english?: string;
  title_japanese?: string;
  published?: { from?: string };
};

const JIKAN_BASE = 'https://api.jikan.moe/v4';

function parseYear(fromDate?: string): number {
  if (!fromDate) return 0;
  const m = fromDate.match(/^(\d{4})/);
  return m ? Number(m[1]) : 0;
}

export async function fetchJikanFallback(type: 'ANIME' | 'MANGA', malId?: number): Promise<null | {
  title: { romaji?: string; english?: string; native?: string };
  year: number;
  studios: Array<{ id: number; name: string; siteUrl: string; isAnimationStudio: boolean }>;
}> {
  if (!malId) return null;

  const endpoint = type === 'ANIME' ? `anime/${malId}` : `manga/${malId}`;
  try {
    const resp = await fetch(`${JIKAN_BASE}/${endpoint}`);
    if (!resp.ok) {
      logger.warn('Jikan fallback failed', { type, malId, status: resp.status });
      return null;
    }

    const payload = (await resp.json()) as { data?: JikanAnime | JikanManga };
    const data = payload.data;
    if (!data) return null;

    const studios = 'studios' in data && Array.isArray(data.studios)
      ? data.studios.map((s) => ({
          id: s.mal_id,
          name: s.name,
          siteUrl: `https://myanimelist.net/anime/producer/${s.mal_id}`,
          isAnimationStudio: true
        }))
      : [];

    const year = type === 'ANIME'
      ? (data as JikanAnime).year ?? parseYear((data as JikanAnime).aired?.from)
      : parseYear((data as JikanManga).published?.from);

    return {
      title: {
        romaji: data.title,
        english: data.title_english,
        native: data.title_japanese
      },
      year,
      studios
    };
  } catch (error) {
    logger.warn('Jikan fallback error', { type, malId, error: String(error) });
    return null;
  }
}
