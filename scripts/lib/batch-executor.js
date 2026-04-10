import { anilistQuery, sleep } from './http-client.js';
import { QUERY_MEDIA_LIST, QUERY_MEDIA_STAFF, QUERY_MEDIA_CHARACTERS } from './queries.js';
import { isLocalizationRole, getRoleWeight } from './roles.js';

const PER_PAGE = 50;

/**
 * Execute a single batch and write results to SQLite.
 * Returns true on success, throws on unrecoverable failure.
 */
export async function executeBatch(db, batch) {
  const { batch_type, scope_key } = batch;

  if (batch_type === 'ANIME_LIST' || batch_type === 'MANGA_LIST') {
    await executeListBatch(db, batch_type, scope_key);
  } else if (batch_type === 'MEDIA_STAFF') {
    const mediaId = parseInt(scope_key.replace('MEDIA_STAFF:', ''), 10);
    await executeStaffBatch(db, mediaId);
  } else if (batch_type === 'MEDIA_CHARACTERS') {
    const mediaId = parseInt(scope_key.replace('MEDIA_CHARACTERS:', ''), 10);
    await executeCharactersBatch(db, mediaId);
  } else {
    throw new Error(`Unknown batch_type: ${batch_type}`);
  }
}

async function executeListBatch(db, batchType, scopeKey) {
  // scope_key format: "ANIME:page:5"
  const parts = scopeKey.split(':');
  const type = parts[0]; // ANIME or MANGA
  const page = parseInt(parts[2], 10);

  console.log(`[batch] ${scopeKey} fetching page ${page}`);
  const data = await anilistQuery(
    QUERY_MEDIA_LIST,
    { page, perPage: PER_PAGE, type, sort: ['POPULARITY_DESC'] },
    scopeKey
  );

  const pageInfo = data.Page.pageInfo;
  const mediaList = data.Page.media;

  db.transaction(() => {
    const upsertMedia = db.prepare(`
      INSERT INTO media
        (id, type, format, season_year, popularity, average_score,
         title_romaji, title_english, title_native,
         cover_large, cover_color, genres_json, tags_json, studios_json, updated_at)
      VALUES
        (@id, @type, @format, @season_year, @popularity, @average_score,
         @title_romaji, @title_english, @title_native,
         @cover_large, @cover_color, @genres_json, @tags_json, @studios_json, @updated_at)
      ON CONFLICT(id) DO UPDATE SET
        type=excluded.type, format=excluded.format,
        season_year=excluded.season_year, popularity=excluded.popularity,
        average_score=excluded.average_score,
        title_romaji=excluded.title_romaji, title_english=excluded.title_english,
        title_native=excluded.title_native,
        cover_large=excluded.cover_large, cover_color=excluded.cover_color,
        genres_json=excluded.genres_json, tags_json=excluded.tags_json,
        studios_json=excluded.studios_json, updated_at=excluded.updated_at
    `);

    const upsertRelation = db.prepare(`
      INSERT OR IGNORE INTO media_relations (media_id, related_media_id, relation_type)
      VALUES (?, ?, ?)
    `);

    // Stub insert: only insert if not already present — never overwrite good data
    // with empty popularity/genres/cover from a relation discovery.
    const insertStub = db.prepare(`
      INSERT OR IGNORE INTO media
        (id, type, format, season_year, popularity, average_score,
         title_romaji, title_english, title_native,
         cover_large, cover_color, genres_json, tags_json, studios_json, updated_at)
      VALUES
        (@id, @type, @format, @season_year, @popularity, @average_score,
         @title_romaji, @title_english, @title_native,
         @cover_large, @cover_color, @genres_json, @tags_json, @studios_json, @updated_at)
    `);

    const insertStaffBatch = db.prepare(`
      INSERT OR IGNORE INTO batches (batch_type, scope_key, status)
      VALUES ('MEDIA_STAFF', ?, 'PENDING')
    `);

    const insertCharsBatch = db.prepare(`
      INSERT OR IGNORE INTO batches (batch_type, scope_key, status)
      VALUES ('MEDIA_CHARACTERS', ?, 'PENDING')
    `);

    for (const m of mediaList) {
      upsertMedia.run({
        id: m.id,
        type: m.type,
        format: m.format ?? null,
        season_year: m.seasonYear ?? null,
        popularity: m.popularity ?? 0,
        average_score: m.averageScore ?? null,
        title_romaji: m.title?.romaji ?? null,
        title_english: m.title?.english ?? null,
        title_native: m.title?.native ?? null,
        cover_large: m.coverImage?.large ?? null,
        cover_color: m.coverImage?.color ?? null,
        genres_json: JSON.stringify(m.genres ?? []),
        tags_json: JSON.stringify(m.tags ?? []),
        studios_json: JSON.stringify(m.studios?.nodes ?? []),
        updated_at: Date.now(),
      });

      // Relations
      const relEdges = m.relations?.edges ?? [];
      const relNodes = m.relations?.nodes ?? [];
      for (let i = 0; i < relNodes.length; i++) {
        const rel = relNodes[i];
        const edgeType = relEdges[i]?.relationType ?? 'UNKNOWN';
        // Insert related media stub — INSERT OR IGNORE so we never clobber
        // existing good data (popularity, genres, cover) already fetched via list batches.
        insertStub.run({
          id: rel.id,
          type: rel.type,
          format: rel.format ?? null,
          season_year: rel.seasonYear ?? null,
          popularity: 0,
          average_score: null,
          title_romaji: rel.title?.romaji ?? null,
          title_english: rel.title?.english ?? null,
          title_native: rel.title?.native ?? null,
          cover_large: null,
          cover_color: null,
          genres_json: JSON.stringify([]),
          tags_json: JSON.stringify([]),
          studios_json: JSON.stringify([]),
          updated_at: Date.now(),
        });
        upsertRelation.run(m.id, rel.id, edgeType);
      }

      // Create staff + character batches for this media if not already present
      insertStaffBatch.run(`MEDIA_STAFF:${m.id}`);
      insertCharsBatch.run(`MEDIA_CHARACTERS:${m.id}`);
    }

    // Store page discovery progress
    db.prepare(`
      INSERT OR REPLACE INTO ingest_state (key, value)
      VALUES (?, ?)
    `).run(`${type}_last_page`, JSON.stringify(pageInfo));
  })();

  console.log(`[batch] ${scopeKey} done — ${mediaList.length} media, hasNextPage=${pageInfo.hasNextPage}`);

  // If there are more pages, seed them into the batches table
  if (pageInfo.hasNextPage) {
    const nextPage = page + 1;
    const nextScopeKey = `${type}:page:${nextPage}`;
    const batchTypeForNext = batchType;
    db.prepare(`
      INSERT OR IGNORE INTO batches (batch_type, scope_key, status)
      VALUES (?, ?, 'PENDING')
    `).run(batchTypeForNext, nextScopeKey);
  }
}

async function executeStaffBatch(db, mediaId) {
  console.log(`[batch] MEDIA_STAFF:${mediaId} fetching`);
  let page = 1;
  const allEdges = [];

  while (true) {
    const data = await anilistQuery(
      QUERY_MEDIA_STAFF,
      { id: mediaId, page, perPage: 25 },
      `MEDIA_STAFF:${mediaId}:p${page}`
    );

    const conn = data.Media?.staff;
    if (!conn) break;
    allEdges.push(...conn.edges);
    if (!conn.pageInfo.hasNextPage) break;
    page++;
    await sleep(200);
  }

  db.transaction(() => {
    const upsertPerson = db.prepare(`
      INSERT INTO people (id, name_full, name_native, language, image_large, site_url, updated_at)
      VALUES (@id, @name_full, @name_native, @language, @image_large, @site_url, @updated_at)
      ON CONFLICT(id) DO UPDATE SET
        name_full=excluded.name_full, name_native=excluded.name_native,
        language=excluded.language, image_large=excluded.image_large,
        site_url=excluded.site_url, updated_at=excluded.updated_at
    `);
    const upsertCredit = db.prepare(`
      INSERT INTO credits (media_id, person_id, role, is_voice_actor, is_localization, weight)
      VALUES (@media_id, @person_id, @role, 0, @is_localization, @weight)
      ON CONFLICT(media_id, person_id, role, is_voice_actor) DO UPDATE SET
        is_localization=excluded.is_localization, weight=excluded.weight
    `);

    for (const edge of allEdges) {
      const node = edge.node;
      upsertPerson.run({
        id: node.id,
        name_full: node.name?.full ?? null,
        name_native: node.name?.native ?? null,
        language: node.languageV2 ?? null,
        image_large: node.image?.large ?? null,
        site_url: node.siteUrl ?? null,
        updated_at: Date.now(),
      });
      upsertCredit.run({
        media_id: mediaId,
        person_id: node.id,
        role: edge.role ?? 'Unknown',
        is_localization: isLocalizationRole(edge.role) ? 1 : 0,
        weight: getRoleWeight(edge.role),
      });
    }
  })();

  console.log(`[batch] MEDIA_STAFF:${mediaId} done — ${allEdges.length} credits`);
}

async function executeCharactersBatch(db, mediaId) {
  console.log(`[batch] MEDIA_CHARACTERS:${mediaId} fetching`);
  let page = 1;
  const allEdges = [];

  while (true) {
    const data = await anilistQuery(
      QUERY_MEDIA_CHARACTERS,
      { id: mediaId, page, perPage: 25 },
      `MEDIA_CHARACTERS:${mediaId}:p${page}`
    );

    const conn = data.Media?.characters;
    if (!conn) break;
    allEdges.push(...conn.edges);
    if (!conn.pageInfo.hasNextPage) break;
    page++;
    await sleep(200);
  }

  db.transaction(() => {
    const upsertChar = db.prepare(`
      INSERT INTO characters (id, name_full, name_native, image_large, site_url, updated_at)
      VALUES (@id, @name_full, @name_native, @image_large, @site_url, @updated_at)
      ON CONFLICT(id) DO UPDATE SET
        name_full=excluded.name_full, name_native=excluded.name_native,
        image_large=excluded.image_large, site_url=excluded.site_url,
        updated_at=excluded.updated_at
    `);
    const upsertAppearance = db.prepare(`
      INSERT OR IGNORE INTO character_appearances (media_id, character_id, role)
      VALUES (?, ?, ?)
    `);
    const upsertVA = db.prepare(`
      INSERT OR IGNORE INTO character_voice_actors (media_id, character_id, va_person_id)
      VALUES (?, ?, ?)
    `);
    const upsertPerson = db.prepare(`
      INSERT INTO people (id, name_full, name_native, language, image_large, site_url, updated_at)
      VALUES (@id, @name_full, @name_native, @language, @image_large, @site_url, @updated_at)
      ON CONFLICT(id) DO UPDATE SET
        name_full=excluded.name_full, name_native=excluded.name_native,
        language=excluded.language, image_large=excluded.image_large,
        site_url=excluded.site_url, updated_at=excluded.updated_at
    `);
    const upsertVACredit = db.prepare(`
      INSERT INTO credits (media_id, person_id, role, is_voice_actor, is_localization, weight)
      VALUES (@media_id, @person_id, 'Voice Actor', 1, 0, 1.0)
      ON CONFLICT(media_id, person_id, role, is_voice_actor) DO NOTHING
    `);

    for (const edge of allEdges) {
      const char = edge.node;
      upsertChar.run({
        id: char.id,
        name_full: char.name?.full ?? null,
        name_native: char.name?.native ?? null,
        image_large: char.image?.large ?? null,
        site_url: char.siteUrl ?? null,
        updated_at: Date.now(),
      });
      upsertAppearance.run(mediaId, char.id, edge.role ?? 'SUPPORTING');

      for (const va of (edge.voiceActors ?? [])) {
        upsertPerson.run({
          id: va.id,
          name_full: va.name?.full ?? null,
          name_native: va.name?.native ?? null,
          language: va.languageV2 ?? 'JAPANESE',
          image_large: va.image?.large ?? null,
          site_url: va.siteUrl ?? null,
          updated_at: Date.now(),
        });
        upsertVA.run(mediaId, char.id, va.id);
        upsertVACredit.run({ media_id: mediaId, person_id: va.id });
      }
    }
  })();

  console.log(`[batch] MEDIA_CHARACTERS:${mediaId} done — ${allEdges.length} characters`);
}
