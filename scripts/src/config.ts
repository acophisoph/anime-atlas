import path from 'node:path';

export const ROOT = path.resolve(process.cwd(), '..');
export const DATA_DIR = path.join(ROOT, 'data');
export const CACHE_DIR = path.join(process.cwd(), '.cache');
export const TMP_DIR = path.join(DATA_DIR, '_tmp');

export const BUILD_CONFIG = {
  topAnime: Number(process.env.TOP_ANIME ?? 100),
  topManga: Number(process.env.TOP_MANGA ?? 100),
  pageSize: 50,
  requestPerSecond: 1,
  maxRetries: 5,
  seed: 1337,
  chunkSize: 200,
  yearsRecent: 5,
  yearsLong: 10
};

export const BASE_PATH = process.env.BASE_PATH ?? '/anime-atlas/';
