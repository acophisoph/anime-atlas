import type { Manifest, Point, Cluster, SearchEntry, Graph, GraphEdge } from '../types';

const BASE = import.meta.env.BASE_URL + 'data/';

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(BASE + path);
  if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
  return res.json() as Promise<T>;
}

async function fetchBin(path: string): Promise<ArrayBuffer> {
  const res = await fetch(BASE + path);
  if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
  return res.arrayBuffer();
}

// ---- Manifest ----
export async function loadManifest(): Promise<Manifest> {
  return fetchJson<Manifest>('manifest.json');
}

// ---- Points ----
const POINT_MAGIC   = 0x41544c50;
const BYTES_PER_PT  = 28;

export async function loadPoints(): Promise<Point[]> {
  const buf = await fetchBin('points.bin');
  const view = new DataView(buf);
  const magic = view.getUint32(0, true);
  if (magic !== POINT_MAGIC) throw new Error('points.bin: bad magic');
  const count = view.getUint32(8, true);
  const points: Point[] = [];
  for (let i = 0; i < count; i++) {
    const off = 16 + i * BYTES_PER_PT;
    points.push({
      id:           view.getInt32(off,      true),
      x:            view.getFloat32(off+4,  true),
      y:            view.getFloat32(off+8,  true),
      kind:         view.getUint32(off+12, true) === 1 ? 'person' : 'media',
      popularity:   view.getUint32(off+16, true),
      averageScore: view.getUint32(off+20, true),
      colorRGB:     view.getUint32(off+24, true),
    });
  }
  return points;
}

// ---- Graph ----
const GRAPH_MAGIC = 0x41544c47;

export async function loadGraph(name: string): Promise<Graph> {
  const buf = await fetchBin(name);
  const view = new DataView(buf);
  if (view.getUint32(0, true) !== GRAPH_MAGIC) throw new Error(`${name}: bad magic`);
  const nodeCount = view.getUint32(8, true);
  const edgeCount = view.getUint32(12, true);

  const nodes = new Map<number, { edgeOffset: number }>();
  for (let i = 0; i < nodeCount; i++) {
    const off = 16 + i * 8;
    const id = view.getInt32(off, true);
    const edgeOffset = view.getUint32(off + 4, true);
    nodes.set(id, { edgeOffset });
  }

  const edgesStart = 16 + nodeCount * 8;
  const edges: GraphEdge[] = [];
  for (let i = 0; i < edgeCount; i++) {
    const off = edgesStart + i * 12;
    edges.push({
      targetId:  view.getInt32(off,    true),
      weight:    view.getFloat32(off+4, true),
      edgeType:  view.getUint32(off+8,  true),
    });
  }
  return { nodeCount, edgeCount, nodes, edges };
}

// ---- Clusters ----
export async function loadClusters(): Promise<Cluster[]> {
  return fetchJson<Cluster[]>('clusters.json');
}

// ---- Search ----
export async function loadSearch(): Promise<SearchEntry[]> {
  return fetchJson<SearchEntry[]>('index/search.json');
}

// ---- Meta chunks (lazy) ----
const metaCache = new Map<string, Record<string, unknown>>();

export async function loadMetaChunk(chunkFile: string): Promise<Record<string, unknown>> {
  if (metaCache.has(chunkFile)) return metaCache.get(chunkFile)!;
  const data = await fetchJson<Record<string, unknown>>('meta/' + chunkFile);
  metaCache.set(chunkFile, data);
  return data;
}

// ---- Lookup maps (lazy) ----
let mediaChunkLookup: Record<string, string> | null = null;
let peopleChunkLookup: Record<string, string> | null = null;

export async function getMediaChunkLookup(): Promise<Record<string, string>> {
  if (!mediaChunkLookup) {
    mediaChunkLookup = await fetchJson<Record<string, string>>('lookup/media_to_meta_chunk.json');
  }
  return mediaChunkLookup;
}

export async function getPeopleChunkLookup(): Promise<Record<string, string>> {
  if (!peopleChunkLookup) {
    peopleChunkLookup = await fetchJson<Record<string, string>>('lookup/people_to_meta_chunk.json');
  }
  return peopleChunkLookup;
}

export async function loadMediaMeta(id: number): Promise<import('../types').MediaMeta | null> {
  const lookup = await getMediaChunkLookup();
  const chunkFile = lookup[String(id)];
  if (!chunkFile) return null;
  const chunk = await loadMetaChunk(chunkFile);
  return (chunk[String(id)] as import('../types').MediaMeta) ?? null;
}

export async function loadPersonMeta(id: number): Promise<import('../types').PersonMeta | null> {
  const lookup = await getPeopleChunkLookup();
  const chunkFile = lookup[String(id)];
  if (!chunkFile) return null;
  const chunk = await loadMetaChunk(chunkFile);
  return (chunk[String(id)] as import('../types').PersonMeta) ?? null;
}

// ---- Tag/Role indices ----
let tagToMediaCache: Record<string, number[]> | null = null;
let roleTopeople: Record<string, number[]> | null = null;

export async function getTagToMedia(): Promise<Record<string, number[]>> {
  if (!tagToMediaCache) {
    tagToMediaCache = await fetchJson<Record<string, number[]>>('index/tag_to_media.json');
  }
  return tagToMediaCache;
}

export async function getRoleToPeople(): Promise<Record<string, number[]>> {
  if (!roleTopeople) {
    roleTopeople = await fetchJson<Record<string, number[]>>('index/role_to_people.json');
  }
  return roleTopeople;
}
