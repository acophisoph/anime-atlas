import fs from 'node:fs/promises';
import path from 'node:path';
import { DATA_DIR } from './config.js';

async function exists(rel: string) {
  try {
    await fs.access(path.join(DATA_DIR, rel));
    return true;
  } catch {
    return false;
  }
}

async function assertAny(...paths: string[]) {
  const checks = await Promise.all(paths.map((p) => exists(p)));
  if (!checks.some(Boolean)) {
    throw new Error(`Missing required artifact variants: ${paths.join(', ')}`);
  }
}

async function main() {
  await assertAny('manifest.json');
  await assertAny('points.bin', 'points.json');
  await assertAny('indices/search_index.json');
  await assertAny('indices/tag_to_media.json');
  await assertAny('indices/role_to_people.json');
  await assertAny('graph/media_rel.bin', 'graph/media_rel.json');

  const manifest = JSON.parse(await fs.readFile(path.join(DATA_DIR, 'manifest.json'), 'utf-8'));
  if (!manifest.counts || !manifest.buildConfig || !manifest.binarySpec) {
    throw new Error('Manifest invalid: required fields missing');
  }

  console.log('Artifact sanity check passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
