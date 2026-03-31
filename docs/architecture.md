# Anime Atlas — Architecture

## System Overview

Anime Atlas is a static-site data-visualization project. It presents an interactive 2-D scatter plot
("atlas") of anime and manga titles, together with the people who made them. There is no runtime
server: the finished product is a folder of pre-built files served from GitHub Pages (or any CDN).

The system has two distinct phases:

```
Phase 1 — Ingest (local / CI)               Phase 2 — Frontend (browser)
─────────────────────────────                ──────────────────────────────
AniList GraphQL API                          data/points.bin (WebGL sprites)
       │                                     data/clusters.json
       ▼                                     data/graph_*.bin
  Layer A: SQLite ingest                     data/index/search.json
       │                                     data/meta/*.json
       ▼                                          │
  Layer B: artifact builder ──────────────────► Vite/React app (app/)
       │
       ▼
   data/  (static files committed to repo)
```

When a visitor opens the site, the browser fetches only what it needs. The WebGL canvas loads
`points.bin` first (~1 KB per 35 points), which is enough to render the full map. Metadata (title,
score, genres) is fetched lazily per visible tile as the user zooms.

---

## Monorepo Structure

```
anime-atlas/
├── app/                    # Vite + React + TypeScript frontend
│   ├── src/
│   │   ├── components/     # UI components (Header, DetailDrawer, AtlasCanvas, …)
│   │   ├── lib/            # atlas-renderer.ts, data-loader.ts, graph-utils.ts, store.ts
│   │   └── types/          # Shared TypeScript interfaces
│   └── vite.config.ts
├── data/                   # Generated static artifacts (committed)
│   ├── manifest.json       # Build metadata & completeness flags
│   ├── clusters.json       # Cluster centroids for legend overlay
│   ├── points.bin          # Binary point cloud (16-byte header + 28 bytes × N)
│   ├── graph_media_relations.bin
│   ├── graph_media_staff.bin
│   ├── graph_people_collab.bin
│   ├── index/
│   │   ├── search.json         # Flat search index (all titles + names)
│   │   ├── tag_to_media.json   # Tag → media ID list
│   │   └── role_to_people.json # Role → person ID list
│   ├── lookup/
│   │   ├── media_to_meta_chunk.json
│   │   └── people_to_meta_chunk.json
│   └── meta/
│       ├── media_00000.json    # Detailed media objects (up to 500 per chunk)
│       └── people_00000.json
├── scripts/                # Node.js ingest + build pipeline
│   ├── commands/
│   │   ├── ingest-batched.js   # Layer A: fetch from AniList and write to SQLite
│   │   ├── build-artifacts.js  # Layer B: read SQLite, write data/
│   │   ├── db-status.js        # Operational diagnostics
│   │   ├── sanity-artifacts.js # Post-build verification
│   │   ├── sync-data.js        # Copy data/ into app/public/ before dev/build
│   │   └── gen-sample-data.js  # Generate synthetic data (no DB needed)
│   ├── db/
│   │   ├── migrate.js
│   │   └── migrations/001_initial.sql
│   └── lib/
│       ├── batch-executor.js
│       ├── binary-writer.js
│       ├── clustering.js
│       ├── coordinates.js
│       ├── http-client.js
│       ├── lease.js
│       ├── queries.js
│       └── roles.js
├── docs/                   # This directory
└── .github/workflows/
    ├── ingest.yml          # Scheduled ingest (cron, writes to DB, commits data/)
    └── deploy.yml          # Build + publish to GitHub Pages
```

---

## Layer A — SQLite Ingest

Layer A is implemented in `scripts/commands/ingest-batched.js` and
`scripts/lib/batch-executor.js`. Its job is to call the AniList GraphQL API and persist
everything into a local SQLite database (`scripts/.cache/anime-atlas.sqlite`).

### Batch table contract

Work is tracked in a `batches` table. Each row represents one HTTP call:

| Column       | Description                                         |
|-------------|-----------------------------------------------------|
| `batch_type` | `ANIME_LIST`, `MANGA_LIST`, `MEDIA_STAFF`, `MEDIA_CHARACTERS`, `JIKAN_PATCH` |
| `scope_key`  | Unique key, e.g. `ANIME:page:1` or `MEDIA_STAFF:42:1` |
| `status`     | `PENDING` → `RUNNING` → `DONE` / `FAILED`          |
| `attempts`   | Incremented on each error; max 5 before `FAILED`    |

On startup `ingest-batched.js` calls `seedInitialBatches()`, which inserts the first
`ANIME_LIST` and `MANGA_LIST` page batches if none exist. As those list pages are processed,
new `MEDIA_STAFF` and `MEDIA_CHARACTERS` batches are dynamically inserted for every media ID
that was discovered.

### Resume semantics

Because all state lives in SQLite, the ingest is fully resumable:

- Crash mid-run → rows stay `RUNNING`; on next run they are treated as stale and reset to `PENDING`
  (the batch executor compares `updated_at` to a staleness threshold).
- HTTP error → row transitions `PENDING` → `PENDING` (attempt counter incremented).
- After `BATCH_MAX_RETRIES` (default 5) failures → `FAILED` (never retried automatically).

Re-running `npm run ingest:batched` from the same DB simply continues from where it left off.

### Rate limiting

All HTTP calls go through `scripts/lib/http-client.js`, which enforces the AniList
rate-limit budget:

- 90 requests per 60-second window.
- Backs off with exponential jitter on 429 responses.
- The GitHub Actions workflow schedules ingest runs with enough headroom that the 60-second
  rolling window is never exhausted mid-batch.

---

## Layer B — Artifact Builder

Layer B (`scripts/commands/build-artifacts.js`) reads the SQLite database and writes every
file under `data/`. It is idempotent: running it twice produces identical output for the same
database state.

### Coordinate computation

1. Each media row is converted to a numeric feature vector (genres, tags, score, year, …) by
   `buildMediaFeatureVectors()` in `scripts/lib/coordinates.js`.
2. UMAP (`umap-js`) reduces the vectors to 2-D coordinates.
3. `normalizeCoords()` maps the result to `[-1, 1]` on both axes.
4. People are embedded using a similar pipeline that weighs their credits against the
   genres/tags of the media they worked on.

### Clustering

`scripts/lib/clustering.js` runs k-means (`ml-kmeans`) on the combined (media + people)
point cloud. Each cluster gets a human-readable label derived from the most common genres/roles
in its membership. The result is written to `data/clusters.json` as an array of centroid objects.

### Graph construction

Three binary graph files are produced:

| File                        | Nodes      | Edges                                    |
|-----------------------------|------------|------------------------------------------|
| `graph_media_relations.bin` | Media IDs  | Sequel / prequel / adaptation relations  |
| `graph_media_staff.bin`     | Media IDs  | Staff overlap (shared crew)              |
| `graph_people_collab.bin`   | Person IDs | Collaboration (worked on same title)     |

Staff overlap is computed from the `credits` table. For every pair of media that share a staff
member, an overlap score accumulates. Only pairs that exceed `STAFF_OVERLAP_THRESHOLD` (1.5) and
each node's top-`K` (30) edges by weight are kept.

---

## Frontend Architecture

The frontend is a Vite + React + TypeScript SPA located in `app/`. It uses **no server-side
rendering**; everything runs in the browser.

### WebGL rendering (`atlas-renderer.ts`)

The scatter plot is drawn with raw WebGL (no Three.js). Each point is a sprite rendered as a
gl.POINTS primitive with:
- Position from `points.bin`.
- Size proportional to `popularity`.
- Color from the packed `colorRGB` field.
- Highlight/selection state managed via a uniform array.

The renderer exposes `pick(screenX, screenY)` (GPU readback or CPU bounding-box fallback) to
identify hovered and clicked points. It also renders edge lines for the active graph layer.

### State management (`store.ts`)

Global state is a lightweight custom store (no Redux/Zustand dependency). Key slices:

- `mode`: `"media"` or `"people"` — which point cloud is primary.
- `selected`: currently clicked point ID.
- `hovered`: currently hovered point ID.
- `filters`: active genre/tag/role filters.
- `graphLayer`: which graph binary is currently visualized.
- `searchQuery`: current search string.

### Progressive data loading (`data-loader.ts`)

The loader implements a priority queue with three tiers:

1. **Tier 0 (blocking)** — `points.bin`, `clusters.json`, `manifest.json`. Fetched before
   first paint.
2. **Tier 1 (fast-follow)** — `index/search.json`, `index/tag_to_media.json`,
   `index/role_to_people.json`. Loaded after first render.
3. **Tier 2 (on-demand)** — Meta chunks and graph binaries. Fetched only when a user clicks a
   point or opens a filter panel.

Chunk files are cached in a `Map<chunkName, Promise<object>>` so concurrent requests for the
same chunk coalesce into a single fetch.

### Graph visualisation (`graph-utils.ts`)

When the user activates a graph overlay, `graph-utils.ts` parses the binary graph file and
builds an adjacency map of `{sourceId → [{targetId, weight, edgeType}]}`. The renderer uses
this to draw weighted edges between point sprites.

---

## Data Flow Diagram

```
                    ┌──────────────────────────────────────┐
                    │          AniList GraphQL API          │
                    └────────────────┬─────────────────────┘
                                     │ HTTPS (90 req/min)
                    ┌────────────────▼─────────────────────┐
                    │   ingest-batched.js  (Layer A)        │
                    │  ┌──────────────────────────────┐    │
                    │  │  batches table  (resume log)  │    │
                    │  └──────────────────────────────┘    │
                    │  ┌──────────────────────────────┐    │
                    │  │  media / people / credits     │    │
                    │  │  media_relations              │    │
                    │  └──────────────────────────────┘    │
                    │          SQLite DB                    │
                    └────────────────┬─────────────────────┘
                                     │
                    ┌────────────────▼─────────────────────┐
                    │   build-artifacts.js  (Layer B)       │
                    │   UMAP coords · k-means clusters      │
                    │   graph construction                  │
                    └────────────────┬─────────────────────┘
                                     │
              ┌──────────────────────▼────────────────────────────┐
              │                    data/                           │
              │  manifest.json   clusters.json   points.bin        │
              │  graph_media_relations.bin                         │
              │  graph_media_staff.bin                             │
              │  graph_people_collab.bin                           │
              │  index/  lookup/  meta/                            │
              └──────────────────────┬────────────────────────────┘
                                     │ committed to git
                    ┌────────────────▼─────────────────────┐
                    │        Vite build (app/)               │
                    │   sync-data.js copies data/ →          │
                    │   app/public/data/                     │
                    └────────────────┬─────────────────────┘
                                     │
                    ┌────────────────▼─────────────────────┐
                    │        GitHub Pages CDN                │
                    │  Browser: WebGL + React SPA            │
                    └──────────────────────────────────────┘
```
