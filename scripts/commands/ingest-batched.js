#!/usr/bin/env node
/**
 * Batched ingest runner.
 * Acquires a lease, then processes PENDING batches until time budget or run limit reached.
 * Resumes from wherever the last run stopped.
 */
import path from 'path';
import { fileURLToPath } from 'url';
import { openDb } from '../db/migrate.js';
import { executeBatch } from '../lib/batch-executor.js';
import { acquireLease, releaseLease, startLeaseRenewal } from '../lib/lease.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DB_PATH = process.env.DB_PATH ??
  path.join(__dirname, '..', '.cache', 'anime-atlas.sqlite');
const TIME_BUDGET_MS =
  parseInt(process.env.TIME_BUDGET_MINUTES ?? '270', 10) * 60 * 1000;
// 0 = unlimited (rely on TIME_BUDGET_MS only)
const RUN_BATCH_LIMIT = parseInt(process.env.RUN_BATCH_LIMIT ?? '0', 10);
const BATCH_MAX_RETRIES = parseInt(process.env.BATCH_MAX_RETRIES ?? '5', 10);

// Priority order: list pages → staff/characters → refresh stubs → person bios
const BATCH_PRIORITY = ['ANIME_LIST', 'MANGA_LIST', 'MEDIA_STAFF', 'MEDIA_CHARACTERS', 'MEDIA_REFRESH', 'PERSON_DETAILS'];

async function main() {
  const db = openDb(DB_PATH);
  console.log(`[ingest] DB: ${DB_PATH}`);
  console.log(`[ingest] Budget: ${TIME_BUDGET_MS / 60000} min, batchLimit: ${RUN_BATCH_LIMIT}`);

  // Seed initial list-page batches if none exist yet
  seedInitialBatches(db);

  // Acquire lease
  if (!acquireLease(db, 'ingest')) {
    console.error('[ingest] Could not acquire lease — another run may be in progress');
    process.exit(1);
  }
  const leaseTimer = startLeaseRenewal(db, 'ingest');
  console.log('[ingest] Lease acquired');

  const startTime = Date.now();
  let batchesProcessed = 0;

  try {
    while (true) {
      // Time or count budget
      if (Date.now() - startTime >= TIME_BUDGET_MS) {
        console.log('[ingest] Time budget exhausted');
        break;
      }
      if (RUN_BATCH_LIMIT > 0 && batchesProcessed >= RUN_BATCH_LIMIT) {
        console.log('[ingest] Batch count limit reached');
        break;
      }

      // Pick next PENDING batch in priority order
      const batch = getNextBatch(db);
      if (!batch) {
        console.log('[ingest] No pending batches remaining');
        break;
      }

      // Mark RUNNING
      db.prepare(`
        UPDATE batches SET status='RUNNING', updated_at=? WHERE batch_id=?
      `).run(Date.now(), batch.batch_id);

      try {
        await executeBatch(db, batch);
        db.prepare(`
          UPDATE batches SET status='DONE', updated_at=? WHERE batch_id=?
        `).run(Date.now(), batch.batch_id);
        batchesProcessed++;
        console.log(`[ingest] ✓ ${batch.scope_key} (${batchesProcessed}/${RUN_BATCH_LIMIT})`);
      } catch (err) {
        const attempts = batch.attempts + 1;
        const newStatus = attempts >= BATCH_MAX_RETRIES ? 'FAILED' : 'PENDING';
        db.prepare(`
          UPDATE batches SET status=?, attempts=?, last_error=?, updated_at=?
          WHERE batch_id=?
        `).run(newStatus, attempts, err.message?.slice(0, 500), Date.now(), batch.batch_id);
        console.error(`[ingest] ✗ ${batch.scope_key} attempt=${attempts} status=${newStatus}: ${err.message}`);
      }
    }
  } finally {
    clearInterval(leaseTimer);
    releaseLease(db, 'ingest');
    db.prepare(`
      INSERT OR REPLACE INTO ingest_state (key, value)
      VALUES ('last_run_at', ?)
    `).run(JSON.stringify(Date.now()));
    db.close();
  }

  printSummary();
}

function seedInitialBatches(db) {
  const existingCount = db.prepare(
    "SELECT COUNT(*) as n FROM batches WHERE batch_type IN ('ANIME_LIST','MANGA_LIST')"
  ).get().n;

  if (existingCount === 0) {
    console.log('[ingest] Seeding initial list batches...');
    const insert = db.prepare(`
      INSERT OR IGNORE INTO batches (batch_type, scope_key, status)
      VALUES (?, ?, 'PENDING')
    `);
    // Start with first pages; more pages get seeded dynamically as we discover hasNextPage
    insert.run('ANIME_LIST', 'ANIME:page:1');
    insert.run('MANGA_LIST', 'MANGA:page:1');
  }

  // Seed MEDIA_REFRESH for stub media (popularity=0 and genres_json='[]') that
  // don't already have a PENDING, RUNNING, or DONE MEDIA_REFRESH batch.
  // Runs every startup so new stubs created after the initial seeding are covered.
  const hasTables = db.prepare("SELECT COUNT(*) as n FROM sqlite_master WHERE type='table' AND name='media'").get().n;
  if (!hasTables) return;

  // Reset FAILED batches so they get one more chance (permanent failures are rare —
  // most failures are transient rate-limit or network errors).
  const resetCount = db.prepare(
    "UPDATE batches SET status='PENDING', attempts=0 WHERE status='FAILED'"
  ).run().changes;
  if (resetCount > 0) console.log(`[ingest] Reset ${resetCount} FAILED batches to PENDING`);

  // Find stubs with no existing MEDIA_REFRESH batch (regardless of whether other
  // MEDIA_REFRESH batches exist — the old stubCount===0 guard was too coarse).
  const unseededStubs = db.prepare(`
    SELECT id FROM media
    WHERE popularity=0 AND genres_json='[]'
    AND NOT EXISTS (
      SELECT 1 FROM batches
      WHERE batch_type='MEDIA_REFRESH'
        AND scope_key='MEDIA_REFRESH:' || id
    )
    LIMIT 50000
  `).all();

  if (unseededStubs.length > 0) {
    console.log(`[ingest] Seeding ${unseededStubs.length} MEDIA_REFRESH batches for unseeded stubs...`);
    const insert = db.prepare(`
      INSERT OR IGNORE INTO batches (batch_type, scope_key, status)
      VALUES ('MEDIA_REFRESH', ?, 'PENDING')
    `);
    const insertMany = db.transaction((rows) => {
      for (const r of rows) insert.run(`MEDIA_REFRESH:${r.id}`);
    });
    insertMany(unseededStubs);
  }
}

function getNextBatch(db) {
  for (const btype of BATCH_PRIORITY) {
    const row = db.prepare(`
      SELECT * FROM batches
      WHERE batch_type=? AND status='PENDING'
      ORDER BY batch_id ASC
      LIMIT 1
    `).get(btype);
    if (row) return row;
  }
  return null;
}

function printSummary() {
  const db2 = openDb(DB_PATH);
  const stats = db2.prepare(`
    SELECT status, COUNT(*) as n FROM batches GROUP BY status
  `).all();
  console.log('[ingest] Batch summary:');
  for (const r of stats) console.log(`  ${r.status}: ${r.n}`);
  const media = db2.prepare('SELECT COUNT(*) as n FROM media').get().n;
  const people = db2.prepare('SELECT COUNT(*) as n FROM people').get().n;
  console.log(`[ingest] media=${media} people=${people}`);
  db2.close();
}

main().catch(e => { console.error(e); process.exit(1); });
