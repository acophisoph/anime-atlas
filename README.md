# Anime Atlas (Static GitHub Pages)

Anime/Manga Atlas + Networking-lite built with **Vite + React + TypeScript**, backed by offline precomputed data artifacts generated in GitHub Actions.

## Architecture Overview

- `scripts/`: ingest and build pipeline (anonymous AniList GraphQL -> minimal artifacts).
- `data/`: generated artifacts (`manifest`, `points.bin` or `points.json`, graph artifacts, indices, chunked metadata).
- `app/`: static client that only downloads `/data/*` artifacts (never calls AniList).
- `.github/workflows/build-and-deploy.yml`: scheduled/dispatch ingestion + build + Pages deploy.

## Static-only compliance

- No database, no server runtime.
- Browser consumes only local artifacts from `app/public/data`.
- AniList API calls happen only in scripts (CI/local ingestion).

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

1. checkout + setup Node 20
2. restore `scripts/.cache`
3. ingest AniList + build artifacts
4. copy artifacts to `app/public/data`
5. Vite build with `BASE_PATH=/${REPO}/`
6. `actions/upload-pages-artifact@v3`
7. `actions/deploy-pages@v4`

## Attribution

Data powered by [AniList](https://anilist.co).
