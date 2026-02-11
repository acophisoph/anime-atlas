import fs from 'node:fs/promises';
import path from 'node:path';
import { BUILD_CONFIG, CACHE_DIR, TMP_DIR } from './config.js';
import { closePool, ensureDbSchema, getLeaseOwner, hasDatabase, loadEntityMaps, loadOrCreateCheckpoint, releaseLease, renewLease, tryAcquireLease, updateCheckpointProgress, upsertBatchSnapshot } from './db.js';
import { queryAniList } from './anilistClient.js';
import { normalizeRole } from './roleNormalize.js';
import { logger } from './utils/logger.js';
import { fetchJikanFallback, fetchJikanMediaDetail, fetchJikanTopIds } from './jikanClient.js';

const BATCH_ANIME = Number(process.env.BATCH_ANIME ?? 50);
const BATCH_MANGA = Number(process.env.BATCH_MANGA ?? 50);
const BATCH_SIZE = BATCH_ANIME + BATCH_MANGA;
const TOP_ANIME = Number(process.env.TOP_ANIME ?? 2_500);
const TOP_MANGA = Number(process.env.TOP_MANGA ?? 2_500);
const MAX_BATCH_RETRIES = Number(process.env.BATCH_MAX_RETRIES ?? 6);
const MAX_SEED_SKIPS_PER_BATCH = Number(process.env.MAX_SEED_SKIPS_PER_BATCH ?? 1);
const SOURCE_PROVIDER = (process.env.SOURCE_PROVIDER ?? 'ANILIST').toUpperCase();
const RUN_BATCH_LIMIT = Number(process.env.RUN_BATCH_LIMIT ?? 0);
const TIME_BUDGET_MINUTES = Number(process.env.TIME_BUDGET_MINUTES ?? 0);

const CHECKPOINT_DIR = path.join(CACHE_DIR, 'batch-progress');
const statePath = path.join(TMP_DIR, 'batchState.json');
const mediaPath = path.join(TMP_DIR, 'mediaDetails.json');
const peoplePath = path.join(TMP_DIR, 'people.json');
const charsPath = path.join(TMP_DIR, 'characters.json');
const relPath = path.join(TMP_DIR, 'relationLookup.json');
const seedPath = path.join(TMP_DIR, 'seedCatalog.json');

const checkpointStatePath = path.join(CHECKPOINT_DIR, 'batchState.json');
const checkpointMediaPath = path.join(CHECKPOINT_DIR, 'mediaDetails.json');
const checkpointPeoplePath = path.join(CHECKPOINT_DIR, 'people.json');
const checkpointCharsPath = path.join(CHECKPOINT_DIR, 'characters.json');
const checkpointRelPath = path.join(CHECKPOINT_DIR, 'relationLookup.json');
const checkpointSeedPath = path.join(CHECKPOINT_DIR, 'seedCatalog.json');

const topQuery = `
query TopMedia($page:Int!,$perPage:Int!,$type:MediaType!){
  Page(page:$page, perPage:$perPage){
    media(type:$type, sort:POPULARITY_DESC){ id idMal type popularity }
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
    relations{ edges{ relationType node{ id idMal type } } }
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
type SeedCatalog = { anime: Seed[]; manga: Seed[]; source: string; updatedAt: string };

type Person = { id: number; name: unknown; siteUrl?: string; works: number[]; socialLinks: Array<{ label: string; url: string }> };
type Character = { id: number; name: unknown; siteUrl?: string };

type MediaRecord = {
  id: number;
  idMal: number | null;
  type: 'ANIME' | 'MANGA';
  title: any;
  year: number;
  format: string;
  popularity: number;
  averageScore: number;
  siteUrl: string;
  genres: string[];
  tags: Array<{ name: string; rank: number }>;
  studios: Array<{ id: number; name: string; siteUrl: string; isAnimationStudio: boolean }>;
  staff: any[];
  characters: any[];
  relations: Array<{ id: number; relationType: string }>;
};

function canonicalId(type: 'ANIME' | 'MANGA', rawId: number): number {
  return type === 'MANGA' ? rawId + 1_000_000_000 : rawId;
}

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

async function readJsonOr<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeJsonArrayStream<T>(filePath: string, values: Iterable<T>): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.rm(filePath, { force: true });
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
  if (chunks.length) await fs.appendFile(filePath, chunks.join(''));
}

async function writeJsonObjectStream(filePath: string, value: Record<number, any>): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.rm(filePath, { force: true });
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
  if (chunks.length) await fs.appendFile(filePath, chunks.join(''));
}

async function syncToCheckpoint(): Promise<void> {
  await fs.mkdir(CHECKPOINT_DIR, { recursive: true });
  const pairs: Array<[string, string]> = [
    [statePath, checkpointStatePath],
    [seedPath, checkpointSeedPath],
    [mediaPath, checkpointMediaPath],
    [peoplePath, checkpointPeoplePath],
    [charsPath, checkpointCharsPath],
    [relPath, checkpointRelPath]
  ];
  for (const [src, dst] of pairs) {
    try {
      await fs.copyFile(src, dst);
    } catch {
      // ignore missing files
    }
  }
}

async function restoreFromCheckpointIfNeeded(): Promise<void> {
  await fs.mkdir(TMP_DIR, { recursive: true });
  const pairs: Array<[string, string]> = [
    [checkpointStatePath, statePath],
    [checkpointSeedPath, seedPath],
    [checkpointMediaPath, mediaPath],
    [checkpointPeoplePath, peoplePath],
    [checkpointCharsPath, charsPath],
    [checkpointRelPath, relPath]
  ];
  for (const [src, dst] of pairs) {
    try {
      await fs.access(dst);
    } catch {
      try {
        await fs.copyFile(src, dst);
      } catch {
        // ignore missing checkpoint file
      }
    }
  }
}

async function fetchTop(type: 'ANIME' | 'MANGA', targetCount: number, existing: Seed[]): Promise<Seed[]> {
  if (existing.length >= targetCount) return existing.slice(0, targetCount);

  if (SOURCE_PROVIDER === 'JIKAN') {
    const malIds = await fetchJikanTopIds(type, targetCount);
    if (malIds.length < targetCount) {
      throw new Error(`Jikan top ${type} returned ${malIds.length}/${targetCount}.`);
    }
    return malIds.map((malId) => ({ malId, type }));
  }

  const pages = Math.ceil(targetCount / BUILD_CONFIG.pageSize);
  const seeds: Seed[] = [];
  for (let page = 1; page <= pages; page += 1) {
    const data = await queryAniList<{ Page: { media: Array<{ id: number; idMal?: number | null }> } }>(topQuery, {
      page,
      perPage: BUILD_CONFIG.pageSize,
      type
    });
    seeds.push(...data.Page.media.map((m) => ({ anilistId: m.id, malId: m.idMal ?? undefined, type })));
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



function configKey(): string {
  return [SOURCE_PROVIDER, TOP_ANIME, TOP_MANGA, BATCH_ANIME, BATCH_MANGA].join(':');
}

function shouldStopForTimeBudget(startMs: number): boolean {
  if (TIME_BUDGET_MINUTES <= 0) return false;
  const elapsedMs = Date.now() - startMs;
  const thresholdMs = Math.max(1, TIME_BUDGET_MINUTES - 5) * 60_000;
  return elapsedMs >= thresholdMs;
}
async function persist(state: StateFile, mediaById: Map<number, MediaRecord>, peopleMap: Map<number, Person>, charMap: Map<number, Character>, relationLookup: Record<number, any>, seedCatalog: SeedCatalog): Promise<void> {
  state.updatedAt = new Date().toISOString();
  seedCatalog.updatedAt = new Date().toISOString();

  await fs.mkdir(TMP_DIR, { recursive: true });
  await fs.writeFile(statePath, JSON.stringify(state, null, 2));
  await fs.writeFile(seedPath, JSON.stringify(seedCatalog, null, 2));
  await writeJsonArrayStream(mediaPath, mediaById.values());
  await writeJsonArrayStream(peoplePath, peopleMap.values());
  await writeJsonArrayStream(charsPath, charMap.values());
  await writeJsonObjectStream(relPath, relationLookup);
  await syncToCheckpoint();
}



async function persistToDatabase(params: {
  cfgKey: string;
  checkpointId: number;
  nextBatchId: number;
  lastCompletedBatchId: number;
  status: 'running' | 'success' | 'failed';
  lastError: string | null;
  mediaById: Map<number, MediaRecord>;
  peopleMap: Map<number, Person>;
  charMap: Map<number, Character>;
  relationLookup: Record<number, any>;
}): Promise<void> {
  if (!hasDatabase()) return;
  await upsertBatchSnapshot({
    sourceProvider: SOURCE_PROVIDER,
    configKey: params.cfgKey,
    checkpointId: params.checkpointId,
    nextBatchId: params.nextBatchId,
    lastCompletedBatchId: params.lastCompletedBatchId,
    checkpointStatus: params.status,
    lastError: params.lastError,
    media: [...params.mediaById.values()].map((item) => ({ id: item.id, payload: item })),
    people: [...params.peopleMap.values()].map((item) => ({ id: item.id, payload: item })),
    characters: [...params.charMap.values()].map((item) => ({ id: item.id, payload: item })),
    relations: Object.entries(params.relationLookup).map(([id, payload]) => ({ id: Number(id), payload }))
  });
}
async function resolveAniListMedia(seed: Seed): Promise<any | null> {
  const data = await queryAniList<{ Media: any }>(mediaQuery, { id: seed.anilistId, idMal: seed.malId, type: seed.type });
  return data.Media ?? null;
}

async function processBatch(batch: BatchState, topIdSet: Set<number>, mediaById: Map<number, MediaRecord>, peopleMap: Map<number, Person>, charMap: Map<number, Character>, relationLookup: Record<number, any>): Promise<void> {
  const seeds = [...batch.animeSeeds, ...batch.mangaSeeds];
  const unresolved: string[] = [];
  const relationIds = new Set<number>();

  for (const seed of seeds) {
    if (SOURCE_PROVIDER === 'JIKAN' && seed.malId) {
      const detail = await fetchJikanMediaDetail(seed.type, seed.malId);
      if (!detail) {
        const fallbackAni = await resolveAniListMedia(seed);
        if (!fallbackAni) {
          unresolved.push(`${seed.type}:${seed.malId}:jikan-and-anilist-missing`);
          continue;
        }
        seed.anilistId = fallbackAni.id;
      } else {
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
    }

    const m = await resolveAniListMedia(seed);
    if (!m) {
      unresolved.push(`${seed.type}:${seed.anilistId ?? seed.malId}:anilist-missing`);
      continue;
    }

    const resolvedType = m.type as 'ANIME' | 'MANGA';
    const mediaId = m.id ?? (m.idMal ? canonicalId(resolvedType, m.idMal) : undefined);
    if (!mediaId) {
      unresolved.push(`${seed.type}:${seed.anilistId ?? seed.malId}:media-id-missing`);
      continue;
    }

    const jikanFallback = await fetchJikanFallback(resolvedType, m.idMal ?? undefined);
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
        return { personId: person?.id, roleRaw: edge.role, roleGroup: normalizeRole(edge.role) };
      });

    const characters = (m.characters?.edges ?? []).map((edge: any) => {
      const c = edge.node;
      if (c?.id) charMap.set(c.id, { id: c.id, name: c.name, siteUrl: c.siteUrl });

      const fallbackSplit = splitVoiceActorsByLanguage(edge.allVoice ?? []);
      const jp = dedupeById((edge.jpVoice ?? []).map((va: any) => ({ id: va.id, name: va.name, siteUrl: va.siteUrl })));
      const en = dedupeById((edge.enVoice ?? []).map((va: any) => ({ id: va.id, name: va.name, siteUrl: va.siteUrl })));
      const voiceActorsJP = jp.length ? jp : fallbackSplit.voiceActorsJP;
      const voiceActorsEN = en.length ? en : fallbackSplit.voiceActorsEN;

      for (const va of [...voiceActorsJP, ...voiceActorsEN]) {
        if (!va?.id) continue;
        const nextPerson: Person = { id: va.id, name: va.name, siteUrl: va.siteUrl, works: [mediaId], socialLinks: peopleMap.get(va.id)?.socialLinks ?? [] };
        peopleMap.set(va.id, mergePerson(peopleMap.get(va.id), nextPerson));
      }

      return { characterId: c?.id, role: edge.role, voiceActorsJP, voiceActorsEN };
    });

    const relations = (m.relations?.edges ?? [])
      .map((edge: any) => {
        const relType = String(edge.node?.type ?? '').toUpperCase().includes('MANGA') ? 'MANGA' : 'ANIME';
        const relId = edge.node?.id ?? (edge.node?.idMal ? canonicalId(relType as 'ANIME' | 'MANGA', edge.node.idMal) : undefined);
        if (!relId) return null;
        relationIds.add(relId);
        return { id: relId, relationType: edge.relationType };
      })
      .filter(Boolean) as Array<{ id: number; relationType: string }>;

    mediaById.set(mediaId, {
      id: mediaId,
      idMal: m.idMal ?? null,
      type: resolvedType,
      title,
      year,
      format: m.format,
      popularity: m.popularity ?? 0,
      averageScore: m.averageScore ?? 0,
      siteUrl: m.siteUrl,
      genres: m.genres ?? [],
      tags: (m.tags ?? []).map((t: any) => ({ name: t.name, rank: t.rank })),
      studios,
      staff,
      characters,
      relations
    });
  }

  if (unresolved.length > MAX_SEED_SKIPS_PER_BATCH) {
    throw new Error(`Batch ${batch.batchId} unresolved ${unresolved.length}/${seeds.length}: ${unresolved.slice(0, 8).join(',')}`);
  }

  if (SOURCE_PROVIDER !== 'JIKAN') {
    const missingRelationIds = [...relationIds].filter((id) => !topIdSet.has(id) && !relationLookup[id] && id < 1_000_000_000);
    for (const id of missingRelationIds) {
      const relData = await queryAniList<{ Media: any }>(relationLookupQuery, { id });
      const rel = relData.Media;
      if (!rel) continue;
      relationLookup[id] = { id: rel.id, type: rel.type, title: rel.title, year: rel.startDate?.year ?? 0, format: rel.format, siteUrl: rel.siteUrl };
    }
  }
}


async function main() {
  const startedAtMs = Date.now();
  let shutdownRequested = false;
  const cfgKey = configKey();
  const leaseOwner = getLeaseOwner();
  let checkpointId: number | null = null;
  let leaseAcquired = false;

  const requestShutdown = (signal: string) => {
    logger.warn('shutdown signal received; will stop before starting next batch', { signal });
    shutdownRequested = true;
  };
  process.once('SIGTERM', () => requestShutdown('SIGTERM'));
  process.once('SIGINT', () => requestShutdown('SIGINT'));

  await restoreFromCheckpointIfNeeded();

  if (!hasDatabase()) {
    throw new Error('DATABASE_URL must be set. Durable checkpointing requires a real database.');
  }

  await ensureDbSchema();

  const existingSeedCatalog = await readJsonOr<SeedCatalog>(seedPath, { anime: [], manga: [], source: SOURCE_PROVIDER, updatedAt: new Date().toISOString() });
  const animeSeeds = await fetchTop('ANIME', TOP_ANIME, existingSeedCatalog.source === SOURCE_PROVIDER ? existingSeedCatalog.anime : []);
  const mangaSeeds = await fetchTop('MANGA', TOP_MANGA, existingSeedCatalog.source === SOURCE_PROVIDER ? existingSeedCatalog.manga : []);

  const seedCatalog: SeedCatalog = { anime: animeSeeds, manga: mangaSeeds, source: SOURCE_PROVIDER, updatedAt: new Date().toISOString() };
  logger.info('top lists fetched', { anime: animeSeeds.length, manga: mangaSeeds.length, batchSize: BATCH_SIZE, source: SOURCE_PROVIDER });

  const checkpoint = await loadOrCreateCheckpoint({
    sourceProvider: SOURCE_PROVIDER,
    dataset: 'anime_manga',
    configKey: cfgKey,
    topAnime: TOP_ANIME,
    topManga: TOP_MANGA
  });

  checkpointId = checkpoint.id;
  leaseAcquired = await tryAcquireLease(checkpoint.id, leaseOwner, 30);
  if (!leaseAcquired) {
    logger.info('ingest lease is held by another runner; exiting cleanly', { checkpointId: checkpoint.id });
    return;
  }

  const targetBatches = makeBatches(animeSeeds, mangaSeeds);
  const state: StateFile = {
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    config: { TOP_ANIME, TOP_MANGA, BATCH_ANIME, BATCH_MANGA, BATCH_SIZE, MAX_BATCH_RETRIES, MAX_SEED_SKIPS_PER_BATCH, SOURCE_PROVIDER },
    batches: targetBatches.map((b) => ({ ...b, status: b.batchId < checkpoint.nextBatchId ? 'done' : 'pending' }))
  };

  const existingDbData = await loadEntityMaps({ sourceProvider: SOURCE_PROVIDER, configKey: cfgKey });
  const media = existingDbData.media as MediaRecord[];
  const people = existingDbData.people as Person[];
  const characters = existingDbData.characters as Character[];
  const relationLookup = existingDbData.relationLookup;

  const mediaById = new Map<number, MediaRecord>(media.map((m) => [m.id, m]));
  const peopleMap = new Map<number, Person>(people.map((p) => [p.id, p]));
  const charMap = new Map<number, Character>(characters.map((c) => [c.id, c]));
  const topIdSet = new Set<number>([...animeSeeds, ...mangaSeeds].map((seed) => seed.anilistId ?? (seed.malId ? canonicalId(seed.type, seed.malId) : 0)).filter(Boolean));

  let processedThisRun = 0;
  let lastCompleted = Math.max(-1, checkpoint.lastCompletedBatchId);

  for (const batch of state.batches) {
    if (batch.batchId < checkpoint.nextBatchId) continue;

    if (RUN_BATCH_LIMIT > 0 && processedThisRun >= RUN_BATCH_LIMIT) {
      logger.info('run batch limit reached', { RUN_BATCH_LIMIT, processedThisRun });
      break;
    }

    if (shutdownRequested || shouldStopForTimeBudget(startedAtMs)) {
      logger.info('graceful stop before next batch', { shutdownRequested, TIME_BUDGET_MINUTES });
      break;
    }

    batch.attempts += 1;
    logger.info('processing batch', { batchId: batch.batchId, attempts: batch.attempts, size: batch.animeSeeds.length + batch.mangaSeeds.length });

    try {
      await processBatch(batch, topIdSet, mediaById, peopleMap, charMap, relationLookup);
      batch.status = 'done';
      delete batch.lastError;
      processedThisRun += 1;
      lastCompleted = batch.batchId;

      await persist(state, mediaById, peopleMap, charMap, relationLookup, seedCatalog);
      await persistToDatabase({
        cfgKey,
        checkpointId: checkpoint.id,
        nextBatchId: batch.batchId + 1,
        lastCompletedBatchId: batch.batchId,
        status: 'running',
        lastError: null,
        mediaById,
        peopleMap,
        charMap,
        relationLookup
      });
      await renewLease(checkpoint.id, leaseOwner, 30);
    } catch (error) {
      batch.status = 'failed';
      batch.lastError = String(error);
      logger.warn('batch failed', { batchId: batch.batchId, error: batch.lastError });
      await persist(state, mediaById, peopleMap, charMap, relationLookup, seedCatalog);
      await updateCheckpointProgress(checkpoint.id, batch.batchId, lastCompleted, 'failed', batch.lastError);
      await renewLease(checkpoint.id, leaseOwner, 30);

      if (batch.attempts >= MAX_BATCH_RETRIES) {
        throw error;
      }
    }
  }

  const done = state.batches.filter((b) => b.status === 'done').length;
  const failed = state.batches.filter((b) => b.status === 'failed').length;
  logger.info('batch ingest summary', { done, failed, total: state.batches.length, media: mediaById.size, people: peopleMap.size, characters: charMap.size });

  const nextBatchId = Math.max(lastCompleted + 1, checkpoint.nextBatchId);
  const allDone = nextBatchId >= state.batches.length;
  await updateCheckpointProgress(checkpoint.id, nextBatchId, lastCompleted, allDone ? 'success' : 'running', null);
  await releaseLease(checkpoint.id, leaseOwner);
  await closePool();
}

main().catch(async (error) => {
  console.error(error);
  try {
    const leaseOwner = getLeaseOwner();
    // best effort release when id can be inferred from env-driven single checkpoint
    if (hasDatabase()) {
      // no-op if lease owner doesn't match
      const checkpoint = await loadOrCreateCheckpoint({ sourceProvider: SOURCE_PROVIDER, dataset: 'anime_manga', configKey: configKey(), topAnime: TOP_ANIME, topManga: TOP_MANGA });
      await releaseLease(checkpoint.id, leaseOwner);
    }
    await closePool();
  } catch {
    // ignore shutdown error
  }
  process.exit(1);
});
