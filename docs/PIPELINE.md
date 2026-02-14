# Data Pipeline

## Source of truth
- `data/` is the only committed data source.
- `app/public/data/` is generated at build time by `npm run sync:data` and is not committed.

## Durable ingest workflow
Workflow: `.github/workflows/durable-ingest.yml`

1. Restores SQLite/cache state from `scripts/.cache/anime-atlas.sqlite` and `scripts/.cache/batch-progress`.
2. Runs `npm run ingest:batched -w scripts` to refresh durable checkpointed entities.
3. Runs `npm run build:artifacts -w scripts` from durable SQLite.
4. Runs `npm run sanity:artifacts` to verify required outputs in `data/`.
5. Commits `data/` updates back to `main`.

## Pages workflow
Workflow: `.github/workflows/build-and-deploy.yml`

1. Validates committed `data/` via `npm run sanity:artifacts`.
2. Syncs committed data into `app/public/data` using `npm run sync:data`.
3. Builds the site with `BASE_PATH=/<repo>/`.
4. Deploys `app/dist` to GitHub Pages.

## Debugging
- Check sqlite status locally with `npm run db:status -w scripts`.
- Check artifact validity locally with `npm run sanity:artifacts`.
- In Pages workflow logs, use the `Debug data directories` step output to confirm data presence.
