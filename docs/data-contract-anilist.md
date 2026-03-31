# AniList Data Contract

This document describes every GraphQL query issued against the AniList API, how the results
map to SQLite tables, the pagination strategy, rate-limiting rules, and localization filtering.

---

## GraphQL Endpoint

```
POST https://graphql.anilist.co
Content-Type: application/json
Authorization: Bearer <ANILIST_TOKEN>   (optional; anon rate-limit is lower)
```

All queries live in `scripts/lib/queries.js` and are exported as template-literal strings.

---

## Query 1 — `QueryMediaList`

Used by batch types: `ANIME_LIST`, `MANGA_LIST`

### Full Query String

```graphql
query QueryMediaList($page: Int, $perPage: Int, $type: MediaType, $sort: [MediaSort]) {
  Page(page: $page, perPage: $perPage) {
    pageInfo { currentPage hasNextPage lastPage total perPage }
    media(type: $type, sort: $sort) {
      id
      type
      format
      seasonYear
      popularity
      averageScore
      title { romaji english native }
      coverImage { large color }
      genres
      tags { id name category rank isAdult }
      studios { nodes { id name isAnimationStudio } }
      relations {
        edges { relationType(version: 2) }
        nodes { id type format seasonYear title { romaji english native } }
      }
    }
  }
}
```

### Variables

| Variable  | Type        | Value                    |
|-----------|-------------|--------------------------|
| `page`    | `Int`       | Starts at 1, increments  |
| `perPage` | `Int`       | 50                       |
| `type`    | `MediaType` | `ANIME` or `MANGA`       |
| `sort`    | `[MediaSort]` | `[POPULARITY_DESC]`    |

### SQLite Mapping

Response field → SQLite column (`media` table):

| GraphQL field             | Column              | Notes                                 |
|---------------------------|---------------------|---------------------------------------|
| `media.id`                | `id`                | Primary key                           |
| `media.type`              | `type`              | `"ANIME"` or `"MANGA"`                |
| `media.format`            | `format`            | `"TV"`, `"MOVIE"`, `"OVA"`, etc.      |
| `media.seasonYear`        | `season_year`       |                                       |
| `media.popularity`        | `popularity`        |                                       |
| `media.averageScore`      | `average_score`     | 0–100, null allowed                   |
| `media.title.romaji`      | `title_romaji`      |                                       |
| `media.title.english`     | `title_english`     | May be null for non-licensed titles   |
| `media.title.native`      | `title_native`      | Japanese/Chinese/Korean script        |
| `media.coverImage.large`  | `cover_large`       | CDN URL                               |
| `media.coverImage.color`  | `cover_color`       | Hex string e.g. `"#1a2030"`           |
| `media.genres`            | `genres_json`       | JSON array of strings                 |
| `media.tags`              | `tags_json`         | JSON array of `{id,name,category,rank,isAdult}` |
| `media.studios.nodes`     | `studios_json`      | JSON array of `{id,name,isAnimationStudio}` |

Relations are written to the `media_relations` table:

| GraphQL field                           | Column              |
|-----------------------------------------|---------------------|
| `relations.nodes[i].id`                 | `related_media_id`  |
| `relations.edges[i].relationType`       | `relation_type`     |
| (current media id)                      | `media_id`          |

After processing a list page, a `MEDIA_STAFF` and `MEDIA_CHARACTERS` batch is inserted for
each new media ID discovered (if not already present).

### Pagination Strategy

```
page = 1
loop:
  response = fetch(QueryMediaList, {page, perPage=50, type, sort})
  upsert all media rows
  if response.pageInfo.hasNextPage:
    insert batch ANIME_LIST|MANGA_LIST:page:{page+1} as PENDING
  break
```

The batch system processes one page per batch run. On the next scheduler invocation, the
newly inserted page batch is picked up. This means full ingestion of ~10,000 ANIME entries
requires roughly 200 batch completions (~4–5 GitHub Actions runs at 40 batches/run).

---

## Query 2 — `QueryMediaStaff`

Used by batch type: `MEDIA_STAFF`

### Full Query String

```graphql
query QueryMediaStaff($id: Int, $page: Int, $perPage: Int) {
  Media(id: $id) {
    id
    staff(page: $page, perPage: $perPage) {
      pageInfo { currentPage hasNextPage lastPage total perPage }
      edges {
        role
        node {
          id
          name { full native }
          languageV2
          image { large }
          siteUrl
        }
      }
    }
  }
}
```

### Variables

| Variable  | Type  | Value                             |
|-----------|-------|-----------------------------------|
| `id`      | `Int` | AniList media ID                  |
| `page`    | `Int` | Starts at 1                       |
| `perPage` | `Int` | 25                                |

### SQLite Mapping

Staff edges write to two tables:

**`people` table** (upsert on `id`):

| GraphQL field                    | Column        |
|----------------------------------|---------------|
| `staff.edges[i].node.id`         | `id`          |
| `staff.edges[i].node.name.full`  | `name_full`   |
| `staff.edges[i].node.name.native`| `name_native` |
| `staff.edges[i].node.languageV2` | `language`    |
| `staff.edges[i].node.image.large`| `image_large` |
| `staff.edges[i].node.siteUrl`    | `site_url`    |

**`credits` table** (insert or ignore on composite PK):

| GraphQL field                | Column            | Value                        |
|------------------------------|-------------------|------------------------------|
| (current media id)           | `media_id`        |                              |
| `staff.edges[i].node.id`     | `person_id`       |                              |
| `staff.edges[i].role`        | `role`            | Raw role string from AniList |
| (constant)                   | `is_voice_actor`  | 0                            |
| (see localization rules)     | `is_localization` | 0 or 1                       |
| (see role weight table)      | `weight`          | See `scripts/lib/roles.js`   |

---

## Query 3 — `QueryMediaCharacters`

Used by batch type: `MEDIA_CHARACTERS`

### Full Query String

```graphql
query QueryMediaCharacters($id: Int, $page: Int, $perPage: Int) {
  Media(id: $id) {
    id
    characters(page: $page, perPage: $perPage) {
      pageInfo { currentPage hasNextPage lastPage total perPage }
      edges {
        role
        node {
          id
          name { full native }
          image { large }
          siteUrl
        }
        voiceActors(language: JAPANESE) {
          id
          name { full native }
          languageV2
          image { large }
          siteUrl
        }
      }
    }
  }
}
```

### SQLite Mapping

**`characters` table** (upsert on `id`):

| GraphQL field                          | Column        |
|----------------------------------------|---------------|
| `characters.edges[i].node.id`          | `id`          |
| `characters.edges[i].node.name.full`   | `name_full`   |
| `characters.edges[i].node.name.native` | `name_native` |
| `characters.edges[i].node.image.large` | `image_large` |
| `characters.edges[i].node.siteUrl`     | `site_url`    |

**`character_appearances` table**:

| Field                    | Column        |
|--------------------------|---------------|
| (media id)               | `media_id`    |
| `edges[i].node.id`       | `character_id`|
| `edges[i].role`          | `role`        |

**`character_voice_actors` table**:

| Field                              | Column        |
|------------------------------------|---------------|
| (media id)                         | `media_id`    |
| `edges[i].node.id`                 | `character_id`|
| `edges[i].voiceActors[j].id`       | `va_person_id`|

Voice actors are also upserted into the `people` table and a `credits` row is inserted with
`is_voice_actor = 1`.

---

## Query 4 — `QueryPerson`

Used by batch type: `JIKAN_PATCH` (person enrichment)

### Full Query String

```graphql
query QueryPerson($id: Int) {
  Staff(id: $id) {
    id
    name { full native }
    languageV2
    image { large }
    description(asHtml: false)
    siteUrl
    staffMedia(page: 1, perPage: 25, sort: POPULARITY_DESC) {
      edges { staffRole }
      nodes { id type title { romaji english native } averageScore seasonYear }
    }
  }
}
```

This query is used to backfill `description` and the top-25 credits for people discovered
through staff/character queries who don't yet have descriptions in the DB.

### SQLite Mapping

Writes to `people` (upsert) and optionally inserts additional `credits` rows for media that
were not yet in the database.

---

## Pagination Strategy (General)

Every paginated query uses the same loop:

1. Fetch page N.
2. Write results to SQLite.
3. If `pageInfo.hasNextPage == true`, insert a new batch for page N+1 with status `PENDING`.
4. Mark current batch `DONE`.

The batch executor never fetches page N+1 in the same run as page N (unless both are already
`PENDING`). This decouples discovery from execution and keeps individual runs short enough to
fit GitHub Actions' 6-hour limit.

---

## Rate Limiting Behavior

AniList enforces:

- **Authenticated**: 90 requests per 60 seconds.
- **Anonymous**: 30 requests per 60 seconds.

`scripts/lib/http-client.js` manages this:

1. A rolling window counter tracks requests in the past 60 s.
2. Before each request, if `count >= 88` (2-request margin), the client sleeps until the
   oldest request in the window falls out of the 60-s window.
3. On a **429** response, the `Retry-After` header is respected; if absent, the client backs
   off with `min(2^attempt * 1000ms, 30000ms) + jitter(0–1000ms)`.
4. On a **503 / network error**, the same exponential backoff applies.

The GitHub Actions cron is set to trigger ingest every 4 hours. With a budget of 270 minutes
and 40 batches per run, this safely stays within the 90-req/min limit even if all batches
page through staff lists.

---

## Localization Exclusion Rules

AniList returns staff roles for all language dubbing teams (e.g., English VA, French VA, …).
These are **excluded** from the collaboration graph and from the frontend's "people" view to
keep the visualization focused on the original production staff.

A credit is flagged `is_localization = 1` when:

- The staff member's `languageV2` is anything other than `"JAPANESE"`, **and**
- Their role contains "Voice Actor" / "VA" **or** the media type is `ANIME` with a non-Japanese
  studio tagged.

The exclusion logic is implemented in `scripts/lib/roles.js`. Localization credits are still
stored (for completeness) but are skipped by `buildCollabGraph()` and the role-to-people index.
