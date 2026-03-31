CREATE TABLE IF NOT EXISTS ingest_state (
  key   TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS leases (
  name       TEXT PRIMARY KEY,
  owner      TEXT,
  expires_at INTEGER
);

CREATE TABLE IF NOT EXISTS batches (
  batch_id   INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_type TEXT    NOT NULL,
  scope_key  TEXT    NOT NULL UNIQUE,
  status     TEXT    NOT NULL DEFAULT 'PENDING',
  attempts   INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
);

CREATE INDEX IF NOT EXISTS idx_batches_status ON batches(status);
CREATE INDEX IF NOT EXISTS idx_batches_type_status ON batches(batch_type, status);

CREATE TABLE IF NOT EXISTS media (
  id           INTEGER PRIMARY KEY,
  type         TEXT,
  format       TEXT,
  season_year  INTEGER,
  popularity   INTEGER,
  average_score INTEGER,
  title_romaji  TEXT,
  title_english TEXT,
  title_native  TEXT,
  cover_large   TEXT,
  cover_color   TEXT,
  genres_json   TEXT,
  tags_json     TEXT,
  studios_json  TEXT,
  updated_at    INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
);

CREATE TABLE IF NOT EXISTS media_relations (
  media_id         INTEGER,
  related_media_id INTEGER,
  relation_type    TEXT,
  PRIMARY KEY (media_id, related_media_id, relation_type)
);

CREATE TABLE IF NOT EXISTS people (
  id          INTEGER PRIMARY KEY,
  name_full   TEXT,
  name_native TEXT,
  language    TEXT,
  image_large TEXT,
  site_url    TEXT,
  description TEXT,
  updated_at  INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
);

CREATE TABLE IF NOT EXISTS credits (
  media_id        INTEGER,
  person_id       INTEGER,
  role            TEXT,
  is_voice_actor  INTEGER NOT NULL DEFAULT 0,
  is_localization INTEGER NOT NULL DEFAULT 0,
  weight          REAL    NOT NULL DEFAULT 1.0,
  PRIMARY KEY (media_id, person_id, role, is_voice_actor)
);

CREATE INDEX IF NOT EXISTS idx_credits_person ON credits(person_id);
CREATE INDEX IF NOT EXISTS idx_credits_media  ON credits(media_id);

CREATE TABLE IF NOT EXISTS characters (
  id          INTEGER PRIMARY KEY,
  name_full   TEXT,
  name_native TEXT,
  image_large TEXT,
  site_url    TEXT,
  updated_at  INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
);

CREATE TABLE IF NOT EXISTS character_appearances (
  media_id     INTEGER,
  character_id INTEGER,
  role         TEXT,
  PRIMARY KEY (media_id, character_id)
);

CREATE TABLE IF NOT EXISTS character_voice_actors (
  media_id      INTEGER,
  character_id  INTEGER,
  va_person_id  INTEGER,
  PRIMARY KEY (media_id, character_id, va_person_id)
);
