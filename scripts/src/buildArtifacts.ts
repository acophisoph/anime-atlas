import fs from 'node:fs/promises';
import path from 'node:path';
import { BASE_PATH, BUILD_CONFIG, DATA_DIR, TMP_DIR } from './config.js';
import { buildMapCoords } from './buildMapCoords.js';
import { buildIndices } from './buildIndices.js';
import { packGraphEdges, packPoints } from './packBinary.js';

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
  const media = JSON.parse(await fs.readFile(path.join(TMP_DIR, 'mediaDetails.json'), 'utf-8'));
  const people = JSON.parse(await fs.readFile(path.join(TMP_DIR, 'people.json'), 'utf-8'));
  const characters = JSON.parse(await fs.readFile(path.join(TMP_DIR, 'characters.json'), 'utf-8'));
  const relationLookup = JSON.parse(await fs.readFile(path.join(TMP_DIR, 'relationLookup.json'), 'utf-8').catch(() => '{}'));

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

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
