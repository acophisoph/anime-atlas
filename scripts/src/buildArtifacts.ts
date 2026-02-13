import fs from 'node:fs/promises';
import path from 'node:path';
import { BASE_PATH, BUILD_CONFIG, CACHE_DIR, DATA_DIR, TMP_DIR } from './config.js';
import { closePool, hasDatabase, initializeDatabaseDefaults, loadEntityMaps } from './db.js';
import { buildMapCoords } from './buildMapCoords.js';
import { buildIndices } from './buildIndices.js';
import { packGraphEdges, packPoints } from './packBinary.js';

const CHECKPOINT_DIR = path.join(CACHE_DIR, 'batch-progress');

type IngestInputSource = 'TMP_DIR' | 'CHECKPOINT_DIR' | 'DATABASE';

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function deriveCollab(media: any[]): Array<[number, number, number]> {
  const pair = new Map<string, number>();
  for (const m of media) {
    const people = [...new Set((m.staff ?? []).map((s: any) => s.personId).filter(Boolean))];
    for (let i = 0; i < people.length; i++) {
      for (let j = i + 1; j < people.length; j++) {
        const key = `${Math.min(people[i], people[j])}:${Math.max(people[i], people[j])}`;
        pair.set(key, (pair.get(key) ?? 0) + 1);
      }
    }
  }
  return [...pair.entries()].map(([k, w]) => {
    const [a, b] = k.split(':').map(Number);
    return [a, b, w] as [number, number, number];
  });
}

async function main() {
  let media: any[] = [];
  let people: any[] = [];
  let characters: any[] = [];
  let relationLookup: Record<number, any> = {};
  let inputSource: IngestInputSource | null = null;

  async function canRead(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async function readJsonFile<T>(filePath: string, label: string): Promise<T> {
    let raw: string;
    try {
      raw = await fs.readFile(filePath, 'utf-8');
    } catch (error) {
      throw new Error(`Failed reading ${label} at ${filePath}: ${String(error)}`);
    }
    try {
      return JSON.parse(raw) as T;
    } catch (error) {
      throw new Error(`Failed parsing JSON for ${label} at ${filePath}: ${String(error)}`);
    }
  }

  async function loadFromDirectory(dirPath: string, source: IngestInputSource): Promise<boolean> {
    const mediaFile = path.join(dirPath, 'mediaDetails.json');
    const peopleFile = path.join(dirPath, 'people.json');
    const charsFile = path.join(dirPath, 'characters.json');
    const relFile = path.join(dirPath, 'relationLookup.json');

    const hasCore = await Promise.all([canRead(mediaFile), canRead(peopleFile), canRead(charsFile)]);
    if (!hasCore.every(Boolean)) return false;

    media = await readJsonFile<any[]>(mediaFile, 'mediaDetails');
    people = await readJsonFile<any[]>(peopleFile, 'people');
    characters = await readJsonFile<any[]>(charsFile, 'characters');
    relationLookup = (await canRead(relFile)) ? await readJsonFile<Record<number, any>>(relFile, 'relationLookup') : {};
    inputSource = source;
    return true;
  }

  await initializeDatabaseDefaults();

  const loadedFromTmp = await loadFromDirectory(TMP_DIR, 'TMP_DIR');
  const loadedFromCheckpoint = loadedFromTmp ? false : await loadFromDirectory(CHECKPOINT_DIR, 'CHECKPOINT_DIR');

  if (!loadedFromTmp && !loadedFromCheckpoint) {
    if (!hasDatabase()) {
      throw new Error(
        `TMP ingest files and checkpoint files not found (${TMP_DIR}, ${CHECKPOINT_DIR}) and no SQLite DB data is available. ` +
        'This can happen when ingest was canceled before first persist; ensure checkpoint restore is configured.'
      );
    }
    const sourceProvider = (process.env.SOURCE_PROVIDER ?? 'ANILIST').toUpperCase();
    const topAnime = Number(process.env.TOP_ANIME ?? 2500);
    const topManga = Number(process.env.TOP_MANGA ?? 2500);
    const batchAnime = Number(process.env.BATCH_ANIME ?? 50);
    const batchManga = Number(process.env.BATCH_MANGA ?? 50);
    const cfgKey = [sourceProvider, topAnime, topManga, batchAnime, batchManga].join(':');
    const dbData = await loadEntityMaps({ sourceProvider, configKey: cfgKey });
    media = dbData.media;
    people = dbData.people;
    characters = dbData.characters;
    relationLookup = dbData.relationLookup;
    inputSource = 'DATABASE';
  }

  console.info('[info] buildArtifacts ingest input source', {
    source: inputSource,
    media: media.length,
    people: people.length,
    characters: characters.length
  });

  await fs.mkdir(path.join(DATA_DIR, 'indices'), { recursive: true });
  await fs.mkdir(path.join(DATA_DIR, 'meta'), { recursive: true });
  await fs.mkdir(path.join(DATA_DIR, 'graph'), { recursive: true });

  const points = buildMapCoords(media);
  await fs.writeFile(path.join(DATA_DIR, 'points.bin'), packPoints(points));

  const idx = buildIndices(media, people, characters);
  await fs.writeFile(path.join(DATA_DIR, 'indices', 'tag_to_media.json'), JSON.stringify(idx.tagToMedia));
  await fs.writeFile(path.join(DATA_DIR, 'indices', 'role_to_people.json'), JSON.stringify(idx.roleToPeople));
  await fs.writeFile(path.join(DATA_DIR, 'indices', 'tagrole_to_people.json'), JSON.stringify(idx.tagRoleToPeople));
  await fs.writeFile(path.join(DATA_DIR, 'indices', 'yearbucket_to_people.json'), JSON.stringify(idx.yearBucketToPeople));
  await fs.writeFile(path.join(DATA_DIR, 'indices', 'search_index.json'), JSON.stringify({ index: idx.searchIndex, docs: idx.searchDocs }));

  for (const [i, part] of chunk(media, BUILD_CONFIG.chunkSize).entries()) {
    await fs.writeFile(path.join(DATA_DIR, 'meta', `media_${String(i).padStart(3, '0')}.json`), JSON.stringify(part));
  }
  for (const [i, part] of chunk(people, BUILD_CONFIG.chunkSize).entries()) {
    await fs.writeFile(path.join(DATA_DIR, 'meta', `people_${String(i).padStart(3, '0')}.json`), JSON.stringify(part));
  }
  for (const [i, part] of chunk(characters, BUILD_CONFIG.chunkSize).entries()) {
    await fs.writeFile(path.join(DATA_DIR, 'meta', `characters_${String(i).padStart(3, '0')}.json`), JSON.stringify(part));
  }
  await fs.writeFile(path.join(DATA_DIR, 'meta', 'media_rel_lookup.json'), JSON.stringify(relationLookup));

  const mediaRel = media.flatMap((m: any) => (m.relations ?? []).map((r: any) => [m.id, r.id, 1] as [number, number, number]));
  const mediaCredits = media.flatMap((m: any) => (m.staff ?? []).map((s: any) => [m.id, s.personId, 1] as [number, number, number])).filter((x: any) => x[1]);
  const personCollab = deriveCollab(media);

  await fs.writeFile(path.join(DATA_DIR, 'graph', 'media_rel.bin'), packGraphEdges(mediaRel));
  await fs.writeFile(path.join(DATA_DIR, 'graph', 'media_credits.bin'), packGraphEdges(mediaCredits));
  await fs.writeFile(path.join(DATA_DIR, 'graph', 'person_collab.bin'), packGraphEdges(personCollab));

  const manifest = {
    version: 1,
    generatedAt: new Date().toISOString(),
    counts: { media: media.length, people: people.length, characters: characters.length, points: points.length },
    buildConfig: BUILD_CONFIG,
    basePath: BASE_PATH,
    binarySpec: {
      points: '{count:u32}{id:u32,type:u8,x:f32,y:f32,cluster:u16,year:u16}*',
      graph: '{count:u32}{src:u32,dst:u32,weight:u32}*'
    }
  };
  await fs.writeFile(path.join(DATA_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));
}

main().then(async () => {
  await closePool();
}).catch(async (error) => {
  console.error(error);
  await closePool();
  process.exit(1);
});
