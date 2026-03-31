#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR ?? path.join(__dirname, '..', '..', 'data');

const REQUIRED_FILES = [
  'manifest.json',
  'points.bin',
  'graph_media_relations.bin',
  'graph_media_staff.bin',
  'graph_people_collab.bin',
  'clusters.json',
  'index/search.json',
  'index/tag_to_media.json',
  'index/role_to_people.json',
  'lookup/media_to_meta_chunk.json',
  'lookup/people_to_meta_chunk.json',
];

let failed = false;

function fail(msg) {
  console.error(`[sanity] FAIL: ${msg}`);
  failed = true;
}

function check(condition, msg) {
  if (!condition) fail(msg);
}

// 1. Required files exist and are non-empty
for (const rel of REQUIRED_FILES) {
  const p = path.join(DATA_DIR, rel);
  if (!fs.existsSync(p)) {
    fail(`Missing required file: ${rel}`);
  } else {
    const stat = fs.statSync(p);
    check(stat.size > 0, `File is empty: ${rel}`);
  }
}

if (failed) {
  console.error('[sanity] Aborted due to missing files.');
  process.exit(1);
}

// 2. Manifest validity
const manifest = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'manifest.json'), 'utf8'));
check(typeof manifest.version === 'number', 'manifest.version must be a number');
check(typeof manifest.total_media_in_db === 'number', 'manifest.total_media_in_db missing');
check(typeof manifest.total_people_in_db === 'number', 'manifest.total_people_in_db missing');
check(typeof manifest.completeness === 'object', 'manifest.completeness missing');
check(typeof manifest.completeness.is_partial === 'boolean', 'manifest.completeness.is_partial missing');

// 3. points.bin header
const POINT_MAGIC = 0x41544c50;
const pointsBuf = fs.readFileSync(path.join(DATA_DIR, 'points.bin'));
check(pointsBuf.readUInt32LE(0) === POINT_MAGIC, `points.bin bad magic (got 0x${pointsBuf.readUInt32LE(0).toString(16)})`);
check(pointsBuf.readUInt32LE(4) === 1, 'points.bin bad version');
const pointCount = pointsBuf.readUInt32LE(8);
check(pointCount >= 0, 'points.bin: negative count');
const expectedSize = 16 + pointCount * 28;
check(pointsBuf.length === expectedSize, `points.bin: size mismatch (got ${pointsBuf.length}, expected ${expectedSize})`);

// 4. clusters.json is array
const clusters = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'clusters.json'), 'utf8'));
check(Array.isArray(clusters), 'clusters.json must be an array');

// 5. search.json is array
const search = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'index', 'search.json'), 'utf8'));
check(Array.isArray(search), 'search.json must be an array');
check(search.length === manifest.total_media_in_db + manifest.total_people_in_db,
  `search.json entry count (${search.length}) != media+people (${manifest.total_media_in_db + manifest.total_people_in_db})`);

// 6. Graph bin magic checks
const GRAPH_MAGIC = 0x41544c47;
for (const gf of ['graph_media_relations.bin', 'graph_media_staff.bin', 'graph_people_collab.bin']) {
  const buf = fs.readFileSync(path.join(DATA_DIR, gf));
  check(buf.readUInt32LE(0) === GRAPH_MAGIC, `${gf}: bad magic`);
  check(buf.readUInt32LE(4) === 1, `${gf}: bad version`);
}

if (failed) {
  console.error('[sanity] One or more checks failed.');
  process.exit(1);
}

console.log(`[sanity] All checks passed. media=${manifest.total_media_in_db} people=${manifest.total_people_in_db} points=${pointCount} partial=${manifest.completeness.is_partial}`);
