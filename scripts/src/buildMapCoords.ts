import { BUILD_CONFIG } from './config.js';

function seeded(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildMapCoords(media: any[]) {
  const vocabulary = new Map<string, number>();
  for (const m of media) {
    for (const tag of m.tags ?? []) if (!vocabulary.has(tag.name)) vocabulary.set(tag.name, vocabulary.size);
    for (const g of m.genres ?? []) if (!vocabulary.has(g)) vocabulary.set(g, vocabulary.size);
  }

  const vectors = media.map((m) => {
    const vec = new Float32Array(vocabulary.size);
    for (const tag of m.tags ?? []) vec[vocabulary.get(tag.name)!] = Math.max(vec[vocabulary.get(tag.name)!], (tag.rank ?? 50) / 100);
    for (const g of m.genres ?? []) vec[vocabulary.get(g)!] = Math.max(vec[vocabulary.get(g)!], 0.6);
    return vec;
  });

  const rand = seeded(BUILD_CONFIG.seed);
  return media.map((m, i) => {
    const v = vectors[i];
    let x = 0;
    let y = 0;
    for (let j = 0; j < v.length; j += 2) {
      x += v[j] ?? 0;
      y += v[j + 1] ?? 0;
    }
    x = x / Math.max(1, v.length / 2) + (rand() - 0.5) * 0.05;
    y = y / Math.max(1, v.length / 2) + (rand() - 0.5) * 0.05;
    return { id: m.id, type: m.type === 'ANIME' ? 0 : 1, x, y, cluster: m.type === 'ANIME' ? 1 : 2, year: m.year || 0 };
  });
}
