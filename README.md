# Anime Atlas (Static GitHub Pages)

Anime/Manga Atlas + Networking-lite built with **Vite + React + TypeScript**, backed by offline precomputed data artifacts generated in GitHub Actions.

## Architecture Overview

- `scripts/`: ingest and build pipeline (anonymous AniList GraphQL -> minimal artifacts).
- `data/`: generated artifacts (`manifest`, `points.bin` or `points.json`, graph artifacts, indices, chunked metadata).
- `app/`: static client that only downloads `/data/*` artifacts (never calls AniList).
- `.github/workflows/ingest.yml`: durable DB-backed batched ingestion (scheduled/manual).
- `.github/workflows/build-and-deploy.yml`: Pages build/deploy from already ingested DB data.

## Runtime model

- Browser remains static and consumes only local artifacts from `app/public/data`.
- Ingestion scripts use AniList/Jikan and persist durable progress/data in Postgres (`DATABASE_URL`).
- Pages workflow only builds static artifacts/site; it does not perform heavy ingestion.

## Local development

```bash
npm install
npm run ingest:mvp          # fetch top 100 anime + top 100 manga (configurable)
npm run build:artifacts     # produce binaries + indices + manifest into /data
npm run sanity:artifacts    # artifact integrity checks
npm run sync:data           # copy /data to /app/public/data
npm run dev                 # start Vite app
```

Build production site:

```bash
BASE_PATH=/anime-atlas/ npm run build:site
```


## Automated batched ingestion (durable + resumable)

Ingestion now commits each successful batch to Postgres and advances a DB checkpoint (`ingest_checkpoints`) so progress survives workflow failures/cancellations.

Local run:

```bash
DATABASE_URL=postgres://... \
TIME_BUDGET_MINUTES=320 \
SOURCE_PROVIDER=ANILIST TOP_ANIME=2500 TOP_MANGA=2500 \
npm run ingest:batched -w scripts
```

Behavior:

- acquires a lease on checkpoint row to prevent overlapping runners
- processes batches sequentially, upserting media/people/characters/relations each batch
- advances `next_batch_id` only after DB writes complete
- exits cleanly on `SIGTERM`/`SIGINT` or near `TIME_BUDGET_MINUTES`
- next run resumes from checkpoint `next_batch_id`

Inspect checkpoint progress:

```sql
SELECT id, source_provider, config_key, next_batch_id, last_completed_batch_id, status, last_error, lease_owner, lease_expires_at, updated_at
FROM ingest_checkpoints
ORDER BY updated_at DESC;
```

Reset a checkpoint safely:

```sql
UPDATE ingest_checkpoints
SET next_batch_id = 0,
    last_completed_batch_id = -1,
    status = 'running',
    last_error = NULL,
    lease_owner = NULL,
    lease_expires_at = NULL,
    updated_at = NOW()
WHERE source_provider = 'ANILIST'
  AND config_key = 'ANILIST:2500:2500:50:50';
```

## Scaling to 100k

Edit `scripts/src/config.ts`:

- `topAnime`, `topManga`, `pageSize`
- keep same pipeline; coordinate builder currently deterministic TF features + seeded projection and can be swapped later for UMAP/PCA plugin.

## Data artifacts

- `data/points.bin` preferred record format: `{id:u32,type:u8,x:f32,y:f32,cluster:u16,year:u16}`.
- `data/graph/*.bin` preferred format: `{src:u32,dst:u32,weight:u32}`.
- JSON fallbacks (`points.json`, `graph/*.json`) are supported for environments where binary artifacts are not committed.
- `data/meta/media_*.json`, `people_*.json`, `characters_*.json` for chunked metadata.
- `data/indices/*.json` for search/filter/talent-finder.

## Rate limit and cache

- Throttle: ~1 req/sec in `rateLimit.ts`.
- Retries with exponential backoff for errors/429 in `anilistClient.ts`.
- Adaptive delay from `retry-after` and `x-ratelimit-*` headers when provided.
- Query+variables cache at `scripts/.cache`.
- GitHub Actions persists cache using `actions/cache`.

## GitHub Pages deployment flow

1. ingest workflow (`ingest.yml`) runs every 30 min / manual and writes durable DB checkpoints
2. pages workflow checks out + installs deps
3. `build:artifacts` reads from DB-backed ingest tables
4. copy artifacts to `app/public/data`
5. Vite build with `BASE_PATH=/${REPO}/`
6. `actions/upload-pages-artifact@v3`
7. `actions/deploy-pages@v4`

## Attribution

Data powered by [AniList](https://anilist.co).
