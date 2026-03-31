#!/usr/bin/env node
// Copy data/ -> app/public/data/
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(__dirname, '..', '..', 'data');
const dst = path.join(__dirname, '..', '..', 'app', 'public', 'data');

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const s = path.join(from, entry.name);
    const d = path.join(to, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

if (!fs.existsSync(src) || fs.readdirSync(src).length === 0) {
  console.warn('[sync:data] data/ is empty or missing — skipping sync');
  process.exit(0);
}

copyDir(src, dst);
console.log(`[sync:data] Copied data/ -> app/public/data/`);
