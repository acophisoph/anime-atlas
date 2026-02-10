import { decodePoints } from './binary';

const base = import.meta.env.BASE_URL;

export const dataUrl = (p: string) => `${base}data/${p}`;

export async function loadManifest() {
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

export async function loadAllMeta() {
  const media = await loadJson<any[]>('meta/media_000.json');
  const people = await loadJson<any[]>('meta/people_000.json').catch(() => []);
  const characters = await loadJson<any[]>('meta/characters_000.json').catch(() => []);
  return { media, people, characters };
}
