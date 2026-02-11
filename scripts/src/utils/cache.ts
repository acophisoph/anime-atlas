import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { CACHE_DIR } from '../config.js';

const cacheFile = (key: string) => path.join(CACHE_DIR, `${key}.json`);

export const cacheKey = (query: string, variables: unknown) => {
  return crypto.createHash('sha256').update(`${query}:${JSON.stringify(variables)}`).digest('hex');
};

export async function readCache<T>(key: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(cacheFile(key), 'utf-8');
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function writeCache<T>(key: string, value: T): Promise<void> {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  await fs.writeFile(cacheFile(key), JSON.stringify(value), 'utf-8');
}
