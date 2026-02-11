import os from 'node:os';
import { Pool, type PoolClient } from 'pg';

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

const DATABASE_URL = process.env.DATABASE_URL;

let pool: Pool | null = null;

export function hasDatabase(): boolean {
  return Boolean(DATABASE_URL);
}

export function getLeaseOwner(): string {
  return process.env.GITHUB_RUN_ID ? `gha-${process.env.GITHUB_RUN_ID}` : `local-${os.hostname()}-${process.pid}`;
}

export function getPool(): Pool {
  if (!DATABASE_URL) {
    throw new Error('DATABASE_URL is required for durable ingest mode.');
  }
  if (!pool) {
    pool = new Pool({ connectionString: DATABASE_URL, max: 4 });
  }
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

export async function ensureDbSchema(): Promise<void> {
  const p = getPool();
  await p.query(`
    CREATE TABLE IF NOT EXISTS ingest_checkpoints (
      id BIGSERIAL PRIMARY KEY,
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
      lease_expires_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (source_provider, dataset, config_key)
    );
  `);

  await p.query(`
    CREATE TABLE IF NOT EXISTS ingest_media (
      source_provider TEXT NOT NULL,
      config_key TEXT NOT NULL,
      id BIGINT NOT NULL,
      payload JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (source_provider, config_key, id)
    );
  `);

  await p.query(`
    CREATE TABLE IF NOT EXISTS ingest_people (
      source_provider TEXT NOT NULL,
      config_key TEXT NOT NULL,
      id BIGINT NOT NULL,
      payload JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (source_provider, config_key, id)
    );
  `);

  await p.query(`
    CREATE TABLE IF NOT EXISTS ingest_characters (
      source_provider TEXT NOT NULL,
      config_key TEXT NOT NULL,
      id BIGINT NOT NULL,
      payload JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (source_provider, config_key, id)
    );
  `);

  await p.query(`
    CREATE TABLE IF NOT EXISTS ingest_relations (
      source_provider TEXT NOT NULL,
      config_key TEXT NOT NULL,
      id BIGINT NOT NULL,
      payload JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
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
    topAnime: row.top_anime,
    topManga: row.top_manga,
    nextBatchId: row.next_batch_id,
    lastCompletedBatchId: row.last_completed_batch_id,
    status: row.status,
    lastError: row.last_error,
    leaseOwner: row.lease_owner,
    leaseExpiresAt: row.lease_expires_at,
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
  const p = getPool();
  await p.query(
    `INSERT INTO ingest_checkpoints (source_provider, dataset, config_key, top_anime, top_manga, status)
     VALUES ($1,$2,$3,$4,$5,'running')
     ON CONFLICT (source_provider, dataset, config_key) DO NOTHING`,
    [params.sourceProvider, params.dataset, params.configKey, params.topAnime, params.topManga]
  );
  const res = await p.query(
    `SELECT * FROM ingest_checkpoints WHERE source_provider=$1 AND dataset=$2 AND config_key=$3`,
    [params.sourceProvider, params.dataset, params.configKey]
  );
  return mapCheckpoint(res.rows[0]);
}

export async function tryAcquireLease(id: number, leaseOwner: string, leaseMinutes = 30): Promise<boolean> {
  const p = getPool();
  const res = await p.query(
    `UPDATE ingest_checkpoints
       SET lease_owner=$2,
           lease_expires_at=NOW() + ($3 || ' minutes')::interval,
           status='running',
           updated_at=NOW()
     WHERE id=$1
       AND (lease_expires_at IS NULL OR lease_expires_at < NOW() OR lease_owner=$2)`,
    [id, leaseOwner, String(leaseMinutes)]
  );
  return res.rowCount > 0;
}

export async function renewLease(id: number, leaseOwner: string, leaseMinutes = 30): Promise<void> {
  const p = getPool();
  await p.query(
    `UPDATE ingest_checkpoints
     SET lease_expires_at=NOW() + ($3 || ' minutes')::interval, updated_at=NOW()
     WHERE id=$1 AND lease_owner=$2`,
    [id, leaseOwner, String(leaseMinutes)]
  );
}

export async function updateCheckpointProgress(id: number, nextBatchId: number, lastCompletedBatchId: number, status: CheckpointStatus, lastError: string | null): Promise<void> {
  const p = getPool();
  await p.query(
    `UPDATE ingest_checkpoints
      SET next_batch_id=$2,
          last_completed_batch_id=$3,
          status=$4,
          last_error=$5,
          updated_at=NOW()
      WHERE id=$1`,
    [id, nextBatchId, lastCompletedBatchId, status, lastError]
  );
}

export async function releaseLease(id: number, leaseOwner: string): Promise<void> {
  const p = getPool();
  await p.query(
    `UPDATE ingest_checkpoints
       SET lease_owner=NULL, lease_expires_at=NULL, updated_at=NOW()
     WHERE id=$1 AND lease_owner=$2`,
    [id, leaseOwner]
  );
}

export async function loadEntityMaps(config: { sourceProvider: string; configKey: string }): Promise<{
  media: any[];
  people: any[];
  characters: any[];
  relationLookup: Record<number, any>;
}> {
  const p = getPool();
  const [mediaRows, peopleRows, charRows, relRows] = await Promise.all([
    p.query(`SELECT payload FROM ingest_media WHERE source_provider=$1 AND config_key=$2`, [config.sourceProvider, config.configKey]),
    p.query(`SELECT payload FROM ingest_people WHERE source_provider=$1 AND config_key=$2`, [config.sourceProvider, config.configKey]),
    p.query(`SELECT payload FROM ingest_characters WHERE source_provider=$1 AND config_key=$2`, [config.sourceProvider, config.configKey]),
    p.query(`SELECT id, payload FROM ingest_relations WHERE source_provider=$1 AND config_key=$2`, [config.sourceProvider, config.configKey])
  ]);

  const relationLookup: Record<number, any> = {};
  for (const row of relRows.rows) relationLookup[Number(row.id)] = row.payload;

  return {
    media: mediaRows.rows.map((r) => r.payload),
    people: peopleRows.rows.map((r) => r.payload),
    characters: charRows.rows.map((r) => r.payload),
    relationLookup
  };
}

async function upsertRows(client: PoolClient, table: string, sourceProvider: string, configKey: string, rows: Array<{ id: number; payload: unknown }>): Promise<void> {
  if (!rows.length) return;
  const values: string[] = [];
  const params: unknown[] = [];
  let i = 1;
  for (const row of rows) {
    values.push(`($${i++},$${i++},$${i++},$${i++}::jsonb,NOW())`);
    params.push(sourceProvider, configKey, row.id, JSON.stringify(row.payload));
  }
  await client.query(
    `INSERT INTO ${table} (source_provider, config_key, id, payload, updated_at) VALUES ${values.join(',')}
     ON CONFLICT (source_provider, config_key, id)
     DO UPDATE SET payload=EXCLUDED.payload, updated_at=NOW()`,
    params
  );
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
  const p = getPool();
  const client = await p.connect();
  try {
    await client.query('BEGIN');
    await upsertRows(client, 'ingest_media', params.sourceProvider, params.configKey, params.media);
    await upsertRows(client, 'ingest_people', params.sourceProvider, params.configKey, params.people);
    await upsertRows(client, 'ingest_characters', params.sourceProvider, params.configKey, params.characters);
    await upsertRows(client, 'ingest_relations', params.sourceProvider, params.configKey, params.relations);
    await client.query(
      `UPDATE ingest_checkpoints
         SET next_batch_id=$2,
             last_completed_batch_id=$3,
             status=$4,
             last_error=$5,
             updated_at=NOW()
       WHERE id=$1`,
      [params.checkpointId, params.nextBatchId, params.lastCompletedBatchId, params.checkpointStatus, params.lastError]
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
