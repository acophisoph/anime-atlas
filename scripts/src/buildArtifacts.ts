import fs from 'node:fs/promises';
import path from 'node:path';
import { BASE_PATH, BUILD_CONFIG, DATA_DIR, TMP_DIR } from './config.js';
import { closePool, hasDatabase, initializeDatabaseDefaults, listConfigKeys, loadEntityMaps } from './db.js';
import { buildMapCoords } from './buildMapCoords.js';
import { buildIndices } from './buildIndices.js';
import { packGraphEdges, packPoints } from './packBinary.js';

type IngestInputSource = 'DATABASE' | 'TMP_DIR' | 'COMMITTED_DATA';

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

async function readJsonFile<T>(filePath: string): Promise<T> {
  const raw = await fs.readFile(filePath, 'utf-8');
  return JSON.parse(raw) as T;
}

async function loadChunked(prefix: 'media' | 'people' | 'characters'): Promise<any[]> {
  const dir = path.join(DATA_DIR, 'meta');
  let files: string[] = [];
  try {
    files = await fs.readdir(dir);
  } catch {
    return [];
  }
  const matches = files
    .filter((name) => name.startsWith(`${prefix}_`) && name.endsWith('.json'))
    .sort();
  const out: any[] = [];
  for (const file of matches) {
    const items = await readJsonFile<any[]>(path.join(dir, file));
    out.push(...items);
  }
  return out;
}

async function loadFromTmpIfExplicitlyEnabled(): Promise<{ media: any[]; people: any[]; characters: any[]; relationLookup: Record<number, any> } | null> {
  if (process.env.ALLOW_TMP_ARTIFACT_INPUT !== '1') return null;
  const mediaFile = path.join(TMP_DIR, 'mediaDetails.json');
  const peopleFile = path.join(TMP_DIR, 'people.json');
  const charsFile = path.join(TMP_DIR, 'characters.json');
  const relFile = path.join(TMP_DIR, 'relationLookup.json');

  try {
    const [media, people, characters] = await Promise.all([
      readJsonFile<any[]>(mediaFile),
      readJsonFile<any[]>(peopleFile),
      readJsonFile<any[]>(charsFile)
    ]);
    const relationLookup = await readJsonFile<Record<number, any>>(relFile).catch(() => ({}));
    return { media, people, characters, relationLookup };
  } catch (error) {
    console.warn('[warn] TMP ingest input exists but is unreadable; skipping TMP source.', String(error));
    return null;
  }
}

async function main() {
  let media: any[] = [];
  let people: any[] = [];
  let characters: any[] = [];
  let relationLookup: Record<number, any> = {};
  let inputSource: IngestInputSource | null = null;

  await initializeDatabaseDefaults();

  const sourceProvider = (process.env.SOURCE_PROVIDER ?? 'ANILIST').toUpperCase();
  const topAnime = Number(process.env.TOP_ANIME ?? 2500);
  const topManga = Number(process.env.TOP_MANGA ?? 2500);
  const batchAnime = Number(process.env.BATCH_ANIME ?? 50);
  const batchManga = Number(process.env.BATCH_MANGA ?? 50);
  const cfgKey = [sourceProvider, topAnime, topManga, batchAnime, batchManga].join(':');

  if (hasDatabase()) {
    const dbData = await loadEntityMaps({ sourceProvider, configKey: cfgKey });
    if (dbData.media.length || dbData.people.length || dbData.characters.length) {
      media = dbData.media;
      people = dbData.people;
      characters = dbData.characters;
      relationLookup = dbData.relationLookup;
      inputSource = 'DATABASE';
    }
  }

  if (!inputSource) {
    const tmp = await loadFromTmpIfExplicitlyEnabled();
    if (tmp) {
      media = tmp.media;
      people = tmp.people;
      characters = tmp.characters;
      relationLookup = tmp.relationLookup;
      inputSource = 'TMP_DIR';
    }
  }

  if (!inputSource) {
    const committedMedia = await loadChunked('media');
    const committedPeople = await loadChunked('people');
    const committedCharacters = await loadChunked('characters');
    if (committedMedia.length || committedPeople.length || committedCharacters.length) {
      media = committedMedia;
      people = committedPeople;
      characters = committedCharacters;
      relationLookup = await readJsonFile<Record<number, any>>(path.join(DATA_DIR, 'meta', 'media_rel_lookup.json')).catch(() => ({}));
      inputSource = 'COMMITTED_DATA';
    }
  }

  if (!inputSource) {
    const available = hasDatabase() ? await listConfigKeys(sourceProvider) : [];
    const hints = available
      .slice(0, 10)
      .map((entry) => `${entry.configKey} (m:${entry.mediaCount},p:${entry.peopleCount},c:${entry.charactersCount})`)
      .join(', ');
    throw new Error(
      `No ingest entities found for config key ${cfgKey}. ` +
      `Available sqlite config keys: ${hints || '(none)'}. ` +
      'SQLite is the required durable source for CI artifact builds. ' +
      'Run ingest:batched first with matching SOURCE_PROVIDER/TOP_* and BATCH_* env vars, or commit valid data/ artifacts.'
    );
  }

  console.info('[info] buildArtifacts ingest input source', {
    source: inputSource,
    configKey: cfgKey,
    media: media.length,
    people: people.length,
    characters: characters.length
  });

  await fs.mkdir(path.join(DATA_DIR, 'indices'), { recursive: true });
  await fs.mkdir(path.join(DATA_DIR, 'meta'), { recursive: true });
  await fs.mkdir(path.join(DATA_DIR, 'graph'), { recursive: true });

  const points = buildMapCoords(media);
  const pointsPath = path.join(DATA_DIR, 'points.bin');
  await fs.writeFile(pointsPath, packPoints(points));

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

  const mediaRelPath = path.join(DATA_DIR, 'graph', 'media_rel.bin');
  const mediaCreditsPath = path.join(DATA_DIR, 'graph', 'media_credits.bin');
  const personCollabPath = path.join(DATA_DIR, 'graph', 'person_collab.bin');
  await fs.writeFile(mediaRelPath, packGraphEdges(mediaRel));
  await fs.writeFile(mediaCreditsPath, packGraphEdges(mediaCredits));
  await fs.writeFile(personCollabPath, packGraphEdges(personCollab));

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
  const manifestPath = path.join(DATA_DIR, 'manifest.json');
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));

  const keyOutputs = [manifestPath, pointsPath, mediaRelPath, mediaCreditsPath, personCollabPath];
  const fileSizes = await Promise.all(
    keyOutputs.map(async (filePath) => ({ filePath, size: (await fs.stat(filePath)).size }))
  );

  console.info('[info] buildArtifacts output summary', {
    generatedAt: manifest.generatedAt,
    outputDir: DATA_DIR,
    counts: manifest.counts,
    fileSizes
  });
}

main().then(async () => {
  await closePool();
}).catch(async (error) => {
  console.error(error);
  await closePool();
  process.exit(1);
});
