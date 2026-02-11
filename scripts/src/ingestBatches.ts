import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { BUILD_CONFIG, TMP_DIR } from './config.js';
import { queryAniList } from './anilistClient.js';
import { normalizeRole } from './roleNormalize.js';
import { logger } from './utils/logger.js';
import { fetchJikanFallback, fetchJikanMediaDetail, fetchJikanTopIds } from './jikanClient.js';

const execFileAsync = promisify(execFile);

const BATCH_ANIME = Number(process.env.BATCH_ANIME ?? 50);
const BATCH_MANGA = Number(process.env.BATCH_MANGA ?? 50);
const BATCH_SIZE = BATCH_ANIME + BATCH_MANGA;
const TOP_ANIME = Number(process.env.TOP_ANIME ?? 50_000);
const TOP_MANGA = Number(process.env.TOP_MANGA ?? 50_000);
const MAX_BATCH_RETRIES = Number(process.env.BATCH_MAX_RETRIES ?? 6);
const DRY_RUN = process.argv.includes('--dry-run');
const SOURCE_PROVIDER = (process.env.SOURCE_PROVIDER ?? 'JIKAN').toUpperCase();

const statePath = path.join(TMP_DIR, 'batchState.json');
const mediaPath = path.join(TMP_DIR, 'mediaDetails.json');
const peoplePath = path.join(TMP_DIR, 'people.json');
const charsPath = path.join(TMP_DIR, 'characters.json');
const relPath = path.join(TMP_DIR, 'relationLookup.json');

const topQuery = `
query TopMedia($page:Int!,$perPage:Int!,$type:MediaType!){
  Page(page:$page, perPage:$perPage){
    media(type:$type, sort:POPULARITY_DESC){ id type popularity }
  }
}`;

const mediaQuery = `
query MediaDetail($id:Int,$idMal:Int,$type:MediaType){
  Media(id:$id,idMal:$idMal,type:$type){
    id idMal type format popularity averageScore siteUrl
    studios{ nodes{ id name siteUrl isAnimationStudio } }
    title{romaji english native}
    startDate{year}
    genres
    tags{ name rank }
    relations{ edges{ relationType node{ id } } }
    staff(perPage:50){ edges{ role node{ id name{full native alternative} siteUrl description(asHtml:false) } } }
    characters(perPage:25){
      edges{
        role
        node{ id name{full native} siteUrl }
        jpVoice: voiceActors(language:JAPANESE, sort:[RELEVANCE,ID]){ id name{full native} siteUrl languageV2 }
        enVoice: voiceActors(language:ENGLISH, sort:[RELEVANCE,ID]){ id name{full native} siteUrl languageV2 }
        allVoice: voiceActors(sort:[RELEVANCE,ID]){ id name{full native} siteUrl languageV2 }
      }
    }
  }
}`;

const relationLookupQuery = `
query RelationLite($id:Int!){
  Media(id:$id){
    id type format siteUrl
    startDate{year}
    title{romaji english native}
  }
}`;

type BatchStatus = 'pending' | 'done' | 'failed';
type Seed = { anilistId?: number; malId?: number; type: 'ANIME' | 'MANGA' };
type BatchState = { batchId: number; animeSeeds: Seed[]; mangaSeeds: Seed[]; status: BatchStatus; attempts: number; lastError?: string };
type StateFile = { createdAt: string; updatedAt: string; config: Record<string, number | string>; batches: BatchState[] };

type Person = { id: number; name: unknown; siteUrl?: string; works: number[]; socialLinks: Array<{ label: string; url: string }> };
type Character = { id: number; name: unknown; siteUrl?: string };

function isLocalizationRole(role?: string): boolean {
  if (!role) return false;
  const normalized = role.toLowerCase();
  return /(translat|locali[sz]ation|letter|typeset|proofread|subtit|dub|dubb|adr|adaptation|editor\s*\(|portuguese|spanish|french|german|italian|polish|arabic|thai|turkish|russian|english)/i.test(normalized);
}

function dedupeById<T extends { id?: number }>(arr: T[]): T[] {
  const seen = new Set<number>();
  const out: T[] = [];
  for (const item of arr) {
    if (!item.id || seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}

function splitVoiceActorsByLanguage(actors: any[]): { voiceActorsJP: any[]; voiceActorsEN: any[] } {
  const voiceActorsJP = dedupeById(
    actors
      .filter((va: any) => {
        const lang = String(va?.languageV2 ?? '').toLowerCase();
        return lang.includes('japanese') || lang === 'jp';
      })
      .map((va: any) => ({ id: va.id, name: va.name, siteUrl: va.siteUrl }))
  );

  const voiceActorsEN = dedupeById(
    actors
      .filter((va: any) => {
        const lang = String(va?.languageV2 ?? '').toLowerCase();
        return lang.includes('english') || lang === 'en';
      })
      .map((va: any) => ({ id: va.id, name: va.name, siteUrl: va.siteUrl }))
  );

  return { voiceActorsJP, voiceActorsEN };
}

function extractUrls(text?: string): string[] {
  if (!text) return [];
  const matches = text.match(/https?:\/\/[^\s)]+/g) ?? [];
  return [...new Set(matches)];
}

function toSocialLinks(person: any): Array<{ label: string; url: string }> {
  const links = extractUrls(person?.description);
  return links.slice(0, 8).map((url) => ({
    label: url.includes('twitter.com') || url.includes('x.com') ? 'Twitter/X' : url.includes('instagram.com') ? 'Instagram' : url.includes('youtube.com') ? 'YouTube' : 'External',
    url
  }));
}


async function writeJsonArrayStream<T>(filePath: string, values: Iterable<T>): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const chunks: string[] = ['['];
  let first = true;
  for (const value of values) {
    const serialized = JSON.stringify(value);
    if (!serialized) continue;
    if (!first) chunks.push(',');
    chunks.push(serialized);
    first = false;
    if (chunks.length >= 2048) {
      await fs.appendFile(filePath, chunks.join(''));
      chunks.length = 0;
    }
  }
  chunks.push(']');
  if (chunks.length) {
    await fs.appendFile(filePath, chunks.join(''));
  }
}

async function writeJsonObjectStream(filePath: string, value: Record<number, any>): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const chunks: string[] = ['{'];
  let first = true;
  for (const [k, v] of Object.entries(value)) {
    const serialized = JSON.stringify(v);
    if (!serialized) continue;
    if (!first) chunks.push(',');
    chunks.push(JSON.stringify(k), ':', serialized);
    first = false;
    if (chunks.length >= 2048) {
      await fs.appendFile(filePath, chunks.join(''));
      chunks.length = 0;
    }
  }
  chunks.push('}');
  if (chunks.length) {
    await fs.appendFile(filePath, chunks.join(''));
  }
}
async function readJsonOr<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function canonicalId(type: 'ANIME' | 'MANGA', rawId: number): number {
  return type === 'MANGA' ? rawId + 1_000_000_000 : rawId;
}

async function fetchTop(type: 'ANIME' | 'MANGA', targetCount: number): Promise<Seed[]> {
  if (SOURCE_PROVIDER === 'JIKAN') {
    const malIds = await fetchJikanTopIds(type, targetCount);
    return malIds.map((malId) => ({ malId, type }));
  }

  const pages = Math.ceil(targetCount / BUILD_CONFIG.pageSize);
  const seeds: Seed[] = [];
  for (let page = 1; page <= pages; page += 1) {
    const data = await queryAniList<{ Page: { media: Array<{ id: number }> } }>(topQuery, {
      page,
      perPage: BUILD_CONFIG.pageSize,
      type
    });
    seeds.push(...data.Page.media.map((m) => ({ anilistId: m.id, type })));
  }
  return seeds.slice(0, targetCount);
}

function makeBatches(animeSeeds: Seed[], mangaSeeds: Seed[]): BatchState[] {
  const batchCount = Math.max(Math.ceil(animeSeeds.length / BATCH_ANIME), Math.ceil(mangaSeeds.length / BATCH_MANGA));
  const batches: BatchState[] = [];
  for (let i = 0; i < batchCount; i += 1) {
    batches.push({
      batchId: i,
      animeSeeds: animeSeeds.slice(i * BATCH_ANIME, (i + 1) * BATCH_ANIME),
      mangaSeeds: mangaSeeds.slice(i * BATCH_MANGA, (i + 1) * BATCH_MANGA),
      status: 'pending',
      attempts: 0
    });
  }
  return batches;
}

function mergePerson(prev: Person | undefined, next: Person): Person {
  if (!prev) return next;
  const works = [...new Set([...prev.works, ...next.works])];
  const socialLinks = dedupeById(next.socialLinks.map((x, i) => ({ id: i + 1, ...x })).concat(prev.socialLinks.map((x, i) => ({ id: i + 1000, ...x })))).map(({ label, url }) => ({ label, url }));
  return {
    id: prev.id,
    name: prev.name ?? next.name,
    siteUrl: prev.siteUrl ?? next.siteUrl,
    works,
    socialLinks
  };
}

async function buildArtifacts(): Promise<void> {
  if (DRY_RUN) return;
  const cmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  await execFileAsync(cmd, ['run', 'build:artifacts'], { cwd: process.cwd(), env: process.env });
}

async function processBatch(batch: BatchState, topIdSet: Set<number>, mediaById: Map<number, any>, peopleMap: Map<number, Person>, charMap: Map<number, Character>, relationLookup: Record<number, any>): Promise<void> {
  const seeds = [...batch.animeSeeds, ...batch.mangaSeeds];
  const relationIds = new Set<number>();

  for (const seed of seeds) {
    let m: any = null;
    if (SOURCE_PROVIDER === 'JIKAN' && seed.malId) {
      const detail = await fetchJikanMediaDetail(seed.type, seed.malId);
      if (!detail) continue;
      const id = canonicalId(seed.type, detail.malId);
      const relations = detail.relations.map((r) => ({ id: canonicalId(r.type, r.idMal), relationType: r.relationType }));
      mediaById.set(id, {
        id,
        idMal: detail.malId,
        type: seed.type,
        title: detail.title,
        year: detail.year,
        format: detail.format,
        popularity: detail.popularity,
        averageScore: detail.averageScore,
        siteUrl: detail.siteUrl,
        genres: detail.genres,
        tags: detail.tags,
        studios: detail.studios,
        staff: [],
        characters: [],
        relations
      });
      for (const rel of relations) relationIds.add(rel.id);
      continue;
    }

    const data = await queryAniList<{ Media: any }>(mediaQuery, { id: seed.anilistId, idMal: seed.malId, type: seed.type });
    m = data.Media;
    if (!m && seed.malId) {
      const fallback = await fetchJikanMediaDetail(seed.type, seed.malId);
      if (!fallback) continue;
      const id = canonicalId(seed.type, fallback.malId);
      const relations = fallback.relations.map((r) => ({ id: canonicalId(r.type, r.idMal), relationType: r.relationType }));
      mediaById.set(id, { id, idMal: fallback.malId, type: seed.type, title: fallback.title, year: fallback.year, format: fallback.format, popularity: fallback.popularity, averageScore: fallback.averageScore, siteUrl: fallback.siteUrl, genres: fallback.genres, tags: fallback.tags, studios: fallback.studios, staff: [], characters: [], relations });
      for (const rel of relations) relationIds.add(rel.id);
      continue;
    }
    if (!m) continue;

    const jikanFallback = await fetchJikanFallback(m.type, m.idMal ?? undefined);
    const studios = (m.studios?.nodes?.length ? m.studios.nodes : jikanFallback?.studios ?? []) as any[];
    const title = m.title?.romaji || m.title?.english || m.title?.native ? m.title : jikanFallback?.title ?? m.title;
    const year = m.startDate?.year ?? jikanFallback?.year ?? 0;

    const staff = (m.staff?.edges ?? [])
      .filter((edge: any) => !isLocalizationRole(edge.role || ''))
      .map((edge: any) => {
        const person = edge.node;
        if (person) {
          const nextPerson: Person = {
            id: person.id,
            name: person.name,
            siteUrl: person.siteUrl,
            works: [mediaId],
            socialLinks: toSocialLinks(person)
          };
          peopleMap.set(person.id, mergePerson(peopleMap.get(person.id), nextPerson));
        }
        return {
          personId: person?.id,
          roleRaw: edge.role,
          roleGroup: normalizeRole(edge.role)
        };
      });

    const characters = (m.characters?.edges ?? []).map((edge: any) => {
      const c = edge.node;
      if (c?.id) {
        charMap.set(c.id, { id: c.id, name: c.name, siteUrl: c.siteUrl });
      }

      const fallbackSplit = splitVoiceActorsByLanguage(edge.allVoice ?? []);
      const jp = dedupeById((edge.jpVoice ?? []).map((va: any) => ({ id: va.id, name: va.name, siteUrl: va.siteUrl }))); 
      const en = dedupeById((edge.enVoice ?? []).map((va: any) => ({ id: va.id, name: va.name, siteUrl: va.siteUrl })));

      const voiceActorsJP = jp.length ? jp : fallbackSplit.voiceActorsJP;
      const voiceActorsEN = en.length ? en : fallbackSplit.voiceActorsEN;

      for (const va of [...voiceActorsJP, ...voiceActorsEN]) {
        if (!va?.id) continue;
        const nextPerson: Person = {
          id: va.id,
          name: va.name,
          siteUrl: va.siteUrl,
          works: [mediaId],
          socialLinks: peopleMap.get(va.id)?.socialLinks ?? []
        };
        peopleMap.set(va.id, mergePerson(peopleMap.get(va.id), nextPerson));
      }

      return {
        characterId: c?.id,
        role: edge.role,
        voiceActorsJP,
        voiceActorsEN
      };
    });

    const resolvedType = m.type as 'ANIME' | 'MANGA';
    const mediaId = m.id ?? (m.idMal ? canonicalId(resolvedType, m.idMal) : undefined);
    if (!mediaId) continue;

    const relations = (m.relations?.edges ?? []).map((edge: any) => {
      const relType = String(edge.node?.type ?? '').toUpperCase().includes('MANGA') ? 'MANGA' : 'ANIME';
      const relId = edge.node?.id ?? (edge.node?.idMal ? canonicalId(relType as 'ANIME' | 'MANGA', edge.node.idMal) : undefined);
      if (!relId) return null;
      relationIds.add(relId);
      return { id: relId, relationType: edge.relationType };
    }).filter(Boolean);

    mediaById.set(mediaId, {
      id: mediaId,
      idMal: m.idMal ?? null,
      type: m.type,
      title,
      year,
      format: m.format,
      popularity: m.popularity,
      averageScore: m.averageScore,
      siteUrl: m.siteUrl,
      genres: m.genres ?? [],
      tags: (m.tags ?? []).map((t: any) => ({ name: t.name, rank: t.rank })),
      studios,
      staff,
      characters,
      relations
    });
  }

  if (SOURCE_PROVIDER !== 'JIKAN') {
    const missingRelationIds = [...relationIds].filter((id) => !topIdSet.has(id) && !relationLookup[id] && id < 1_000_000_000);
    for (const id of missingRelationIds) {
      const relData = await queryAniList<{ Media: any }>(relationLookupQuery, { id });
      const rel = relData.Media;
      if (!rel) continue;
      relationLookup[id] = {
        id: rel.id,
        type: rel.type,
        title: rel.title,
        year: rel.startDate?.year ?? 0,
        format: rel.format,
        siteUrl: rel.siteUrl
      };
    }
  }
}

async function persist(state: StateFile, mediaById: Map<number, any>, peopleMap: Map<number, Person>, charMap: Map<number, Character>, relationLookup: Record<number, any>): Promise<void> {
  state.updatedAt = new Date().toISOString();
  await fs.mkdir(TMP_DIR, { recursive: true });
  await fs.writeFile(statePath, JSON.stringify(state, null, 2));

  await fs.rm(mediaPath, { force: true });
  await fs.rm(peoplePath, { force: true });
  await fs.rm(charsPath, { force: true });
  await fs.rm(relPath, { force: true });

  await writeJsonArrayStream(mediaPath, mediaById.values());
  await writeJsonArrayStream(peoplePath, peopleMap.values());
  await writeJsonArrayStream(charsPath, charMap.values());
  await writeJsonObjectStream(relPath, relationLookup);
}

async function main() {
  await fs.mkdir(TMP_DIR, { recursive: true });

  const [animeSeeds, mangaSeeds] = await Promise.all([fetchTop('ANIME', TOP_ANIME), fetchTop('MANGA', TOP_MANGA)]);
  logger.info('top lists fetched', { anime: animeSeeds.length, manga: mangaSeeds.length, batchSize: BATCH_SIZE, source: SOURCE_PROVIDER });

  const existingState = await readJsonOr<StateFile | null>(statePath, null);
  const targetBatches = makeBatches(animeSeeds, mangaSeeds);
  const state: StateFile = existingState ?? {
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    config: { TOP_ANIME, TOP_MANGA, BATCH_ANIME, BATCH_MANGA, BATCH_SIZE, MAX_BATCH_RETRIES, SOURCE_PROVIDER },
    batches: targetBatches
  };

  if (existingState) {
    const statusById = new Map(existingState.batches.map((b) => [b.batchId, b]));
    state.batches = targetBatches.map((b) => {
      const prev = statusById.get(b.batchId);
      return prev ? { ...b, status: prev.status, attempts: prev.attempts, lastError: prev.lastError } : b;
    });
  }

  const media = await readJsonOr<any[]>(mediaPath, []);
  const people = await readJsonOr<Person[]>(peoplePath, []);
  const characters = await readJsonOr<Character[]>(charsPath, []);
  const relationLookup = await readJsonOr<Record<number, any>>(relPath, {});

  const mediaById = new Map<number, any>(media.map((m) => [m.id, m]));
  const peopleMap = new Map<number, Person>(people.map((p) => [p.id, p]));
  const charMap = new Map<number, Character>(characters.map((c) => [c.id, c]));
  const topIdSet = new Set<number>([...animeSeeds, ...mangaSeeds].map((s) => s.anilistId ?? (s.malId ? canonicalId(s.type, s.malId) : 0)).filter(Boolean));

  let progress = true;
  while (progress) {
    progress = false;
    const pending = state.batches.filter((b) => b.status !== 'done' && b.attempts < MAX_BATCH_RETRIES);
    if (!pending.length) break;

    for (const batch of pending) {
      batch.attempts += 1;
      logger.info('processing batch', { batchId: batch.batchId, attempts: batch.attempts, size: batch.animeSeeds.length + batch.mangaSeeds.length });
      try {
        await processBatch(batch, topIdSet, mediaById, peopleMap, charMap, relationLookup);
        batch.status = 'done';
        delete batch.lastError;
        progress = true;
        await persist(state, mediaById, peopleMap, charMap, relationLookup);
        await buildArtifacts();
      } catch (error) {
        batch.status = 'failed';
        batch.lastError = String(error);
        logger.warn('batch failed', { batchId: batch.batchId, error: batch.lastError });
        await persist(state, mediaById, peopleMap, charMap, relationLookup);
      }
    }

    state.batches.forEach((b) => {
      if (b.status === 'failed' && b.attempts < MAX_BATCH_RETRIES) b.status = 'pending';
    });
  }

  const done = state.batches.filter((b) => b.status === 'done').length;
  const failed = state.batches.filter((b) => b.status !== 'done').length;
  logger.info('batch ingest summary', { done, failed, total: state.batches.length, media: mediaById.size, people: peopleMap.size, characters: charMap.size });

  if (failed > 0) {
    throw new Error(`Incomplete ingestion. Failed batches remaining: ${failed}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
