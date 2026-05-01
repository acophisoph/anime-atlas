#!/usr/bin/env node
/**
 * Build data/index/season_current.json from SQLite.
 *
 * For each anime in the current (or specified) season, finds the top staff
 * (Director, Character Design, Series Composition, Original Creator) and
 * their most popular previous work so the Season view can show pedigree badges.
 *
 * Usage:
 *   node scripts/commands/build-season.js              # auto-detect current season
 *   SEASON=SPRING SEASON_YEAR=2026 node ...            # explicit season
 */
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { openDb } from '../db/migrate.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH  = process.env.DB_PATH  ?? path.join(__dirname, '..', '.cache', 'anime-atlas.sqlite');
const DATA_DIR = process.env.DATA_DIR ?? path.join(__dirname, '..', '..', 'data');

// Roles that drive staff pedigree — ordered by display priority
const PEDIGREE_ROLES = [
  'Director', 'Series Director', 'General Director', 'Chief Director',
  'Series Composition', 'Original Creator', 'Original Creation',
  'Character Design', 'Original Character Design',
  'Chief Animation Director',
];

// How many pedigree entries to include per show
const MAX_PEDIGREE = 3;
// Minimum previous-work popularity for a notable-work badge
const MIN_NOTABLE_POP = 2000;

function detectSeason() {
  const m = new Date().getMonth() + 1; // 1-12
  const y = new Date().getFullYear();
  const s = m <= 3 ? 'WINTER' : m <= 6 ? 'SPRING' : m <= 9 ? 'SUMMER' : 'FALL';
  return { year: y, season: s };
}

async function main() {
  const db = await openDb(DB_PATH);
  const { year, season } = {
    year:   parseInt(process.env.SEASON_YEAR ?? '0') || detectSeason().year,
    season: (process.env.SEASON ?? detectSeason().season).toUpperCase(),
  };

  console.log(`[build-season] Building ${season} ${year}…`);

  // ── 1. Get seasonal anime IDs ──────────────────────────────────────────────
  // We filter by season_year. Since season (SPRING/SUMMER/etc.) isn't stored,
  // we return the full year and let the front-end / PART 3 show the label.
  const seasonMedia = db.prepare(`
    SELECT id, title_romaji, title_english, title_native, popularity, average_score
    FROM media
    WHERE type = 'ANIME'
      AND season_year = ?
      AND format IN ('TV', 'ONA', 'OVA', 'MOVIE', 'SPECIAL')
    ORDER BY popularity DESC
    LIMIT 100
  `).all(year);

  console.log(`[build-season] Found ${seasonMedia.length} anime for year ${year}`);

  if (seasonMedia.length === 0) {
    console.warn('[build-season] No anime found — season_current.json will be empty.');
  }

  const mediaIds = seasonMedia.map(m => m.id);

  // ── 2. Get all credits for these media ────────────────────────────────────
  const placeholders = mediaIds.map(() => '?').join(',');
  const credits = mediaIds.length
    ? db.prepare(`
        SELECT c.media_id, c.person_id, c.role, p.name_full, p.name_native
        FROM credits c
        JOIN people p ON p.id = c.person_id
        WHERE c.media_id IN (${placeholders})
          AND c.is_voice_actor = 0
          AND c.is_localization = 0
      `).all(...mediaIds)
    : [];

  // ── 3. For each staff member's person_id, find their most famous past work ─
  const allPersonIds = [...new Set(credits.map(c => c.person_id))];

  // Batch: get ALL credits for these people across all media, sorted by popularity
  const personPrevWorks = new Map(); // personId → [{ mediaId, role, title, year, score, pop }]

  if (allPersonIds.length) {
    const ppPlaceholders = allPersonIds.map(() => '?').join(',');
    const prevCredits = db.prepare(`
      SELECT c.person_id, c.role, c.media_id,
             m.title_romaji, m.title_english, m.season_year,
             m.popularity, m.average_score
      FROM credits c
      JOIN media m ON m.id = c.media_id
      WHERE c.person_id IN (${ppPlaceholders})
        AND c.is_voice_actor = 0
        AND c.is_localization = 0
        AND m.type = 'ANIME'
        AND m.popularity >= ?
      ORDER BY m.popularity DESC
    `).all(...allPersonIds, MIN_NOTABLE_POP);

    for (const row of prevCredits) {
      if (!personPrevWorks.has(row.person_id)) personPrevWorks.set(row.person_id, []);
      personPrevWorks.get(row.person_id).push(row);
    }
  }

  // ── 4. Build the season output ────────────────────────────────────────────
  const mediaOutput = [];

  for (const media of seasonMedia) {
    // Staff for this show, keyed by person_id
    const showCredits = credits.filter(c => c.media_id === media.id);

    // Collect pedigree: for each priority role, pick the highest-pedigree person
    const seen = new Set();
    const pedigree = [];

    for (const role of PEDIGREE_ROLES) {
      if (pedigree.length >= MAX_PEDIGREE) break;

      // Find credits matching this role (normalize role string)
      const matching = showCredits.filter(c => {
        const r = c.role?.trim();
        return r === role || r?.startsWith(role + ' ') || r?.endsWith(' ' + role);
      });

      for (const credit of matching) {
        if (pedigree.length >= MAX_PEDIGREE) break;
        if (seen.has(credit.person_id)) continue;
        seen.add(credit.person_id);

        // Find their most famous previous work (excluding this show)
        const prevWorks = (personPrevWorks.get(credit.person_id) ?? [])
          .filter(pw => pw.media_id !== media.id && pw.popularity >= MIN_NOTABLE_POP);

        if (!prevWorks.length) continue;

        // Pick the work by highest popularity where role matches a pedigree role
        const bestWork = prevWorks[0]; // already sorted by popularity

        pedigree.push({
          personId:         credit.person_id,
          name:             credit.name_full ?? '?',
          role,
          notableWork:      bestWork.title_english || bestWork.title_romaji || String(bestWork.media_id),
          notableWorkId:    bestWork.media_id,
          notableWorkScore: bestWork.average_score ?? null,
        });
      }
    }

    if (pedigree.length > 0 || mediaOutput.length < 48) {
      mediaOutput.push({ id: media.id, pedigree });
    }
  }

  // ── 5. Write output ────────────────────────────────────────────────────────
  const out = {
    year,
    season,
    generated_at: Date.now(),
    media: mediaOutput,
  };

  const outPath = path.join(DATA_DIR, 'index', 'season_current.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(`[build-season] Wrote ${mediaOutput.length} entries to ${outPath}`);

  db.close();
}

main().catch(e => { console.error('[build-season] Fatal:', e); process.exit(1); });
