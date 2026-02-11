-- Durable ingest checkpointing + entity storage
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

CREATE TABLE IF NOT EXISTS ingest_media (
  source_provider TEXT NOT NULL,
  config_key TEXT NOT NULL,
  id BIGINT NOT NULL,
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (source_provider, config_key, id)
);

CREATE TABLE IF NOT EXISTS ingest_people (
  source_provider TEXT NOT NULL,
  config_key TEXT NOT NULL,
  id BIGINT NOT NULL,
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (source_provider, config_key, id)
);

CREATE TABLE IF NOT EXISTS ingest_characters (
  source_provider TEXT NOT NULL,
  config_key TEXT NOT NULL,
  id BIGINT NOT NULL,
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (source_provider, config_key, id)
);

CREATE TABLE IF NOT EXISTS ingest_relations (
  source_provider TEXT NOT NULL,
  config_key TEXT NOT NULL,
  id BIGINT NOT NULL,
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (source_provider, config_key, id)
);
