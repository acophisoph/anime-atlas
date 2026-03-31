#!/usr/bin/env node
import path from 'path';
import { fileURLToPath } from 'url';
import { openDb } from '../db/migrate.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH ?? path.join(__dirname, '..', '.cache', 'anime-atlas.sqlite');

const db = openDb(DB_PATH);

const batchStats = db.prepare('SELECT batch_type, status, COUNT(*) as n FROM batches GROUP BY batch_type, status ORDER BY batch_type, status').all();
const media = db.prepare('SELECT COUNT(*) as n FROM media').get().n;
const people = db.prepare('SELECT COUNT(*) as n FROM people').get().n;
const credits = db.prepare('SELECT COUNT(*) as n FROM credits').get().n;
const chars = db.prepare('SELECT COUNT(*) as n FROM characters').get().n;

console.log('=== Anime Atlas DB Status ===');
console.log(`Media: ${media}, People: ${people}, Credits: ${credits}, Characters: ${chars}`);
console.log('\nBatch Status:');
for (const r of batchStats) {
  console.log(`  ${r.batch_type.padEnd(20)} ${r.status.padEnd(10)} ${r.n}`);
}

const lastRun = db.prepare("SELECT value FROM ingest_state WHERE key='last_run_at'").get();
if (lastRun) {
  const ts = JSON.parse(lastRun.value);
  console.log(`\nLast ingest run: ${new Date(ts).toISOString()}`);
}

const failedBatches = db.prepare("SELECT scope_key, last_error FROM batches WHERE status='FAILED' LIMIT 10").all();
if (failedBatches.length > 0) {
  console.log('\nFailed batches (up to 10):');
  for (const b of failedBatches) console.log(`  ${b.scope_key}: ${b.last_error}`);
}

db.close();
