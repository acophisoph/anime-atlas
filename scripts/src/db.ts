import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { CACHE_DIR } from './config.js';

export type CheckpointStatus = 'running' | 'success' | 'failed';
export type IngestCheckpoint = {
  id: number;
  sourceProvider: string;
  dataset: string;
  configKey: string;
  topAnime: number;
  topManga: number;
  nextBatchId: number;
  lastCompletedBatchId: number;
  status: CheckpointStatus;
  lastError: string | null;
  leaseOwner: string | null;
  leaseExpiresAt: string | null;
  updatedAt: string;
};

let db: any = null;
let resolvedSqlitePath = '';
let initLogged = false;

function resolveSqlitePath(): string {
  if (resolvedSqlitePath) return resolvedSqlitePath;
  resolvedSqlitePath = (process.env.SQLITE_PATH?.trim() || path.join(CACHE_DIR, 'anime-atlas.sqlite'));
  return resolvedSqlitePath;
}

function ensureDefaultsSync(): void {
  const sqlitePath = resolveSqlitePath();
  fs.mkdirSync(path.dirname(sqlitePath), { recursive: true });
  const usingDefaultPath = !process.env.SQLITE_PATH;
  if (usingDefaultPath) process.env.SQLITE_PATH = sqlitePath;
  if (!initLogged) {
    console.info(usingDefaultPath
      ? `[info] SQLITE_PATH not set; defaulting to ${sqlitePath}`
      : `[info] SQLITE_PATH=${sqlitePath}`);
    initLogged = true;
  }
}

export async function initializeDatabaseDefaults(): Promise<void> {
  const sqlitePath = resolveSqlitePath();
  await fsp.mkdir(path.dirname(sqlitePath), { recursive: true });
  const usingDefaultPath = !process.env.SQLITE_PATH;
  if (usingDefaultPath) process.env.SQLITE_PATH = sqlitePath;
  if (!initLogged) {
    console.info(usingDefaultPath
      ? `[info] SQLITE_PATH not set; defaulting to ${sqlitePath}`
      : `[info] SQLITE_PATH=${sqlitePath}`);
    initLogged = true;
  }
}

export function getResolvedDatabaseUrl(): string {
  return `sqlite:${resolveSqlitePath()}`;
}

export function getSqliteFilePath(): string {
  return resolveSqlitePath();
}

export function hasDatabase(): boolean {
  try {
    ensureDefaultsSync();
    getDb();
    return true;
  } catch {
    return false;
  }
}

export function getLeaseOwner(): string {
  return process.env.GITHUB_RUN_ID ? `gha-${process.env.GITHUB_RUN_ID}` : `local-${os.hostname()}-${process.pid}`;
}

function getDb(): any {
  ensureDefaultsSync();
  if (!db) {
    db = new Database(resolveSqlitePath());
    db.pragma('journal_mode = WAL');
    db.pragma('busy_timeout = 5000');
  }
  return db;
}

export async function closePool(): Promise<void> {
  if (db) {
    db.close();
    db = null;
  }
}

export async function ensureDbSchema(): Promise<void> {
  const d = getDb();
  d.exec(`
    CREATE TABLE IF NOT EXISTS ingest_checkpoints (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_provider TEXT NOT NULL,
      dataset TEXT NOT NULL,
      config_key TEXT NOT NULL,
      top_anime INTEGER NOT NULL,
      top_manga INTEGER NOT NULL,
      next_batch_id INTEGER NOT NULL DEFAULT 0,
      last_completed_batch_id INTEGER NOT NULL DEFAULT -1,
      status TEXT NOT NULL DEFAULT 'running',
      last_error TEXT,
      lease_owner TEXT,
      lease_expires_at TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (source_provider, dataset, config_key)
    );

    CREATE TABLE IF NOT EXISTS ingest_media (
      source_provider TEXT NOT NULL,
      config_key TEXT NOT NULL,
      id INTEGER NOT NULL,
      payload TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (source_provider, config_key, id)
    );

    CREATE TABLE IF NOT EXISTS ingest_people (
      source_provider TEXT NOT NULL,
      config_key TEXT NOT NULL,
      id INTEGER NOT NULL,
      payload TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (source_provider, config_key, id)
    );

    CREATE TABLE IF NOT EXISTS ingest_characters (
      source_provider TEXT NOT NULL,
      config_key TEXT NOT NULL,
      id INTEGER NOT NULL,
      payload TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (source_provider, config_key, id)
    );

    CREATE TABLE IF NOT EXISTS ingest_relations (
      source_provider TEXT NOT NULL,
      config_key TEXT NOT NULL,
      id INTEGER NOT NULL,
      payload TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (source_provider, config_key, id)
    );
  `);
}

function mapCheckpoint(row: any): IngestCheckpoint {
  return {
    id: Number(row.id),
    sourceProvider: row.source_provider,
    dataset: row.dataset,
    configKey: row.config_key,
    topAnime: Number(row.top_anime),
    topManga: Number(row.top_manga),
    nextBatchId: Number(row.next_batch_id),
    lastCompletedBatchId: Number(row.last_completed_batch_id),
    status: row.status,
    lastError: row.last_error ?? null,
    leaseOwner: row.lease_owner ?? null,
    leaseExpiresAt: row.lease_expires_at ?? null,
    updatedAt: row.updated_at
  };
}

export async function loadOrCreateCheckpoint(params: {
  sourceProvider: string;
  dataset: string;
  configKey: string;
  topAnime: number;
  topManga: number;
}): Promise<IngestCheckpoint> {
  const d = getDb();
  d.prepare(`
    INSERT INTO ingest_checkpoints (source_provider, dataset, config_key, top_anime, top_manga, status)
    VALUES (?, ?, ?, ?, ?, 'running')
    ON CONFLICT(source_provider, dataset, config_key) DO NOTHING
  `).run(params.sourceProvider, params.dataset, params.configKey, params.topAnime, params.topManga);

  const row = d.prepare(`SELECT * FROM ingest_checkpoints WHERE source_provider=? AND dataset=? AND config_key=?`)
    .get(params.sourceProvider, params.dataset, params.configKey);
  return mapCheckpoint(row);
}

function isExpired(expiresAt: string | null | undefined): boolean {
  if (!expiresAt) return true;
  return new Date(expiresAt).getTime() < Date.now();
}

function nextLeaseIso(minutes: number): string {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

export async function tryAcquireLease(id: number, leaseOwner: string, leaseMinutes = 30): Promise<boolean> {
  const d = getDb();
  const row: any = d.prepare(`SELECT lease_owner, lease_expires_at FROM ingest_checkpoints WHERE id=?`).get(id);
  if (!row) return false;
  if (row.lease_owner && row.lease_owner !== leaseOwner && !isExpired(row.lease_expires_at)) {
    return false;
  }
  d.prepare(`UPDATE ingest_checkpoints SET lease_owner=?, lease_expires_at=?, status='running', updated_at=datetime('now') WHERE id=?`)
    .run(leaseOwner, nextLeaseIso(leaseMinutes), id);
  return true;
}

export async function renewLease(id: number, leaseOwner: string, leaseMinutes = 30): Promise<void> {
  const d = getDb();
  d.prepare(`UPDATE ingest_checkpoints SET lease_expires_at=?, updated_at=datetime('now') WHERE id=? AND lease_owner=?`)
    .run(nextLeaseIso(leaseMinutes), id, leaseOwner);
}

export async function updateCheckpointProgress(id: number, nextBatchId: number, lastCompletedBatchId: number, status: CheckpointStatus, lastError: string | null): Promise<void> {
  const d = getDb();
  d.prepare(`UPDATE ingest_checkpoints SET next_batch_id=?, last_completed_batch_id=?, status=?, last_error=?, updated_at=datetime('now') WHERE id=?`)
    .run(nextBatchId, lastCompletedBatchId, status, lastError, id);
}

export async function releaseLease(id: number, leaseOwner: string): Promise<void> {
  const d = getDb();
  d.prepare(`UPDATE ingest_checkpoints SET lease_owner=NULL, lease_expires_at=NULL, updated_at=datetime('now') WHERE id=? AND lease_owner=?`)
    .run(id, leaseOwner);
}

export async function loadEntityMaps(config: { sourceProvider: string; configKey: string }): Promise<{ media: any[]; people: any[]; characters: any[]; relationLookup: Record<number, any>; }> {
  const d = getDb();
  const mediaRows: any[] = d.prepare(`SELECT payload FROM ingest_media WHERE source_provider=? AND config_key=?`).all(config.sourceProvider, config.configKey);
  const peopleRows: any[] = d.prepare(`SELECT payload FROM ingest_people WHERE source_provider=? AND config_key=?`).all(config.sourceProvider, config.configKey);
  const charRows: any[] = d.prepare(`SELECT payload FROM ingest_characters WHERE source_provider=? AND config_key=?`).all(config.sourceProvider, config.configKey);
  const relRows: any[] = d.prepare(`SELECT id, payload FROM ingest_relations WHERE source_provider=? AND config_key=?`).all(config.sourceProvider, config.configKey);

  const relationLookup: Record<number, any> = {};
  for (const row of relRows) relationLookup[Number(row.id)] = JSON.parse(row.payload);

  return {
    media: mediaRows.map((r) => JSON.parse(r.payload)),
    people: peopleRows.map((r) => JSON.parse(r.payload)),
    characters: charRows.map((r) => JSON.parse(r.payload)),
    relationLookup
  };
}

function upsertRows(table: string, sourceProvider: string, configKey: string, rows: Array<{ id: number; payload: unknown }>): void {
  if (!rows.length) return;
  const d = getDb();
  const stmt = d.prepare(`
    INSERT INTO ${table} (source_provider, config_key, id, payload, updated_at)
    VALUES (?, ?, ?, ?, datetime('now'))
    ON CONFLICT(source_provider, config_key, id)
    DO UPDATE SET payload=excluded.payload, updated_at=datetime('now')
  `);
  for (const row of rows) stmt.run(sourceProvider, configKey, row.id, JSON.stringify(row.payload));
}

export async function upsertBatchSnapshot(params: {
  sourceProvider: string;
  configKey: string;
  media: Array<{ id: number; payload: unknown }>;
  people: Array<{ id: number; payload: unknown }>;
  characters: Array<{ id: number; payload: unknown }>;
  relations: Array<{ id: number; payload: unknown }>;
  checkpointId: number;
  nextBatchId: number;
  lastCompletedBatchId: number;
  checkpointStatus: CheckpointStatus;
  lastError: string | null;
}): Promise<void> {
  const d = getDb();
  d.exec('BEGIN');
  try {
    upsertRows('ingest_media', params.sourceProvider, params.configKey, params.media);
    upsertRows('ingest_people', params.sourceProvider, params.configKey, params.people);
    upsertRows('ingest_characters', params.sourceProvider, params.configKey, params.characters);
    upsertRows('ingest_relations', params.sourceProvider, params.configKey, params.relations);
    d.prepare(`UPDATE ingest_checkpoints SET next_batch_id=?, last_completed_batch_id=?, status=?, last_error=?, updated_at=datetime('now') WHERE id=?`)
      .run(params.nextBatchId, params.lastCompletedBatchId, params.checkpointStatus, params.lastError, params.checkpointId);
    d.exec('COMMIT');
  } catch (error) {
    d.exec('ROLLBACK');
    throw error;
  }
}

export async function getCheckpointStatus(): Promise<{ count: number; last: IngestCheckpoint | null }> {
  await ensureDbSchema();
  const d = getDb();
  const count = Number((d.prepare('SELECT COUNT(*) as c FROM ingest_checkpoints').get() as any).c ?? 0);
  const row = d.prepare('SELECT * FROM ingest_checkpoints ORDER BY updated_at DESC LIMIT 1').get();
  return { count, last: row ? mapCheckpoint(row) : null };
}
