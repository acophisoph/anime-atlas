import fs from 'node:fs/promises';
import path from 'node:path';
import { DATA_DIR } from './config.js';

async function fileSize(rel: string): Promise<number> {
  const stat = await fs.stat(path.join(DATA_DIR, rel));
  return stat.size;
}

async function requireNonEmpty(rel: string): Promise<void> {
  try {
    const size = await fileSize(rel);
    if (size <= 0) throw new Error(`${rel} is empty`);
  } catch (error) {
    throw new Error(`Missing/invalid required artifact ${rel}: ${String(error)}`);
  }
}

async function main() {
  await requireNonEmpty('manifest.json');
  await requireNonEmpty('points.bin');
  await requireNonEmpty('indices/search_index.json');

  const metaDir = path.join(DATA_DIR, 'meta');
  const graphDir = path.join(DATA_DIR, 'graph');

  const metaFiles = await fs.readdir(metaDir).catch(() => [] as string[]);
  const graphFiles = await fs.readdir(graphDir).catch(() => [] as string[]);

  const mediaChunks = metaFiles.filter((name) => /^media_\d{3}\.json$/.test(name));
  if (mediaChunks.length === 0) {
    throw new Error('No media chunk files found in data/meta (expected at least one media_*.json).');
  }

  const graphBins = graphFiles.filter((name) => name.endsWith('.bin'));
  if (graphBins.length === 0) {
    throw new Error('No binary graph files found in data/graph (expected *.bin).');
  }

  for (const name of graphBins) {
    await requireNonEmpty(path.join('graph', name));
  }

  const manifest = JSON.parse(await fs.readFile(path.join(DATA_DIR, 'manifest.json'), 'utf-8'));
  const counts = manifest?.counts ?? {};
  if (!counts.media || !counts.people || !counts.characters || !counts.points) {
    throw new Error(`Manifest counts must all be > 0. Got: ${JSON.stringify(counts)}`);
  }

  console.log('verify:data passed', {
    manifestCounts: counts,
    mediaChunks: mediaChunks.length,
    graphBins: graphBins.length
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
