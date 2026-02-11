import { decodePoints } from './binary';

const base = import.meta.env.BASE_URL;
const DEFAULT_CHUNK_SIZE = 200;

export const dataUrl = (p: string) => `${base}data/${p}`;

type Manifest = {
  counts?: { media?: number; people?: number; characters?: number };
  buildConfig?: { chunkSize?: number };
};

export async function loadManifest(): Promise<Manifest> {
  return (await fetch(dataUrl('manifest.json'))).json();
}

export async function loadPoints() {
  try {
    return await decodePoints(dataUrl('points.bin'));
  } catch {
    return await loadJson<any[]>('points.json');
  }
}

export async function loadJson<T>(p: string): Promise<T> {
  const response = await fetch(dataUrl(p));
  if (!response.ok) throw new Error(`Failed to load ${p}`);
  return response.json();
}

export async function loadGraphEdges(name: string): Promise<Array<[number, number, number]>> {
  try {
    const response = await fetch(dataUrl(`graph/${name}.bin`));
    if (!response.ok) throw new Error('missing bin');
    const buf = await response.arrayBuffer();
    const dv = new DataView(buf);
    const n = dv.getUint32(0, true);
    let off = 4;
    const edges: Array<[number, number, number]> = [];
    for (let i = 0; i < n; i += 1) {
      edges.push([dv.getUint32(off, true), dv.getUint32(off + 4, true), dv.getUint32(off + 8, true)]);
      off += 12;
    }
    return edges;
  } catch {
    return loadJson<Array<[number, number, number]>>(`graph/${name}.json`).catch(() => []);
  }
}

async function loadChunked<T>(prefix: 'media' | 'people' | 'characters', count: number, chunkSize: number): Promise<T[]> {
  const chunks = Math.max(1, Math.ceil(count / chunkSize));
  const requests = Array.from({ length: chunks }).map((_, i) => {
    const file = `meta/${prefix}_${String(i).padStart(3, '0')}.json`;
    return loadJson<T[]>(file).catch(() => []);
  });
  const loaded = await Promise.all(requests);
  return loaded.flat();
}

export async function loadAllMeta() {
  const manifest: Manifest = await loadManifest().catch(() => ({} as Manifest));
  const counts = manifest.counts ?? {};
  const chunkSize = manifest.buildConfig?.chunkSize ?? DEFAULT_CHUNK_SIZE;

  const media = await loadChunked<any>('media', counts.media ?? chunkSize, chunkSize);
  const people = await loadChunked<any>('people', counts.people ?? chunkSize, chunkSize);
  const characters = await loadChunked<any>('characters', counts.characters ?? chunkSize, chunkSize);

  const relationLookup = await loadJson<Record<string, any>>('meta/media_rel_lookup.json').catch(() => ({}));

  return { media, people, characters, relationLookup };
}
