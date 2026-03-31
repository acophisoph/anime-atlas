# Ingest Debugging Guide

This guide covers how to inspect the SQLite database, interpret `db:status` output, diagnose
common failure modes, reset specific batch types, and verify the generated artifacts.

---

## Prerequisites

- **sqlite3 CLI** — install via your package manager, or use the bundled binary if available.
  On macOS: `brew install sqlite`. On Ubuntu: `apt install sqlite3`.
- **Node.js 20+** — for running `scripts/` commands.
- The database is at `scripts/.cache/anime-atlas.sqlite` by default.
  Override with `DB_PATH=/path/to/other.sqlite node …`.

---

## 1. Using `db:status`

```bash
npm run db:status
```

This runs `scripts/commands/db-status.js` and prints a summary like:

```
[status] DB: scripts/.cache/anime-atlas.sqlite
[status] Batch summary:
  DONE:    124
  PENDING:  76
  FAILED:    2
  RUNNING:   0
[status] media=620  people=1840
[status] credits=12400  relations=380
[status] Last ingest run: 2024-03-28T14:30:00.000Z
[status] Completeness:
  Staff coverage: 590/620 (95.2%)
  Character coverage: 580/620 (93.5%)
```

Any `FAILED` count > 0 or `RUNNING` count > 0 after a run ends indicates a problem.

---

## 2. Inspecting the Database Directly

Open a SQLite shell:

```bash
sqlite3 scripts/.cache/anime-atlas.sqlite
```

### Useful queries

**Check batch status breakdown:**
```sql
SELECT status, COUNT(*) as n FROM batches GROUP BY status;
```

**See all FAILED batches:**
```sql
SELECT batch_id, batch_type, scope_key, attempts, last_error
FROM batches
WHERE status = 'FAILED'
ORDER BY batch_id;
```

**Find RUNNING batches stuck from a crashed run:**
```sql
SELECT batch_id, scope_key, updated_at,
       (strftime('%s','now') * 1000 - updated_at) / 1000 as stale_secs
FROM batches
WHERE status = 'RUNNING';
```

**Count media by type:**
```sql
SELECT type, COUNT(*) as n FROM media GROUP BY type;
```

**Find media without any staff credits:**
```sql
SELECT m.id, m.title_romaji
FROM media m
WHERE NOT EXISTS (
  SELECT 1 FROM credits c
  WHERE c.media_id = m.id AND c.is_voice_actor = 0
);
```

**Find media without characters:**
```sql
SELECT m.id, m.title_romaji
FROM media m
WHERE NOT EXISTS (
  SELECT 1 FROM character_appearances ca WHERE ca.media_id = m.id
);
```

**Check recent ingest state:**
```sql
SELECT key, value FROM ingest_state;
```

**List top-10 most-credited people:**
```sql
SELECT p.name_full, COUNT(*) as credits
FROM credits c
JOIN people p ON p.id = c.person_id
WHERE c.is_localization = 0 AND c.is_voice_actor = 0
GROUP BY c.person_id
ORDER BY credits DESC
LIMIT 10;
```

---

## 3. Common Failure Modes

### A. `FAILED` batches with "429 Too Many Requests"

**Cause**: The ingest ran too fast and hit the AniList rate limit. The retry logic should
handle transient 429s automatically, but if all 5 attempts fail:

**Fix**:
```sql
-- Reset failed batches to retry
UPDATE batches SET status='PENDING', attempts=0, last_error=NULL
WHERE status='FAILED' AND last_error LIKE '%429%';
```

Then re-run `npm run ingest:batched`. Consider reducing `RUN_BATCH_LIMIT` or increasing
the sleep between runs.

### B. `FAILED` batches with "Network error" / "ECONNRESET"

**Cause**: Transient network issue during a GitHub Actions run.

**Fix**: Same reset query as above, replacing `%429%` with `%ECONNRESET%` or `%fetch%`.

### C. Batches stuck as `RUNNING` after process crash

**Cause**: The process was killed (OOM kill, Actions timeout, Ctrl-C) while a batch was
being processed. The lease was not released.

**Fix**:
```sql
-- Reset stale RUNNING batches (older than 30 minutes)
UPDATE batches
SET status = 'PENDING'
WHERE status = 'RUNNING'
  AND (strftime('%s','now') * 1000 - updated_at) > 1800000;

-- Clear the stale lease
DELETE FROM leases WHERE name = 'ingest';
```

### D. `Error: SQLITE_CORRUPT` or `Error: SQLITE_BUSY`

**Cause**: Database file corruption (rare) or two concurrent ingest processes fighting over
the same file. The lease table should prevent the latter, but filesystem-level issues can bypass it.

**Fix**:
```bash
# Verify integrity
sqlite3 scripts/.cache/anime-atlas.sqlite "PRAGMA integrity_check;"

# If corrupted, restore from the last committed data/ artifacts and re-run ingest
# (there is no automatic backup — only the committed data/ files in git are safe)
```

### E. `data/points.bin` size mismatch after build

**Cause**: The artifact builder wrote a different number of points than expected. Usually means
the manifest's `points_count` is out of sync.

**Fix**: Re-run the artifact builder:
```bash
npm run build:artifacts
```
Then verify:
```bash
node -e "const fs=require('fs'); const s=fs.statSync('data/points.bin').size; console.log(s, '==', 16 + (s-16)/28 | 0, 'points');"
```

### F. Missing `description` for people

**Cause**: `QueryPerson` batches haven't run yet for those IDs.

**Check**:
```sql
SELECT COUNT(*) FROM people WHERE description IS NULL OR description = '';
```

**Fix**: The `JIKAN_PATCH` batch type handles this. If no such batches exist:
```sql
-- Manually seed person-enrichment batches for people with no description
INSERT OR IGNORE INTO batches (batch_type, scope_key, status)
SELECT 'JIKAN_PATCH', 'PERSON:' || id, 'PENDING'
FROM people
WHERE description IS NULL OR description = '';
```

---

## 4. Resetting / Re-running Specific Batch Types

### Re-run all ANIME list pages

```sql
UPDATE batches SET status='PENDING', attempts=0
WHERE batch_type = 'ANIME_LIST';
```

### Re-run staff for a specific media ID (e.g., ID 42)

```sql
UPDATE batches SET status='PENDING', attempts=0
WHERE scope_key LIKE 'MEDIA_STAFF:42:%';
```

### Re-run all failed character batches

```sql
UPDATE batches SET status='PENDING', attempts=0
WHERE batch_type = 'MEDIA_CHARACTERS' AND status = 'FAILED';
```

### Nuke and re-seed everything (full re-ingest)

```bash
rm scripts/.cache/anime-atlas.sqlite
npm run ingest:batched   # will re-seed from page 1
```

**Warning**: This erases all accumulated data. Only do this if the DB is corrupted or you
want to fetch fresh data from scratch.

---

## 5. Verifying Artifacts

After running `npm run build:artifacts`, verify the output:

### Quick size check
```bash
node -e "
const fs = require('fs');
const files = [
  'data/points.bin',
  'data/graph_media_relations.bin',
  'data/graph_media_staff.bin',
  'data/graph_people_collab.bin',
];
for (const f of files) {
  try { console.log(f, fs.statSync(f).size, 'bytes'); }
  catch { console.log(f, 'MISSING'); }
}
"
```

### Full sanity check
```bash
npm run sanity:artifacts
```

`scripts/commands/sanity-artifacts.js` checks:
- `manifest.json` is valid JSON and has the expected shape.
- `points.bin` magic bytes are correct and size matches `count`.
- All graph `.bin` files have correct magic bytes.
- Every ID in `search.json` has a corresponding entry in the meta chunk lookup.
- Every chunk filename in the lookup maps to an actual file in `data/meta/`.

### Manually verify a single point record

```js
// node
const fs = require('fs');
const buf = fs.readFileSync('data/points.bin');
const magic = buf.readUInt32LE(0);
const count = buf.readUInt32LE(8);
console.log('magic:', magic.toString(16));  // should be 41544c50
console.log('count:', count);
// Read first point
const id    = buf.readInt32LE(16);
const x     = buf.readFloatLE(20);
const y     = buf.readFloatLE(24);
const kind  = buf.readUInt32LE(28);
console.log('first point:', { id, x, y, kind });
```

### Check manifest completeness flags
```bash
node -e "console.log(JSON.parse(require('fs').readFileSync('data/manifest.json','utf8')))"
```

Look for `completeness.is_partial: false` to confirm a full ingest has been built.

---

## 6. Environment Variables

| Variable            | Default                                     | Purpose                                         |
|---------------------|---------------------------------------------|-------------------------------------------------|
| `DB_PATH`           | `scripts/.cache/anime-atlas.sqlite`         | Path to SQLite database                         |
| `DATA_DIR`          | `data/`                                     | Output directory for artifacts                  |
| `TIME_BUDGET_MINUTES` | `270`                                     | Max minutes a single ingest run may last        |
| `RUN_BATCH_LIMIT`   | `40`                                        | Max batches processed per ingest run            |
| `BATCH_MAX_RETRIES` | `5`                                         | Failures before a batch is marked FAILED        |
| `ANILIST_TOKEN`     | (unset)                                     | Bearer token for higher rate limits             |
