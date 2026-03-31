# Anime Atlas

An interactive 2-D map of anime and manga titles, visualized by genre, theme, and the people
who made them. Powered by AniList data, rendered with WebGL, and deployed as a fully static
site on GitHub Pages — no server required.

---

## Quick Start

```bash
# 1. Clone
git clone https://github.com/YOUR_USERNAME/anime-atlas.git
cd anime-atlas

# 2. Install all workspace dependencies
npm install

# 3. Start the dev server (uses pre-built sample data from data/)
npm run dev
```

The sample data in `data/` is committed to the repo so the site works immediately after cloning
with no API keys or database setup needed.

---

## Project Description

Anime Atlas places every anime and manga title on a canvas according to how similar they are to
each other — similar genres, tags, production style, and staff tend to cluster together. You can:

- **Browse** the 2-D scatter plot, zoom and pan with mouse or touch.
- **Search** titles and people by name (English, romaji, or Japanese).
- **Filter** by genre, tag, studio role, or format.
- **Click** any point to open a detail drawer with metadata fetched on demand.
- **Switch** between media view and people view.
- **Overlay** graph edges showing sequel chains, shared crew, or collaboration networks.

---

## Repository Structure

```
anime-atlas/
├── app/           # Vite + React + TypeScript frontend
├── data/          # Pre-built static data files (committed)
├── docs/          # Architecture and format documentation
├── scripts/       # Node.js ingest pipeline and artifact builder
└── .github/       # CI workflows (ingest + deploy)
```

See [docs/architecture.md](docs/architecture.md) for a full walkthrough.

---

## How the Ingest Pipeline Works

Data is fetched from the [AniList GraphQL API](https://anilist.co/graphiql) in discrete
resumable batches and stored in a local SQLite database. Once the DB has enough data, an
artifact builder reads it and writes all the static files under `data/`.

```
AniList API  →  SQLite (Layer A)  →  data/ artifacts (Layer B)  →  GitHub Pages
```

### Layer A — Batched Ingest

`scripts/commands/ingest-batched.js` fetches one batch per loop iteration and stores results
in `scripts/.cache/anime-atlas.sqlite`. Batches are tracked in a `batches` table with states
`PENDING → RUNNING → DONE / FAILED`, enabling full resume on crash or time-budget exhaustion.

Batch priority order:
1. `ANIME_LIST` — paginate all anime by popularity
2. `MANGA_LIST` — paginate all manga by popularity
3. `MEDIA_STAFF` — fetch staff (director, composer, etc.) per title
4. `MEDIA_CHARACTERS` — fetch characters + voice actors per title
5. `JIKAN_PATCH` — enrich person descriptions

### Layer B — Artifact Builder

`scripts/commands/build-artifacts.js` reads the SQLite DB and produces:

- `data/points.bin` — compact binary point cloud (28 bytes/point)
- `data/clusters.json` — k-means cluster centroids for the legend
- `data/graph_*.bin` — three binary graph files (relations, staff overlap, collaboration)
- `data/index/search.json` — flat search index
- `data/index/tag_to_media.json` — tag → media ID list
- `data/index/role_to_people.json` — role → person ID list
- `data/lookup/*.json` — chunk routing maps
- `data/meta/*.json` — detailed metadata (up to 500 entries per chunk)
- `data/manifest.json` — build metadata and completeness flags

---

## Running Ingest Locally

### Prerequisites

- Node.js 20+
- An AniList account (optional; anonymous access works but has lower rate limits)

### Steps

```bash
# Install dependencies
npm install

# Run one ingest session (default: up to 40 batches in 270 minutes)
npm run ingest:batched

# Check current database state
npm run db:status

# After sufficient data is accumulated, build artifacts
npm run build:artifacts

# Verify the output
npm run sanity:artifacts
```

### Environment Variables

| Variable              | Default  | Description                                 |
|-----------------------|----------|---------------------------------------------|
| `DB_PATH`             | `scripts/.cache/anime-atlas.sqlite` | SQLite path  |
| `DATA_DIR`            | `data/`  | Artifact output directory                   |
| `TIME_BUDGET_MINUTES` | `270`    | Hard time limit per ingest run              |
| `RUN_BATCH_LIMIT`     | `40`     | Max batches per run                         |
| `ANILIST_TOKEN`       | (unset)  | Bearer token for 90 req/min rate limit      |

A full ingest of the top 10,000 anime + manga takes approximately 5–6 GitHub Actions runs
(each run processes ~40 batches over up to 4.5 hours).

---

## Generating Sample Data (No DB Required)

The repo includes a script that produces all data files synthetically:

```bash
node scripts/commands/gen-sample-data.js
```

This creates 20 media entries, 15 people entries, all JSON index/meta/lookup files, and the
three binary graph files. Useful for development without running a real ingest.

---

## Deploying to GitHub Pages

### Automatic Deployment

Every push to `main` triggers the `Deploy` workflow (`.github/workflows/deploy.yml`):

1. Runs `npm run sanity:artifacts` to verify `data/` is healthy.
2. Copies `data/` into `app/public/data/` via `scripts/commands/sync-data.js`.
3. Runs `npm run build:site` (Vite build).
4. Uploads `app/dist/` to GitHub Pages.

No secrets are needed for deployment — GitHub Pages access is granted via the workflow's
`pages: write` permission.

### Manual Deployment

```bash
# Build the site locally
npm run build:site

# The output is in app/dist/ — deploy it to any static host
```

### Setting Up GitHub Pages

1. Go to your repository **Settings → Pages**.
2. Set **Source** to "GitHub Actions".
3. Push to `main` — the workflow handles the rest.

The live URL will be `https://YOUR_USERNAME.github.io/anime-atlas/`.

---

## Automatic Ingest (GitHub Actions)

The `Ingest` workflow (`.github/workflows/ingest.yml`) runs every 6 hours:

1. Restores the SQLite database from GitHub Actions cache.
2. Runs `npm run ingest:batched` (up to 40 batches / 270 min).
3. Runs `npm run build:artifacts` to regenerate `data/`.
4. Commits any changed files under `data/` back to `main` with `[skip ci]` to avoid
   triggering a redundant deploy.
5. The next scheduled deploy run picks up the fresh data.

To trigger ingest manually: **Actions → Ingest → Run workflow**.

---

## Architecture Overview

```
AniList GraphQL API
        │
        ▼ (batched, resumable, rate-limited)
  SQLite Database
        │
        ▼ (UMAP coords · k-means · graph construction)
  data/  (committed static files)
        │
        ▼ (Vite build)
  GitHub Pages  →  Browser (WebGL + React)
```

Full details: [docs/architecture.md](docs/architecture.md)

---

## Documentation

| Document | Description |
|---|---|
| [docs/architecture.md](docs/architecture.md) | System overview, monorepo layout, Layer A/B detail, frontend internals |
| [docs/data-contract-anilist.md](docs/data-contract-anilist.md) | All 4 GraphQL queries, SQLite mappings, pagination, rate limiting, localization rules |
| [docs/binary-format.md](docs/binary-format.md) | `points.bin` and `graph_*.bin` format specs, JavaScript reading code, TypeScript types |
| [docs/ingest-debugging.md](docs/ingest-debugging.md) | SQLite inspection, `db:status`, common failures, reset procedures, artifact verification |

---

## Data Contract Summary

All data originates from the [AniList GraphQL API](https://anilist.co/graphiql):

- **Media** — fetched in pages of 50, sorted by popularity descending.
- **Staff** — fetched per media title (up to 25 staff per page); localization credits excluded.
- **Characters** — fetched per media title (up to 25 per page); includes Japanese voice actors.
- **People** — enriched via a person-detail query when descriptions are missing.

AniList rate limit: 90 requests per 60 seconds (authenticated), 30 (anonymous).

The data is stored locally in SQLite and re-exported to `data/` as static JSON and binary files.
No AniList data is proxied at runtime — the browser only fetches pre-built files from the repo.

---

## License

Data is sourced from AniList under their [terms of service](https://anilist.co/terms).
Code in this repository is MIT licensed.
