import fs from 'node:fs/promises';
import path from 'node:path';
import { DATA_DIR } from './config.js';

function envMin(name: string): number {
  const raw = process.env[name];
  if (!raw) return 0;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

async function fileSize(rel: string): Promise<number> {
  const stat = await fs.stat(path.join(DATA_DIR, rel));
  return stat.size;
}

async function requireAnyNonEmpty(paths: string[], label: string): Promise<string> {
  for (const rel of paths) {
    try {
      const size = await fileSize(rel);
      if (size > 0) return rel;
    } catch {
      // try next
    }
  }
  throw new Error(`Missing/invalid required artifact ${label}: expected one of ${paths.join(', ')}`);
}

async function main() {
  const minMediaCount = envMin('MIN_MEDIA_COUNT');
  const minPeopleCount = envMin('MIN_PEOPLE_COUNT');
  const minCharacterCount = envMin('MIN_CHARACTER_COUNT');
  const minPointCount = envMin('MIN_POINT_COUNT');

  await requireAnyNonEmpty(['manifest.json'], 'manifest');
  await requireAnyNonEmpty(['points.bin', 'points.json'], 'points');
  await requireAnyNonEmpty(['indices/search_index.json'], 'search index');

  const metaDir = path.join(DATA_DIR, 'meta');
  const graphDir = path.join(DATA_DIR, 'graph');

  const metaFiles = await fs.readdir(metaDir).catch(() => [] as string[]);
  const graphFiles = await fs.readdir(graphDir).catch(() => [] as string[]);

  const mediaChunks = metaFiles.filter((name) => /^media_\d{3}\.json$/.test(name));
  if (mediaChunks.length === 0) {
    throw new Error('No media chunk files found in data/meta (expected at least one media_*.json).');
  }

  const graphBins = graphFiles.filter((name) => name.endsWith('.bin'));
  const graphJson = graphFiles.filter((name) => name.endsWith('.json'));
  if (graphBins.length === 0 && graphJson.length === 0) {
    throw new Error('No graph files found in data/graph (expected *.bin or *.json).');
  }

  for (const name of graphBins.length > 0 ? graphBins : graphJson) {
    await requireAnyNonEmpty([path.join('graph', name)], `graph/${name}`);
  }

  const manifest = JSON.parse(await fs.readFile(path.join(DATA_DIR, 'manifest.json'), 'utf-8'));
  const counts = manifest?.counts ?? {};
  if (!counts.media || !counts.people || !counts.characters || !counts.points) {
    throw new Error(`Manifest counts must all be > 0. Got: ${JSON.stringify(counts)}`);
  }

  const thresholdFailures: string[] = [];
  if (minMediaCount > 0 && counts.media < minMediaCount) thresholdFailures.push(`media ${counts.media} < ${minMediaCount}`);
  if (minPeopleCount > 0 && counts.people < minPeopleCount) thresholdFailures.push(`people ${counts.people} < ${minPeopleCount}`);
  if (minCharacterCount > 0 && counts.characters < minCharacterCount) thresholdFailures.push(`characters ${counts.characters} < ${minCharacterCount}`);
  if (minPointCount > 0 && counts.points < minPointCount) thresholdFailures.push(`points ${counts.points} < ${minPointCount}`);
  if (thresholdFailures.length > 0) {
    throw new Error(`Artifact count thresholds failed: ${thresholdFailures.join(', ')}`);
  }

  console.log('verify:data passed', {
    manifestCounts: counts,
    mediaChunks: mediaChunks.length,
    graphFilesChecked: graphBins.length > 0 ? graphBins.length : graphJson.length,
    minimums: {
      minMediaCount,
      minPeopleCount,
      minCharacterCount,
      minPointCount
    }
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
