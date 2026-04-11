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

// Merge hyper-specific role variants into canonical names (mirrors ROLE_CONSOLIDATION in i18n.ts)
const ROLE_CONSOLIDATION = {
  '2nd Key Animation':                'Key Animation',
  'Main Animator':                    'Key Animation',
  'Key Frame Check':                  'Animation Check',
  'In-Between Animation Check':       'Animation Check',
  'In-Betweens Check':                'Animation Check',
  'In-Between Check':                 'Animation Check',
  'Digital In-Betweens Check':        'Animation Check',
  'Digital In-Between Animation':     'In-Between Animation',
  'Finish Animation':                 'In-Between Animation',
  'Flash Animation':                  'Animation',
  'Effect Animation Director':        'Animation Director',
  'Effects Animation Director':       'Animation Director',
  'Action Animation Director':        'Animation Director',
  'Mechanical Animation Director':    'Animation Director',
  'Character Animation Director':     'Animation Director',
  'Assistant Animation Director':     'Animation Director',
  'Assistant Character Animation Director': 'Animation Director',
  'Supervising Animation Director':   'Chief Animation Director',
  'Assistant Chief Animation Director': 'Chief Animation Director',
  'Chief Episode Director':           'Episode Director',
  'Special Episode Director':         'Episode Director',
  'Series Unit Director':             'Unit Director',
  'Guest Storyboard':                 'Storyboard',
  'Intro Storyboard':                 'Storyboard',
  'Opening Storyboard':               'Storyboard',
  'Outro Storyboard':                 'Storyboard',
  'Storyboard Composition':           'Storyboard',
  '3D CGI Director':                  '3D Director',
  'Director of 3D':                   '3D Director',
  'Background Design':                'Background Art',
  'Photography Director':             'Director of Photography',
  'Digital Photography':              'Photography',
  'CG Photography':                   'Photography',
  'Sub Series Composition':           'Series Composition',
  'Opening Animation Direction':      'Opening Animation',
  'Ending Animation Direction':       'Ending Animation',
};

/**
 * Normalise a raw AniList role string:
 *   - Strip episode qualifiers like " (ep 2)", " (eps 1-3)", " (ep.14)"
 *   - Consolidate hyper-specific variants into canonical role names
 *   - Return 'Unknown' for blank/garbage entries
 */
// Suffix patterns mirror canonicalRoleEN() in i18n.ts — keep in sync.
const ROLE_SUFFIX_PATTERNS = [
  [/\bChief Animation Director\b/,  'Chief Animation Director'],
  [/\bAnimation Director\b/,        'Animation Director'],
  [/\bEpisode Director\b/,          'Episode Director'],
  [/\bUnit Director\b/,             'Unit Director'],
  [/\bSeries Composition\b/,        'Series Composition'],
  [/\bCharacter Design\b/,          'Character Design'],
  [/\bMonster Design\b/,            'Monster Design'],
  [/\bMechanical Design\b/,         'Mechanical Design'],
  [/\bCreature Design\b/,           'Creature Design'],
  [/\bProp Design\b/,               'Prop Design'],
  [/\bMecha Design\b/,              'Mecha Design'],
  [/\bWeapon Design\b/,             'Weapon Design'],
  [/\bConcept Design\b/,            'Concept Design'],
  [/\bColor Design\b/,              'Color Design'],
  [/\bSet Design\b/,                'Set Design'],
  [/\bArt Director\b/,              'Art Director'],
  [/\bBackground Art\b/,            'Background Art'],
  [/\bKey Animation\b/,             'Key Animation'],
  [/\bIn-Between Animation\b/,      'In-Between Animation'],
  [/\bAnimation Check\b/,           'Animation Check'],
  [/\bSound Director\b/,            'Sound Director'],
  [/\bVoice Director\b/,            'Voice Director'],
  [/\bMusic Director\b/,            'Music Director'],
  [/\bCG Director\b/,               'CG Director'],
  [/\b3D Director\b/,               '3D Director'],
  [/\bDirector of Photography\b/,   'Director of Photography'],
  [/\bOriginal Creator\b/,          'Original Creator'],
  [/\bOriginal Character Design\b/, 'Original Character Design'],
  [/\bIllustration\b/,              'Illustration'],
  [/\bDesign\b/,                    'Character Design'],
  [/\bAnimation\b/,                 'Animation'],
  [/\bDirector\b/,                  'Director'],
  [/\bStoryboard\b/,                'Storyboard'],
  [/\bScript\b/,                    'Script'],
  [/\bScreenplay\b/,                'Screenplay'],
  [/\bPhotography\b/,               'Photography'],
  [/\bEditing\b/,                   'Editing'],
  [/\bRecording\b/,                 'Recording'],
  [/\bPlanning\b/,                  'Planning'],
  [/\bProduction\b/,                'Production'],
  [/\bMusic\b/,                     'Music'],
  [/\bArt\b/,                       'Art'],
];

function normalizeRole(raw) {
  if (!raw || typeof raw !== 'string') return 'Unknown';
  const clean = raw
    .replace(/^"[^"]*"\s*/, '')              // strip quoted title prefix
    .replace(/^「[^」]*」\s*/, '')             // Japanese quote variant
    .replace(/\s*\(ep[s.]?[^)]*\)\s*$/i, '') // strip episode qualifiers
    .replace(/\s*;[^)]*\)\s*$/, '')
    .trim();
  if (!clean || clean === ')' || /^\)+$/.test(clean)) return 'Unknown';
  const consolidated = ROLE_CONSOLIDATION[clean] ?? clean;
  // If explicit consolidation resolved it, done
  if (consolidated !== clean) return consolidated;
  // Suffix-pattern extraction for brand/character-specific strings
  for (const [pattern, canonical] of ROLE_SUFFIX_PATTERNS) {
    if (pattern.test(consolidated)) return canonical;
  }
  return consolidated;
}

// Color palette: person nodes colored by their primary creative role
const PERSON_ROLE_COLORS = {
  'Director': 0x8b5cf6, 'Series Director': 0x8b5cf6, 'General Director': 0x8b5cf6,
  'Chief Episode Director': 0x8b5cf6, 'Unit Director': 0x8b5cf6,
  'Character Design': 0xec4899, 'Original Character Design': 0xec4899,
  'Chief Animation Director': 0xdb2777,
  'Animation Director': 0x3b82f6, 'Supervising Animation Director': 0x3b82f6,
  'Key Animation': 0x06b6d4, '2nd Key Animation': 0x06b6d4,
  'In-Between Animation': 0x22d3ee, 'Animation Check': 0x22d3ee,
  'Music': 0xeab308, 'Music Producer': 0xeab308,
  'Theme Song Performance': 0xf59e0b, 'Insert Song Performance': 0xf59e0b,
  'Script': 0x22c55e, 'Screenplay': 0x22c55e, 'Series Composition': 0x16a34a,
  'Original Creator': 0x16a34a, 'Story': 0x22c55e,
  'Episode Director': 0x6366f1, 'Storyboard': 0x818cf8,
  'Art Director': 0x84cc16, 'Background Art': 0x84cc16,
  'Background Design': 0x65a30d, 'Color Design': 0xa3e635,
  'Producer': 0x14b8a6, 'Executive Producer': 0x0d9488,
  'Line Producer': 0x14b8a6, 'Production Manager': 0x14b8a6,
  'Sound Director': 0xf97316, 'Sound Effects': 0xfb923c,
  'Voice Actor': 0xfbbf24,
  'CG Director': 0x0ea5e9, '3D Director': 0x0ea5e9, '3D CGI Director': 0x0ea5e9,
  'Mechanical Design': 0x64748b, 'Mecha Design': 0x64748b,
};

function getPrimaryRoleColor(personId, creditsMap, mediaYearMap) {
  const credits = creditsMap.get(personId);
  if (!credits || !credits.length) return 0xf97316;
  const sorted = [...credits].sort((a, b) => {
    const wDiff = (b.weight || 1) - (a.weight || 1);
    if (Math.abs(wDiff) > 0.1) return wDiff;
    return (mediaYearMap.get(b.media_id) || 0) - (mediaYearMap.get(a.media_id) || 0);
  });
  for (const c of sorted) {
    const col = PERSON_ROLE_COLORS[normalizeRole(c.role)];
    if (col) return col;
  }
  return 0xf97316;
}

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

  // Only plot media that have genre data — ensures non-zero UMAP feature vectors
  // and a meaningful position on the map. Relation stubs with only popularity
  // (no genres/tags) produce zero vectors → spiral fallback → separate blob.
  const plottableMedia = mediaRows.filter(m => m.genres_json !== '[]');
  console.log(`[artifacts] Plottable media: ${plottableMedia.length} / ${mediaRows.length} (${mediaRows.length - plottableMedia.length} no-genre stubs excluded from plot)`);

  // --- COORDINATES ---
  // World scale: multiply normalised [-1,1] coords by √n × SCALE so the
  // world grows proportionally with the dataset.  At autoFit the whole map
  // fits in the viewport as a cluster overview (like Nomic Atlas / Map of
  // Reddit).  Zooming in reveals individual nodes — they are tiny at overview
  // and grow as the user zooms in.  The scale constant 5 gives ~40px between
  // nearest-neighbour nodes when zoomed in 10× from overview.
  const COORD_SCALE = 5;

  console.log('[artifacts] Computing media coordinates...');
  const { vectors: mediaVecs } = buildMediaFeatureVectors(plottableMedia);
  const rawMediaCoords = normalizeCoords(
    await computeCoordinates(mediaVecs, plottableMedia.map(m => m.id))
  );
  const mediaScale = Math.sqrt(Math.max(plottableMedia.length, 100)) * COORD_SCALE;
  const mediaCoords = rawMediaCoords.map(c => ({ ...c, x: c.x * mediaScale, y: c.y * mediaScale }));
  const mediaCoordsMap = new Map(mediaCoords.map(c => [c.id, c]));
  console.log(`[artifacts] Media world scale: ×${mediaScale.toFixed(1)} → range ±${mediaScale.toFixed(0)}`);

  // Build lookup maps for people credits
  const mediaYearMap = new Map(mediaRows.map(m => [m.id, m.season_year || 0]));
  const mediaRowsMap = new Map(mediaRows.map(m => [m.id, m]));
  const mediaPopMap  = new Map(mediaRows.map(m => [m.id, m.popularity ?? 0]));

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

  // Popularity proxy for people: sum of sqrt(mediaPop) across their credits.
  // sqrt dampens outliers so one mega-hit doesn't dominate.
  // Capped at 500k so the range fits the uint32 popularity field.
  const personPopMap = new Map();
  for (const [personId, credits] of creditsMap) {
    let score = 0;
    for (const c of credits) score += Math.sqrt(mediaPopMap.get(c.media_id) ?? 0);
    personPopMap.set(personId, Math.min(500_000, Math.round(score)));
  }

  console.log('[artifacts] Computing people coordinates...');
  const { vectors: peopleVecs } = buildPeopleFeatureVectors(peopleRows, creditsMap, mediaTagMap);
  const rawPeopleCoords = normalizeCoords(
    // Higher spread + lower minDist vs media: people share far more tag/role overlap
    // (everyone who worked on a romance show gets tagged 'Romance'), so we need to
    // push the UMAP embedding to spread clusters further apart visually.
    await computeCoordinates(peopleVecs, peopleRows.map(p => p.id), { minDist: 0.1, spread: 5.0 })
  );
  const peopleScale = Math.sqrt(Math.max(peopleRows.length, 100)) * COORD_SCALE;
  const peopleCoords = rawPeopleCoords.map(c => ({ ...c, x: c.x * peopleScale, y: c.y * peopleScale }));
  const peopleCoordsMap = new Map(peopleCoords.map(c => [c.id, c]));
  console.log(`[artifacts] People world scale: ×${peopleScale.toFixed(1)} → range ±${peopleScale.toFixed(0)}`);

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
        popularity: personPopMap.get(p.id) ?? 0, averageScore: 0,
        color: getPrimaryRoleColor(p.id, creditsMap, mediaYearMap),
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
      // Top credits: highest-weight roles, up to 8, with media title
      const personCredits = creditsMap.get(p.id) || [];
      const topCredits = personCredits
        .filter(c => !c.is_localization)
        .map(c => ({ ...c, nRole: normalizeRole(c.role), year: mediaYearMap.get(c.media_id) || 0 }))
        .sort((a, b) => {
          const wDiff = (b.weight || 1) - (a.weight || 1);
          if (Math.abs(wDiff) > 0.1) return wDiff;
          return b.year - a.year;
        })
        .slice(0, 8)
        .map(c => {
          const m = mediaRowsMap.get(c.media_id);
          return {
            mediaId: c.media_id,
            role: c.nRole,
            title: m?.title_english || m?.title_romaji || String(c.media_id),
            year: c.year || null,
          };
        });

      chunkData[p.id] = {
        id: p.id, nameFull: p.name_full, nameNative: p.name_native,
        language: p.language, imageLarge: p.image_large, siteUrl: p.site_url,
        description: p.description,
        topCredits,
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
    ...mediaRows.map(m => {
      const genres = JSON.parse(m.genres_json || '[]');
      // isAdult: genre 'Hentai' is the canonical AniList adult marker.
      // (The DB doesn't store AniList's isAdult flag directly, so we derive it.)
      const isAdult = genres.includes('Hentai');
      return {
        id: m.id, kind: 'media',
        en: m.title_english || m.title_romaji || '',
        jp: m.title_native  || m.title_romaji  || '',
        ro: m.title_romaji  || '',
        year: m.season_year,
        type: m.type,
        isAdult,
        genres: genres.join(','),
      };
    }),
    ...peopleRows.map(p => ({
      id: p.id, kind: 'person',
      en: p.name_full   || '',
      jp: p.name_native || p.name_full || '',
      ro: p.name_full   || '',
    })),
  ];
  fs.writeFileSync(path.join(DATA_DIR, 'index', 'search.json'), JSON.stringify(searchEntries));

  // --- TAG TO MEDIA + ADULT TAGS ---
  const tagToMedia = {};
  const adultTagNames = new Set();
  for (const m of mediaRows) {
    const tags = JSON.parse(m.tags_json || '[]');
    for (const t of tags) {
      if (!tagToMedia[t.name]) tagToMedia[t.name] = [];
      tagToMedia[t.name].push(m.id);
      if (t.isAdult) adultTagNames.add(t.name);
    }
  }
  fs.writeFileSync(path.join(DATA_DIR, 'index', 'tag_to_media.json'), JSON.stringify(tagToMedia));
  fs.writeFileSync(path.join(DATA_DIR, 'index', 'adult_tags.json'), JSON.stringify([...adultTagNames]));

  // --- GENRE TO MEDIA ---
  const genreToMedia = {};
  for (const m of mediaRows) {
    const genres = JSON.parse(m.genres_json || '[]');
    for (const g of genres) {
      if (!genreToMedia[g]) genreToMedia[g] = [];
      genreToMedia[g].push(m.id);
    }
  }
  fs.writeFileSync(path.join(DATA_DIR, 'index', 'genre_to_media.json'), JSON.stringify(genreToMedia));

  // --- ROLE TO PEOPLE ---
  // Use normalised role names: "Key Animation (ep 2)" → "Key Animation"
  const roleToPeopleSet = {};
  for (const c of creditRows) {
    if (c.is_localization) continue;
    const key = normalizeRole(c.role);
    if (key === 'Unknown') continue;
    if (!roleToPeopleSet[key]) roleToPeopleSet[key] = new Set();
    roleToPeopleSet[key].add(c.person_id);
  }
  const roleTopeople = Object.fromEntries(
    Object.entries(roleToPeopleSet).map(([k, v]) => [k, [...v]])
  );
  fs.writeFileSync(path.join(DATA_DIR, 'index', 'role_to_people.json'), JSON.stringify(roleTopeople));

  // --- TAG TO PEOPLE ---
  // Map each tag → people who have a credit on media carrying that tag.
  // Used by TalentFinder to score tag fit.
  const tagToPeopleSet = {};
  // Build media → tag list lookup first
  const mediaTagsForPeople = new Map();
  for (const m of mediaRows) {
    const tags = JSON.parse(m.tags_json || '[]').map(t => t.name);
    if (tags.length) mediaTagsForPeople.set(m.id, tags);
  }
  for (const c of creditRows) {
    if (c.is_localization) continue;
    const tags = mediaTagsForPeople.get(c.media_id);
    if (!tags) continue;
    for (const tag of tags) {
      if (!tagToPeopleSet[tag]) tagToPeopleSet[tag] = new Set();
      tagToPeopleSet[tag].add(c.person_id);
    }
  }
  const tagToPeople = Object.fromEntries(
    Object.entries(tagToPeopleSet).map(([k, v]) => [k, [...v]])
  );
  fs.writeFileSync(path.join(DATA_DIR, 'index', 'tag_to_people.json'), JSON.stringify(tagToPeople));
  console.log(`[artifacts] tag_to_people: ${Object.keys(tagToPeople).length} tags`);

  // --- GENRE TO PEOPLE ---
  // Map each genre → people who have a credit on media in that genre.
  const genreToPeopleSet = {};
  const mediaGenresForPeople = new Map();
  for (const m of mediaRows) {
    const genres = JSON.parse(m.genres_json || '[]');
    if (genres.length) mediaGenresForPeople.set(m.id, genres);
  }
  for (const c of creditRows) {
    if (c.is_localization) continue;
    const genres = mediaGenresForPeople.get(c.media_id);
    if (!genres) continue;
    for (const genre of genres) {
      if (!genreToPeopleSet[genre]) genreToPeopleSet[genre] = new Set();
      genreToPeopleSet[genre].add(c.person_id);
    }
  }
  const genreToPeople = Object.fromEntries(
    Object.entries(genreToPeopleSet).map(([k, v]) => [k, [...v]])
  );
  fs.writeFileSync(path.join(DATA_DIR, 'index', 'genre_to_people.json'), JSON.stringify(genreToPeople));
  console.log(`[artifacts] genre_to_people: ${Object.keys(genreToPeople).length} genres`);

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
  // Cap persons per media to avoid O(n²) pair explosion.
  // A media with 200 people → 19,900 pairs; 1000 such titles → 19.9M pairs
  // which exceeds V8's Map limit of ~16.7M entries.
  // Keeping only the 20 most-weighted credits per media preserves the most
  // meaningful collaborations (directors, main cast, key staff) while
  // bounding pairs per title to C(20,2) = 190.
  const MAX_PERSONS_PER_MEDIA = 20;

  // Collect credits per media, sorted by weight descending, capped
  const mediaToCredits = new Map();
  for (const c of creditRows) {
    if (c.is_localization) continue;
    if (!mediaToCredits.has(c.media_id)) mediaToCredits.set(c.media_id, []);
    mediaToCredits.get(c.media_id).push(c);
  }
  const mediaToPersons = new Map();
  for (const [mid, credits] of mediaToCredits) {
    const sorted = credits.sort((a, b) => (b.weight || 1) - (a.weight || 1));
    mediaToPersons.set(mid, sorted.slice(0, MAX_PERSONS_PER_MEDIA).map(c => c.person_id));
  }

  // Accumulate pair counts. Only store pairs with count >= 2 — a single
  // shared credit on one obscure title isn't a meaningful collaboration.
  // Use a regular object for speed; split into chunks to stay under Map limit.
  const collabCount = new Map();
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
    if (count < 2) continue; // skip single-title coincidences
    const colon = key.indexOf(':');
    const a = Number(key.slice(0, colon));
    const b = Number(key.slice(colon + 1));
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
