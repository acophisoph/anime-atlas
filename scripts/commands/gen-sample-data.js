/**
 * gen-sample-data.js
 * Generates all sample data files for anime-atlas:
 *   - data/manifest.json
 *   - data/clusters.json
 *   - data/index/search.json
 *   - data/index/tag_to_media.json
 *   - data/index/role_to_people.json
 *   - data/lookup/media_to_meta_chunk.json
 *   - data/lookup/people_to_meta_chunk.json
 *   - data/meta/media_00000.json
 *   - data/meta/people_00000.json
 *   - data/points.bin
 *   - data/graph_media_relations.bin
 *   - data/graph_media_staff.bin
 *   - data/graph_people_collab.bin
 *
 * Run from repo root: node scripts/commands/gen-sample-data.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../../data');

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function writeJSON(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  console.log(`[json] Wrote ${filePath}`);
}

// ---------------------------------------------------------------------------
// Static data definitions
// ---------------------------------------------------------------------------

const MEDIA = [
  { id: 1,  en: 'Attack on Titan',                  jp: '進撃の巨人',              ro: 'Shingeki no Kyojin',                    year: 2013, type: 'ANIME', format: 'TV',    score: 85, pop: 350000, color: '#1a2030', genres: ['Action','Adventure','Drama','Fantasy'],         studio: 'Wit Studio',    tags: ['Action','Shonen'] },
  { id: 2,  en: 'Fullmetal Alchemist: Brotherhood',  jp: '鋼の錬金術師 BROTHERHOOD', ro: 'Hagane no Renkinjutsushi: Brotherhood',  year: 2009, type: 'ANIME', format: 'TV',    score: 89, pop: 400000, color: '#c05020', genres: ['Action','Adventure','Drama','Fantasy'],         studio: 'Bones',         tags: ['Action','Shonen','Drama'] },
  { id: 3,  en: 'Death Note',                        jp: 'デスノート',              ro: 'Death Note',                            year: 2006, type: 'ANIME', format: 'TV',    score: 84, pop: 380000, color: '#101010', genres: ['Mystery','Psychological','Supernatural'],      studio: 'Madhouse',      tags: ['Drama','Seinen'] },
  { id: 4,  en: 'Spirited Away',                     jp: '千と千尋の神隠し',         ro: 'Sen to Chihiro no Kamikakushi',         year: 2001, type: 'ANIME', format: 'MOVIE', score: 91, pop: 200000, color: '#2060a0', genres: ['Adventure','Fantasy','Supernatural'],           studio: 'Studio Ghibli', tags: ['Fantasy','Slice of Life'] },
  { id: 5,  en: 'Berserk',                           jp: 'ベルセルク',              ro: 'Berserk',                               year: 1997, type: 'MANGA', format: null,    score: 93, pop: 300000, color: '#301010', genres: ['Action','Adventure','Drama','Fantasy'],         studio: null,            tags: ['Action','Seinen','Fantasy'] },
  { id: 6,  en: 'One Piece',                         jp: 'ワンピース',              ro: 'One Piece',                             year: 1999, type: 'MANGA', format: null,    score: 90, pop: 450000, color: '#e07010', genres: ['Action','Adventure','Comedy','Fantasy'],         studio: null,            tags: ['Action','Shonen','Comedy'] },
  { id: 7,  en: 'Naruto',                            jp: 'ナルト',                  ro: 'Naruto',                                year: 2002, type: 'ANIME', format: 'TV',    score: 79, pop: 420000, color: '#e05010', genres: ['Action','Adventure','Fantasy'],                  studio: 'Pierrot',       tags: ['Action','Shonen'] },
  { id: 8,  en: 'Your Lie in April',                 jp: '四月は君の嘘',            ro: 'Shigatsu wa Kimi no Uso',               year: 2014, type: 'ANIME', format: 'TV',    score: 86, pop: 280000, color: '#e0a0c0', genres: ['Drama','Music','Romance'],                      studio: 'A-1 Pictures',  tags: ['Romance','Drama'] },
  { id: 9,  en: 'Cowboy Bebop',                      jp: 'カウボーイビバップ',        ro: 'Cowboy Bebop',                          year: 1998, type: 'ANIME', format: 'TV',    score: 88, pop: 320000, color: '#304060', genres: ['Action','Drama','Sci-Fi'],                      studio: 'Sunrise',       tags: ['Sci-Fi','Drama'] },
  { id: 10, en: 'Neon Genesis Evangelion',           jp: '新世紀エヴァンゲリオン',    ro: 'Neon Genesis Evangelion',               year: 1995, type: 'ANIME', format: 'TV',    score: 82, pop: 340000, color: '#203050', genres: ['Drama','Mecha','Psychological','Sci-Fi'],       studio: 'Gainax',        tags: ['Sci-Fi','Mecha','Drama'] },
  { id: 11, en: 'Steins;Gate',                       jp: 'シュタインズ・ゲート',      ro: 'Steins;Gate',                           year: 2011, type: 'ANIME', format: 'TV',    score: 91, pop: 360000, color: '#105020', genres: ['Drama','Romance','Sci-Fi','Thriller'],           studio: 'White Fox',     tags: ['Sci-Fi','Drama','Romance'] },
  { id: 12, en: 'Vinland Saga',                      jp: 'ヴィンランド・サガ',        ro: 'Vinland Saga',                          year: 2019, type: 'ANIME', format: 'TV',    score: 87, pop: 270000, color: '#506080', genres: ['Action','Adventure','Drama'],                   studio: 'Wit Studio',    tags: ['Action','Seinen','Drama'] },
  { id: 13, en: 'Violet Evergarden',                jp: 'ヴァイオレット・エヴァーガーデン', ro: 'Violet Evergarden',                 year: 2018, type: 'ANIME', format: 'TV',    score: 85, pop: 230000, color: '#8080c0', genres: ['Drama','Fantasy','Romance','Slice of Life'],    studio: 'Kyoto Animation',tags: ['Romance','Drama','Slice of Life'] },
  { id: 14, en: 'Hunter x Hunter',                  jp: 'HUNTER×HUNTER',          ro: 'Hunter x Hunter',                       year: 2011, type: 'ANIME', format: 'TV',    score: 88, pop: 390000, color: '#20a040', genres: ['Action','Adventure','Fantasy'],                  studio: 'Madhouse',      tags: ['Action','Shonen','Fantasy'] },
  { id: 15, en: 'Mushishi',                          jp: '蟲師',                   ro: 'Mushishi',                              year: 2005, type: 'ANIME', format: 'TV',    score: 87, pop: 140000, color: '#406040', genres: ['Adventure','Fantasy','Mystery','Slice of Life'], studio: 'Artland',       tags: ['Fantasy','Slice of Life','Seinen'] },
  { id: 16, en: 'Ping Pong the Animation',          jp: 'ピンポン THE ANIMATION',   ro: 'Ping Pong the Animation',               year: 2014, type: 'ANIME', format: 'TV',    score: 86, pop: 100000, color: '#808020', genres: ['Drama','Slice of Life','Sports'],               studio: 'Tatsunoko Pro', tags: ['Slice of Life','Drama'] },
  { id: 17, en: 'Puella Magi Madoka Magica',        jp: '魔法少女まどか☆マギカ',     ro: 'Mahou Shoujo Madoka Magica',            year: 2011, type: 'ANIME', format: 'TV',    score: 85, pop: 310000, color: '#c060c0', genres: ['Drama','Fantasy','Psychological','Thriller'],   studio: 'Shaft',         tags: ['Fantasy','Drama','Seinen'] },
  { id: 18, en: 'Vinland Saga',                     jp: 'ヴィンランド・サガ',         ro: 'Vinland Saga',                          year: 2005, type: 'MANGA', format: null,    score: 90, pop: 220000, color: '#506080', genres: ['Action','Adventure','Drama','Historical'],      studio: null,            tags: ['Action','Seinen'] },
  { id: 19, en: 'Trigun',                           jp: 'トライガン',                ro: 'Trigun',                                year: 1998, type: 'ANIME', format: 'TV',    score: 80, pop: 160000, color: '#c0a020', genres: ['Action','Comedy','Drama','Sci-Fi'],              studio: 'Madhouse',      tags: ['Action','Sci-Fi','Comedy'] },
  { id: 20, en: 'Planetes',                         jp: 'プラネテス',                ro: 'Planetes',                              year: 2003, type: 'ANIME', format: 'TV',    score: 83, pop: 80000,  color: '#204060', genres: ['Drama','Romance','Sci-Fi','Slice of Life'],      studio: 'Sunrise',       tags: ['Sci-Fi','Slice of Life','Drama'] },
];

const PEOPLE = [
  { id: 101, en: 'Tetsuro Araki',       jp: '荒木哲郎',    ro: 'Araki Tetsuro',      role: 'Director',              desc: 'Japanese anime director, known for Attack on Titan and Death Note at Madhouse and Wit Studio.' },
  { id: 102, en: 'Yasuhiro Irie',       jp: '入江泰浩',    ro: 'Irie Yasuhiro',       role: 'Director',              desc: 'Japanese anime director, helmed Fullmetal Alchemist: Brotherhood at Bones studio.' },
  { id: 103, en: 'Tsugumi Ohba',        jp: '大場つぐみ',   ro: 'Ohba Tsugumi',        role: 'Original Creator',      desc: 'Japanese manga writer, creator of Death Note serialized in Weekly Shonen Jump.' },
  { id: 104, en: 'Hayao Miyazaki',      jp: '宮崎駿',      ro: 'Miyazaki Hayao',      role: 'Director',              desc: 'Legendary animator and co-founder of Studio Ghibli; directed Spirited Away and My Neighbor Totoro.' },
  { id: 105, en: 'Kentaro Miura',       jp: '三浦建太郎',   ro: 'Miura Kentaro',       role: 'Original Creator',      desc: 'Manga artist and creator of Berserk, one of the most influential dark fantasy manga series.' },
  { id: 106, en: 'Eiichiro Oda',        jp: '尾田栄一郎',   ro: 'Oda Eiichiro',        role: 'Original Creator',      desc: 'Creator of One Piece, the best-selling manga of all time with over 500 million copies in circulation.' },
  { id: 107, en: 'Masashi Kishimoto',   jp: '岸本斉史',    ro: 'Kishimoto Masashi',   role: 'Original Creator',      desc: 'Creator of Naruto, serialized in Weekly Shonen Jump from 1999 to 2014.' },
  { id: 108, en: 'Naoshi Arakawa',      jp: '新川直司',    ro: 'Arakawa Naoshi',      role: 'Original Creator',      desc: 'Manga artist, creator of Your Lie in April serialized in Monthly Shonen Magazine.' },
  { id: 109, en: 'Hiroyuki Sawano',     jp: '澤野弘之',    ro: 'Sawano Hiroyuki',     role: 'Music',                 desc: 'Prolific composer known for powerful orchestral anime soundtracks including Attack on Titan.' },
  { id: 110, en: 'Yoko Kanno',          jp: '菅野よう子',   ro: 'Kanno Yoko',          role: 'Music',                 desc: 'Celebrated composer for Cowboy Bebop, Ghost in the Shell: SAC, and Macross Plus.' },
  { id: 111, en: 'Joe Hisaishi',        jp: '久石譲',      ro: 'Hisaishi Joe',        role: 'Music',                 desc: 'Legendary composer, long-time collaborator of Hayao Miyazaki and Studio Ghibli.' },
  { id: 112, en: 'Shoji Gatoh',         jp: '賀東招二',    ro: 'Gatoh Shoji',         role: 'Series Composition',    desc: 'Light novel author and anime series composition writer, known for Full Metal Panic!.' },
  { id: 113, en: 'Makoto Shinkai',      jp: '新海誠',      ro: 'Shinkai Makoto',      role: 'Director',              desc: 'Director of Your Name and Weathering With You, known for breathtaking visual style and romantic themes.' },
  { id: 114, en: 'Ichiro Okochi',       jp: '大河内一楼',   ro: 'Okochi Ichiro',       role: 'Series Composition',    desc: 'Series composition writer for Code Geass, Guilty Crown, and many acclaimed anime productions.' },
  { id: 115, en: 'Atsushi Ikariya',     jp: '碇谷敦',      ro: 'Ikariya Atsushi',     role: 'Animation Director',    desc: 'Animation director known for detailed character animation work on several prominent anime series.' },
];

// ---------------------------------------------------------------------------
// manifest.json
// ---------------------------------------------------------------------------

function genManifest() {
  return {
    version: 1,
    generated_at: 1743379200000,
    last_ingest_run_timestamp: 1743379200000,
    total_media_in_db: 20,
    total_people_in_db: 15,
    completed_batches_count: 4,
    pending_batches_count: 96,
    failed_batches_count: 0,
    completeness: {
      has_staff_for_all_media: false,
      has_characters_for_all_media: false,
      is_partial: true,
    },
    artifacts: {
      points_count: 35,
      media_chunk_count: 1,
      people_chunk_count: 1,
    },
  };
}

// ---------------------------------------------------------------------------
// clusters.json
// ---------------------------------------------------------------------------

function genClusters() {
  return [
    { id: 0, x: -0.5, y: -0.5, size: 4, label: 'Action · Shonen' },
    { id: 1, x:  0.5, y: -0.5, size: 4, label: 'Romance · Drama' },
    { id: 2, x: -0.5, y:  0.5, size: 4, label: 'Sci-Fi · Mecha' },
    { id: 3, x:  0.5, y:  0.5, size: 4, label: 'Slice of Life · Comedy' },
    { id: 4, x:  0.0, y:  0.0, size: 4, label: 'Fantasy · Adventure' },
  ];
}

// ---------------------------------------------------------------------------
// search.json
// ---------------------------------------------------------------------------

function genSearch() {
  const mediaEntries = MEDIA.map(m => ({
    id: m.id,
    kind: 'media',
    en: m.en,
    jp: m.jp,
    ro: m.ro,
    year: m.year,
    type: m.type,
  }));
  const peopleEntries = PEOPLE.map(p => ({
    id: p.id,
    kind: 'person',
    en: p.en,
    jp: p.jp,
    ro: p.ro,
  }));
  return [...mediaEntries, ...peopleEntries];
}

// ---------------------------------------------------------------------------
// tag_to_media.json
// ---------------------------------------------------------------------------

function genTagToMedia() {
  const result = {};
  for (const m of MEDIA) {
    for (const tag of m.tags) {
      if (!result[tag]) result[tag] = [];
      result[tag].push(m.id);
    }
  }
  // Ensure all required tags exist
  const required = ['Action','Romance','Fantasy','Sci-Fi','Drama','Comedy','Slice of Life','Mecha','Shonen','Seinen'];
  for (const tag of required) {
    if (!result[tag]) result[tag] = [];
  }
  return result;
}

// ---------------------------------------------------------------------------
// role_to_people.json
// ---------------------------------------------------------------------------

function genRoleToPeople() {
  const result = {};
  for (const p of PEOPLE) {
    if (!result[p.role]) result[p.role] = [];
    result[p.role].push(p.id);
  }
  // Ensure required roles exist
  const required = ['Director','Series Composition','Character Design','Music','Animation Director'];
  for (const role of required) {
    if (!result[role]) result[role] = [];
  }
  return result;
}

// ---------------------------------------------------------------------------
// lookup files
// ---------------------------------------------------------------------------

function genMediaToMetaChunk() {
  const result = {};
  for (const m of MEDIA) result[String(m.id)] = 'media_00000.json';
  return result;
}

function genPeopleToMetaChunk() {
  const result = {};
  for (const p of PEOPLE) result[String(p.id)] = 'people_00000.json';
  return result;
}

// ---------------------------------------------------------------------------
// meta/media_00000.json
// ---------------------------------------------------------------------------

const TAG_DETAILS = {
  'Action':       { id: 1,  category: 'Genre' },
  'Shonen':       { id: 2,  category: 'Demographic' },
  'Drama':        { id: 3,  category: 'Genre' },
  'Romance':      { id: 4,  category: 'Genre' },
  'Fantasy':      { id: 5,  category: 'Genre' },
  'Sci-Fi':       { id: 6,  category: 'Genre' },
  'Comedy':       { id: 7,  category: 'Genre' },
  'Mecha':        { id: 8,  category: 'Genre' },
  'Seinen':       { id: 9,  category: 'Demographic' },
  'Slice of Life':{ id: 10, category: 'Genre' },
};

function genMediaMeta() {
  const result = {};
  for (const m of MEDIA) {
    result[String(m.id)] = {
      id: m.id,
      type: m.type,
      format: m.format,
      seasonYear: m.year,
      popularity: m.pop,
      averageScore: m.score,
      title: {
        romaji: m.ro,
        english: m.en,
        native: m.jp,
      },
      coverImage: {
        large: null,
        color: m.color,
      },
      genres: m.genres,
      tags: m.tags.map(t => ({
        id: TAG_DETAILS[t]?.id ?? 99,
        name: t,
        category: TAG_DETAILS[t]?.category ?? 'Theme',
        rank: 80,
        isAdult: false,
      })),
      studios: m.studio
        ? [{ id: m.id, name: m.studio, isAnimationStudio: true }]
        : [],
    };
  }
  return result;
}

// ---------------------------------------------------------------------------
// meta/people_00000.json
// ---------------------------------------------------------------------------

function genPeopleMeta() {
  const result = {};
  for (const p of PEOPLE) {
    result[String(p.id)] = {
      id: p.id,
      nameFull: p.en,
      nameNative: p.jp,
      language: 'JAPANESE',
      imageLarge: null,
      siteUrl: `https://anilist.co/staff/${p.id}`,
      description: p.desc,
    };
  }
  return result;
}

// ---------------------------------------------------------------------------
// points.bin
// ---------------------------------------------------------------------------

const POINT_MAGIC   = 0x41544c50; // 'ATLP'
const GRAPH_MAGIC   = 0x41544c47; // 'ATLG'
const BYTES_PER_POINT = 28;

function parseColorHex(hex) {
  if (!hex) return 0;
  const s = hex.replace('#', '');
  if (s.length === 6) return parseInt(s, 16);
  if (s.length === 3) {
    const r = parseInt(s[0] + s[0], 16);
    const g = parseInt(s[1] + s[1], 16);
    const b = parseInt(s[2] + s[2], 16);
    return (r << 16) | (g << 8) | b;
  }
  return 0;
}

function goldenAngle(i, total, scale) {
  const r = Math.sqrt((i + 1) / total) * scale;
  const theta = (i + 1) * 2.399; // golden angle in radians ≈ 137.5°
  return { x: r * Math.cos(theta), y: r * Math.sin(theta) };
}

function genPointsBin(outPath) {
  const points = [];

  // Media points (IDs 1-20)
  for (let i = 0; i < MEDIA.length; i++) {
    const m = MEDIA[i];
    const { x, y } = goldenAngle(i, MEDIA.length, 0.8);
    points.push({
      id: m.id,
      x,
      y,
      kind: 0, // media
      popularity: m.pop,
      averageScore: m.score,
      colorRGB: parseColorHex(m.color),
    });
  }

  // People points (IDs 101-115)
  for (let i = 0; i < PEOPLE.length; i++) {
    const p = PEOPLE[i];
    const { x, y } = goldenAngle(i, PEOPLE.length, 0.6);
    points.push({
      id: p.id,
      x: x + 0.1,
      y: y + 0.1,
      kind: 1, // person
      popularity: 50000 + i * 3000,
      averageScore: 0,
      colorRGB: 0x4080c0,
    });
  }

  const count = points.length; // 35
  const buf = Buffer.allocUnsafe(16 + count * BYTES_PER_POINT);
  let off = 0;

  buf.writeUInt32LE(POINT_MAGIC, off); off += 4;
  buf.writeUInt32LE(1,           off); off += 4; // version
  buf.writeUInt32LE(count,       off); off += 4;
  buf.writeUInt32LE(0,           off); off += 4; // reserved

  for (const pt of points) {
    buf.writeInt32LE(pt.id,           off); off += 4;
    buf.writeFloatLE(pt.x,            off); off += 4;
    buf.writeFloatLE(pt.y,            off); off += 4;
    buf.writeUInt32LE(pt.kind,        off); off += 4;
    buf.writeUInt32LE(pt.popularity,  off); off += 4;
    buf.writeUInt32LE(pt.averageScore,off); off += 4;
    buf.writeUInt32LE(pt.colorRGB,    off); off += 4;
  }

  fs.writeFileSync(outPath, buf);
  console.log(`[bin] Wrote ${outPath} (${count} points, ${buf.length} bytes)`);
  return count;
}

// ---------------------------------------------------------------------------
// Graph binary helper
// ---------------------------------------------------------------------------

function writeGraphBin(outPath, adjacency) {
  // adjacency: Map<nodeId, [{targetId, weight, edgeType}]>
  const nodes = [...adjacency.keys()].sort((a, b) => a - b);
  const nodeCount = nodes.length;
  let totalEdges = 0;
  for (const edges of adjacency.values()) totalEdges += edges.length;

  const EDGE_TYPES = {
    SEQUEL: 1, PREQUEL: 2, ALTERNATIVE: 3, PARENT: 4, SIDE_STORY: 5,
    SUMMARY: 6, ADAPTATION: 7, OTHER: 8, STAFF_OVERLAP: 10, COLLAB: 20,
  };

  const headerSize   = 16;
  const nodeTableSz  = nodeCount * 8;
  const edgesSz      = totalEdges * 12;
  const buf = Buffer.allocUnsafe(headerSize + nodeTableSz + edgesSz);
  let off = 0;

  buf.writeUInt32LE(GRAPH_MAGIC, off); off += 4;
  buf.writeUInt32LE(1,           off); off += 4; // version
  buf.writeUInt32LE(nodeCount,   off); off += 4;
  buf.writeUInt32LE(totalEdges,  off); off += 4;

  const nodeTableStart = off;
  off += nodeTableSz; // reserve space, fill below

  let edgeOffset = 0;
  let ntOff = nodeTableStart;

  for (const nodeId of nodes) {
    const edges = adjacency.get(nodeId) || [];
    buf.writeInt32LE(nodeId,     ntOff); ntOff += 4;
    buf.writeUInt32LE(edgeOffset, ntOff); ntOff += 4;

    for (const e of edges) {
      buf.writeInt32LE(e.targetId,                    off); off += 4;
      buf.writeFloatLE(e.weight ?? 1.0,               off); off += 4;
      buf.writeUInt32LE(EDGE_TYPES[e.edgeType] ?? 0,  off); off += 4;
      edgeOffset++;
    }
  }

  fs.writeFileSync(outPath, buf);
  console.log(`[bin] Wrote ${outPath} (${nodeCount} nodes, ${totalEdges} edges, ${buf.length} bytes)`);
}

// ---------------------------------------------------------------------------
// Graph: media relations  (sequels, alternative versions, adaptations)
// ---------------------------------------------------------------------------

function genGraphMediaRelations(outPath) {
  // adjacency map
  const adj = new Map();
  const add = (a, b, type, weight) => {
    if (!adj.has(a)) adj.set(a, []);
    adj.get(a).push({ targetId: b, weight, edgeType: type });
  };

  // 1 -> 12: both Vinland-adjacent dark stories (ALTERNATIVE)
  add(1,  12, 'ALTERNATIVE', 0.7);
  add(12,  1, 'ALTERNATIVE', 0.7);
  // 2 ->  5: FMA: Brotherhood & Berserk share dark themes (OTHER)
  add(2,   5, 'OTHER', 0.5);
  // 5 -> 18: Vinland Saga manga is related to anime ID 12 (ADAPTATION)
  add(18, 12, 'ADAPTATION', 0.9);
  add(12, 18, 'PARENT', 0.9);
  // 9 -> 19: Cowboy Bebop & Trigun both space westerns (ALTERNATIVE)
  add(9,  19, 'ALTERNATIVE', 0.75);
  add(19,  9, 'ALTERNATIVE', 0.75);
  // 10 -> 17: Eva & Madoka both dark magical themes (ALTERNATIVE)
  add(10, 17, 'ALTERNATIVE', 0.6);
  add(17, 10, 'ALTERNATIVE', 0.6);
  // 11 -> 20: Steins;Gate & Planetes both thoughtful sci-fi (OTHER)
  add(11, 20, 'OTHER', 0.55);
  // 3 ->  7: Death Note & Naruto both aired same era (OTHER)
  add(3,   7, 'OTHER', 0.4);
  // 6 ->  7: One Piece & Naruto rival shonen (ALTERNATIVE)
  add(6,   7, 'ALTERNATIVE', 0.8);
  add(7,   6, 'ALTERNATIVE', 0.8);

  writeGraphBin(outPath, adj);
}

// ---------------------------------------------------------------------------
// Graph: media staff overlap
// ---------------------------------------------------------------------------

function genGraphMediaStaff(outPath) {
  const adj = new Map();
  const add = (a, b, weight) => {
    if (!adj.has(a)) adj.set(a, []);
    adj.get(a).push({ targetId: b, weight, edgeType: 'STAFF_OVERLAP' });
  };

  // Madhouse: IDs 3, 14, 19
  add(3,  14, 0.8); add(14,  3, 0.8);
  add(3,  19, 0.5); add(19,  3, 0.5);
  add(14, 19, 0.5); add(19, 14, 0.5);
  // Wit Studio: IDs 1, 12
  add(1,  12, 0.9); add(12,  1, 0.9);
  // A-1 Pictures / Bones era: IDs 2, 8, 11
  add(2,   8, 0.4); add(8,   2, 0.4);
  add(8,  11, 0.6); add(11,  8, 0.6);
  // Sawano scored both ID 1 and 12
  add(1,  12, 0.7); // already added, duplicate intentional (weight avg'd at read time)
  // Ghibli films share Hisaishi: IDs 4, 13 (thematic)
  add(4,  13, 0.5); add(13,  4, 0.5);
  // Mecha cluster: IDs 10, 17 share Gainax lineage
  add(10, 17, 0.7); add(17, 10, 0.7);

  writeGraphBin(outPath, adj);
}

// ---------------------------------------------------------------------------
// Graph: people collaborations
// ---------------------------------------------------------------------------

function genGraphPeopleCollab(outPath) {
  const adj = new Map();
  const add = (a, b, weight) => {
    if (!adj.has(a)) adj.set(a, []);
    adj.get(a).push({ targetId: b, weight, edgeType: 'COLLAB' });
  };

  // Araki (101) worked with Sawano (109): both on AoT
  add(101, 109, 0.95); add(109, 101, 0.95);
  // Miyazaki (104) + Hisaishi (111): lifelong collaboration
  add(104, 111, 0.99); add(111, 104, 0.99);
  // Irie (102) + Bones animation team — fictional collab with 115
  add(102, 115, 0.7);  add(115, 102, 0.7);
  // Gatoh (112) + Okochi (114): both series composition writers
  add(112, 114, 0.6);  add(114, 112, 0.6);
  // Kanno (110) + Sawano (109): contemporaries in anime music
  add(109, 110, 0.5);  add(110, 109, 0.5);
  // Kishimoto (107) + Oda (106): rival shonen authors, crossed paths
  add(106, 107, 0.55); add(107, 106, 0.55);
  // Shinkai (113) + Kanno (110): worked together on crossover project
  add(113, 110, 0.65); add(110, 113, 0.65);
  // Ohba (103) + Araki (101): Death Note manga/anime team
  add(103, 101, 0.85); add(101, 103, 0.85);

  writeGraphBin(outPath, adj);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  console.log('Generating sample data for anime-atlas...\n');

  ensureDir(DATA_DIR);
  ensureDir(path.join(DATA_DIR, 'index'));
  ensureDir(path.join(DATA_DIR, 'lookup'));
  ensureDir(path.join(DATA_DIR, 'meta'));

  writeJSON(path.join(DATA_DIR, 'manifest.json'),                  genManifest());
  writeJSON(path.join(DATA_DIR, 'clusters.json'),                  genClusters());
  writeJSON(path.join(DATA_DIR, 'index', 'search.json'),           genSearch());
  writeJSON(path.join(DATA_DIR, 'index', 'tag_to_media.json'),     genTagToMedia());
  writeJSON(path.join(DATA_DIR, 'index', 'role_to_people.json'),   genRoleToPeople());
  writeJSON(path.join(DATA_DIR, 'lookup', 'media_to_meta_chunk.json'),  genMediaToMetaChunk());
  writeJSON(path.join(DATA_DIR, 'lookup', 'people_to_meta_chunk.json'), genPeopleToMetaChunk());
  writeJSON(path.join(DATA_DIR, 'meta', 'media_00000.json'),       genMediaMeta());
  writeJSON(path.join(DATA_DIR, 'meta', 'people_00000.json'),      genPeopleMeta());

  const count = genPointsBin(path.join(DATA_DIR, 'points.bin'));

  genGraphMediaRelations(path.join(DATA_DIR, 'graph_media_relations.bin'));
  genGraphMediaStaff(path.join(DATA_DIR, 'graph_media_staff.bin'));
  genGraphPeopleCollab(path.join(DATA_DIR, 'graph_people_collab.bin'));

  console.log('\nDone. Verifying points.bin...');
  const stat = fs.statSync(path.join(DATA_DIR, 'points.bin'));
  const expected = 16 + 35 * 28; // 996
  console.log(`  Size: ${stat.size} bytes (expected ${expected})`);
  if (stat.size !== expected) {
    console.error(`  ERROR: size mismatch!`);
    process.exit(1);
  } else {
    console.log('  OK');
  }

  console.log('\nAll sample data files generated successfully.');
}

main();
