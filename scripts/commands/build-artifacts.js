#!/usr/bin/env node
/**
 * Build all static artifacts from SQLite into data/.
 * Safe to run on partial datasets — always produces valid output.
 */
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { openDb } from '../db/migrate.js';
import {
  buildMediaFeatureVectors, buildPeopleFeatureVectors,
  computeCoordinates, normalizeCoords
} from '../lib/coordinates.js';
import { clusterPoints } from '../lib/clustering.js';
import { writePointsBin, writeGraphBin } from '../lib/binary-writer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH  = process.env.DB_PATH ?? path.join(__dirname, '..', '.cache', 'anime-atlas.sqlite');
const DATA_DIR = process.env.DATA_DIR ?? path.join(__dirname, '..', '..', 'data');
const META_CHUNK_SIZE = 500;
const STAFF_OVERLAP_K = 30;
const COLLAB_K = 30;
const STAFF_OVERLAP_THRESHOLD = 1.5; // min weighted overlap score

function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }

async function main() {
  const db = openDb(DB_PATH);
  ensureDir(DATA_DIR);
  ensureDir(path.join(DATA_DIR, 'meta'));
  ensureDir(path.join(DATA_DIR, 'index'));
  ensureDir(path.join(DATA_DIR, 'lookup'));

  console.log('[artifacts] Loading data from SQLite...');

  const mediaRows = db.prepare('SELECT * FROM media ORDER BY id ASC').all();
  const peopleRows = db.prepare('SELECT * FROM people ORDER BY id ASC').all();
  const creditRows = db.prepare('SELECT * FROM credits').all();
  const relationRows = db.prepare('SELECT * FROM media_relations').all();

  console.log(`[artifacts] media=${mediaRows.length} people=${peopleRows.length} credits=${creditRows.length}`);

  // Batch stats
  const batchStats = db.prepare(
    'SELECT status, COUNT(*) as n FROM batches GROUP BY status'
  ).all();
  const statsMap = Object.fromEntries(batchStats.map(r => [r.status, r.n]));
  const totalMedia = mediaRows.length;
  const totalPeople = peopleRows.length;
  const doneCount = statsMap.DONE ?? 0;
  const pendingCount = (statsMap.PENDING ?? 0) + (statsMap.RUNNING ?? 0);
  const failedCount = statsMap.FAILED ?? 0;

  // Completeness checks
  const mediaWithStaff = new Set(
    db.prepare("SELECT DISTINCT media_id FROM credits WHERE is_voice_actor=0").all().map(r => r.media_id)
  );
  const mediaWithChars = new Set(
    db.prepare("SELECT DISTINCT media_id FROM character_appearances").all().map(r => r.media_id)
  );
  const hasStaffForAll = mediaRows.length > 0 && mediaRows.every(m => mediaWithStaff.has(m.id));
  const hasCharsForAll = mediaRows.length > 0 && mediaRows.every(m => mediaWithChars.has(m.id));

  // Only plot media that have real data (exclude relation stubs with no genres/tags/popularity)
  const plottableMedia = mediaRows.filter(m =>
    m.popularity > 0 || m.genres_json !== '[]' || m.tags_json !== '[]'
  );
  console.log(`[artifacts] Plottable media: ${plottableMedia.length} / ${mediaRows.length} (${mediaRows.length - plottableMedia.length} stubs excluded from plot)`);

  // --- COORDINATES ---
  console.log('[artifacts] Computing media coordinates...');
  const { vectors: mediaVecs } = buildMediaFeatureVectors(plottableMedia);
  const mediaCoords = normalizeCoords(
    await computeCoordinates(mediaVecs, plottableMedia.map(m => m.id))
  );
  const mediaCoordsMap = new Map(mediaCoords.map(c => [c.id, c]));

  // Build credits maps for people
  const creditsMap = new Map();
  const mediaTagMap = new Map();
  for (const m of mediaRows) {
    const tags = JSON.parse(m.tags_json || '[]').map(t => t.name);
    mediaTagMap.set(m.id, tags);
  }
  for (const c of creditRows) {
    if (!creditsMap.has(c.person_id)) creditsMap.set(c.person_id, []);
    creditsMap.get(c.person_id).push(c);
  }

  console.log('[artifacts] Computing people coordinates...');
  const { vectors: peopleVecs } = buildPeopleFeatureVectors(peopleRows, creditsMap, mediaTagMap);
  const peopleCoords = normalizeCoords(
    await computeCoordinates(peopleVecs, peopleRows.map(p => p.id))
  );
  const peopleCoordsMap = new Map(peopleCoords.map(c => [c.id, c]));

  // Genre → color palette (packed 0xRRGGBB)
  const GENRE_COLORS = {
    'Action': 0xef4444, 'Adventure': 0xf97316, 'Comedy': 0xeab308,
    'Drama': 0x22c55e, 'Fantasy': 0xa855f7, 'Romance': 0xec4899,
    'Sci-Fi': 0x06b6d4, 'Mystery': 0x6366f1, 'Horror': 0xdc2626,
    'Slice of Life': 0x84cc16, 'Sports': 0x14b8a6, 'Supernatural': 0x8b5cf6,
    'Music': 0xf59e0b, 'Psychological': 0x94a3b8, 'Mecha': 0x0ea5e9,
    'Ecchi': 0xf472b6, 'Mahou Shoujo': 0xe879f9, 'Harem': 0xfbbf24,
    'Thriller': 0x475569,
  };

  function resolveColor(coverColor, genresJson) {
    if (coverColor) {
      const s = coverColor.replace('#', '');
      if (s.length === 6) return parseInt(s, 16);
    }
    const genres = JSON.parse(genresJson || '[]');
    for (const g of genres) {
      if (GENRE_COLORS[g]) return GENRE_COLORS[g];
    }
    return 0x5b9cf6; // default blue
  }

  // --- POINTS.BIN ---
  const allPoints = [
    ...plottableMedia.map(m => {
      const c = mediaCoordsMap.get(m.id) ?? { x: 0, y: 0 };
      return {
        id: m.id, kind: 'media',
        x: c.x, y: c.y,
        popularity: m.popularity ?? 0,
        averageScore: m.average_score ?? 0,
        color: resolveColor(m.cover_color, m.genres_json),
      };
    }),
    ...peopleRows.map(p => {
      const c = peopleCoordsMap.get(p.id) ?? { x: 0, y: 0 };
      return {
        id: p.id, kind: 'person',
        x: c.x, y: c.y,
        popularity: 0, averageScore: 0,
        color: 0xf97316,
      };
    }),
  ];
  writePointsBin(path.join(DATA_DIR, 'points.bin'), allPoints);

  // --- CLUSTERS ---
  console.log('[artifacts] Clustering...');
  const clusters = await clusterPoints(allPoints, plottableMedia, peopleRows);
  fs.writeFileSync(
    path.join(DATA_DIR, 'clusters.json'),
    JSON.stringify(clusters, null, 2)
  );

  // --- GRAPH: media_relations ---
  console.log('[artifacts] Building media relations graph...');
  const relAdj = new Map();
  for (const r of relationRows) {
    if (!relAdj.has(r.media_id)) relAdj.set(r.media_id, []);
    relAdj.get(r.media_id).push({
      targetId: r.related_media_id,
      weight: 1.0,
      edgeType: r.relation_type,
    });
  }
  writeGraphBin(path.join(DATA_DIR, 'graph_media_relations.bin'), relAdj);

  // --- GRAPH: media_staff_overlap ---
  console.log('[artifacts] Building media staff overlap graph...');
  const mediaStaffAdj = buildStaffOverlapGraph(creditRows, STAFF_OVERLAP_THRESHOLD, STAFF_OVERLAP_K);
  writeGraphBin(path.join(DATA_DIR, 'graph_media_staff.bin'), mediaStaffAdj);

  // --- GRAPH: people_collab ---
  console.log('[artifacts] Building people collaboration graph...');
  const collabAdj = buildCollabGraph(creditRows, COLLAB_K);
  writeGraphBin(path.join(DATA_DIR, 'graph_people_collab.bin'), collabAdj);

  // --- META CHUNKS ---
  console.log('[artifacts] Writing meta chunks...');
  const mediaChunkMap = {};
  for (let i = 0; i < mediaRows.length; i += META_CHUNK_SIZE) {
    const chunk = mediaRows.slice(i, i + META_CHUNK_SIZE);
    const chunkIdx = Math.floor(i / META_CHUNK_SIZE);
    const fname = `media_${String(chunkIdx).padStart(5, '0')}.json`;
    const chunkData = {};
    for (const m of chunk) {
      chunkData[m.id] = {
        id: m.id, type: m.type, format: m.format,
        seasonYear: m.season_year, popularity: m.popularity,
        averageScore: m.average_score,
        title: { romaji: m.title_romaji, english: m.title_english, native: m.title_native },
        coverImage: { large: m.cover_large, color: m.cover_color },
        genres: JSON.parse(m.genres_json || '[]'),
        tags: JSON.parse(m.tags_json || '[]'),
        studios: JSON.parse(m.studios_json || '[]'),
      };
      mediaChunkMap[m.id] = fname;
    }
    fs.writeFileSync(path.join(DATA_DIR, 'meta', fname), JSON.stringify(chunkData));
  }

  const peopleChunkMap = {};
  for (let i = 0; i < peopleRows.length; i += META_CHUNK_SIZE) {
    const chunk = peopleRows.slice(i, i + META_CHUNK_SIZE);
    const chunkIdx = Math.floor(i / META_CHUNK_SIZE);
    const fname = `people_${String(chunkIdx).padStart(5, '0')}.json`;
    const chunkData = {};
    for (const p of chunk) {
      chunkData[p.id] = {
        id: p.id, nameFull: p.name_full, nameNative: p.name_native,
        language: p.language, imageLarge: p.image_large, siteUrl: p.site_url,
        description: p.description,
      };
      peopleChunkMap[p.id] = fname;
    }
    fs.writeFileSync(path.join(DATA_DIR, 'meta', fname), JSON.stringify(chunkData));
  }

  // --- LOOKUP ---
  fs.writeFileSync(
    path.join(DATA_DIR, 'lookup', 'media_to_meta_chunk.json'),
    JSON.stringify(mediaChunkMap)
  );
  fs.writeFileSync(
    path.join(DATA_DIR, 'lookup', 'people_to_meta_chunk.json'),
    JSON.stringify(peopleChunkMap)
  );

  // --- SEARCH INDEX ---
  console.log('[artifacts] Building search index...');
  const searchEntries = [
    ...mediaRows.map(m => ({
      id: m.id, kind: 'media',
      en: m.title_english || m.title_romaji || '',
      jp: m.title_native || m.title_romaji || '',
      ro: m.title_romaji || '',
      year: m.season_year,
      type: m.type,
    })),
    ...peopleRows.map(p => ({
      id: p.id, kind: 'person',
      en: p.name_full || '',
      jp: p.name_native || p.name_full || '',
      ro: p.name_full || '',
    })),
  ];
  fs.writeFileSync(path.join(DATA_DIR, 'index', 'search.json'), JSON.stringify(searchEntries));

  // --- TAG TO MEDIA ---
  const tagToMedia = {};
  for (const m of mediaRows) {
    const tags = JSON.parse(m.tags_json || '[]');
    for (const t of tags) {
      if (!tagToMedia[t.name]) tagToMedia[t.name] = [];
      tagToMedia[t.name].push(m.id);
    }
  }
  fs.writeFileSync(path.join(DATA_DIR, 'index', 'tag_to_media.json'), JSON.stringify(tagToMedia));

  // --- ROLE TO PEOPLE ---
  const roleTopeople = {};
  for (const c of creditRows) {
    if (c.is_localization) continue;
    const key = c.role || 'Unknown';
    if (!roleTopeople[key]) roleTopeople[key] = [];
    roleTopeople[key].push(c.person_id);
  }
  fs.writeFileSync(path.join(DATA_DIR, 'index', 'role_to_people.json'), JSON.stringify(roleTopeople));

  // --- MANIFEST ---
  const lastRunState = db.prepare(
    "SELECT value FROM ingest_state WHERE key='last_run_at'"
  ).get();
  const lastRunAt = lastRunState ? JSON.parse(lastRunState.value) : null;

  const manifest = {
    version: 1,
    generated_at: Date.now(),
    last_ingest_run_timestamp: lastRunAt,
    total_media_in_db: totalMedia,
    total_plottable_media: plottableMedia.length,
    total_people_in_db: totalPeople,
    completed_batches_count: doneCount,
    pending_batches_count: pendingCount,
    failed_batches_count: failedCount,
    completeness: {
      has_staff_for_all_media: hasStaffForAll,
      has_characters_for_all_media: hasCharsForAll,
      is_partial: pendingCount > 0 || totalMedia === 0,
    },
    artifacts: {
      points_count: allPoints.length,
      media_chunk_count: Math.ceil(mediaRows.length / META_CHUNK_SIZE),
      people_chunk_count: Math.ceil(peopleRows.length / META_CHUNK_SIZE),
    },
  };

  fs.writeFileSync(path.join(DATA_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log('[artifacts] manifest.json written:', manifest);

  db.close();
  console.log('[artifacts] Done!');
}

function buildStaffOverlapGraph(creditRows, threshold, K) {
  // Build inverted index: person -> [media_id, weight]
  const personToMedia = new Map();
  for (const c of creditRows) {
    if (c.is_localization || c.is_voice_actor) continue;
    if (!personToMedia.has(c.person_id)) personToMedia.set(c.person_id, []);
    personToMedia.get(c.person_id).push({ media_id: c.media_id, weight: c.weight || 1.0 });
  }

  // For each pair of media sharing a person, accumulate overlap score
  const overlapMap = new Map(); // "a:b" -> score
  for (const [, credits] of personToMedia) {
    for (let i = 0; i < credits.length; i++) {
      for (let j = i + 1; j < credits.length; j++) {
        const a = Math.min(credits[i].media_id, credits[j].media_id);
        const b = Math.max(credits[i].media_id, credits[j].media_id);
        const key = `${a}:${b}`;
        const w = Math.min(credits[i].weight, credits[j].weight);
        overlapMap.set(key, (overlapMap.get(key) || 0) + w);
      }
    }
  }

  // Build adjacency with threshold and top-K cap
  const rawAdj = new Map(); // mediaId -> [{targetId, weight}]
  for (const [key, score] of overlapMap) {
    if (score < threshold) continue;
    const [a, b] = key.split(':').map(Number);
    if (!rawAdj.has(a)) rawAdj.set(a, []);
    if (!rawAdj.has(b)) rawAdj.set(b, []);
    rawAdj.get(a).push({ targetId: b, weight: score, edgeType: 'STAFF_OVERLAP' });
    rawAdj.get(b).push({ targetId: a, weight: score, edgeType: 'STAFF_OVERLAP' });
  }

  // Cap to top K
  const adj = new Map();
  for (const [id, edges] of rawAdj) {
    adj.set(id, edges.sort((a, b) => b.weight - a.weight).slice(0, K));
  }
  return adj;
}

function buildCollabGraph(creditRows, K) {
  const personToMedia = new Map();
  for (const c of creditRows) {
    if (c.is_localization) continue;
    if (!personToMedia.has(c.person_id)) personToMedia.set(c.person_id, new Set());
    personToMedia.get(c.person_id).add(c.media_id);
  }

  const mediaToPersons = new Map();
  for (const c of creditRows) {
    if (c.is_localization) continue;
    if (!mediaToPersons.has(c.media_id)) mediaToPersons.set(c.media_id, []);
    mediaToPersons.get(c.media_id).push(c.person_id);
  }

  const collabCount = new Map(); // "a:b" -> count
  for (const [, persons] of mediaToPersons) {
    for (let i = 0; i < persons.length; i++) {
      for (let j = i + 1; j < persons.length; j++) {
        const a = Math.min(persons[i], persons[j]);
        const b = Math.max(persons[i], persons[j]);
        const key = `${a}:${b}`;
        collabCount.set(key, (collabCount.get(key) || 0) + 1);
      }
    }
  }

  const rawAdj = new Map();
  for (const [key, count] of collabCount) {
    const [a, b] = key.split(':').map(Number);
    if (!rawAdj.has(a)) rawAdj.set(a, []);
    if (!rawAdj.has(b)) rawAdj.set(b, []);
    rawAdj.get(a).push({ targetId: b, weight: count, edgeType: 'COLLAB' });
    rawAdj.get(b).push({ targetId: a, weight: count, edgeType: 'COLLAB' });
  }

  const adj = new Map();
  for (const [id, edges] of rawAdj) {
    adj.set(id, edges.sort((a, b) => b.weight - a.weight).slice(0, K));
  }
  return adj;
}

main().catch(e => { console.error(e); process.exit(1); });
