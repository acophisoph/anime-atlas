/**
 * Coordinate computation from tag/genre similarity.
 *
 * Memory model (GitHub Actions runner ≈ 7 GB):
 *   n=80k media, dim=443 → 80k × 443 × 8B = 284 MB for features
 *   umap-js crashes with "Cannot read properties of undefined (reading '0')"
 *   at n > ~15k. Fix: subsample UMAP (10k) + inverted-index projection.
 *
 *   n=30k people, dim=29046 (raw) → 6.9 GB → OOM.
 *   Fix: cap roles to top-200 by frequency (same as tags).
 *   After cap: dim ≈ 380 → 30k × 380 × 8B = 91 MB ✓
 */

const UMAP_THRESHOLD = 200;

// Feature dimension caps — keep only the most-used values.
const MEDIA_TAG_DIM_LIMIT  = 500;
const PEOPLE_ROLE_DIM_LIMIT = 200;  // CRITICAL: roles were unbounded → 28,964 dims
const PEOPLE_TAG_DIM_LIMIT  = 150;

// umap-js crashes (not OOMs) above ~15k points with an internal array bug.
// For larger datasets: subsample UMAP_SAMPLE points, UMAP them, then
// project remaining points to their nearest-sample-neighbour position.
const UMAP_SAMPLE = 10_000;

/**
 * Build feature vectors for media items from genres + top tags.
 */
export function buildMediaFeatureVectors(mediaRows) {
  const tagFreq  = new Map();
  const genreSet = new Set();

  for (const m of mediaRows) {
    const tags   = JSON.parse(m.tags_json   || '[]');
    const genres = JSON.parse(m.genres_json || '[]');
    genres.forEach(g => genreSet.add(`genre:${g}`));
    tags.forEach(t => tagFreq.set(t.name, (tagFreq.get(t.name) || 0) + 1));
  }

  const topTags = [...tagFreq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, MEDIA_TAG_DIM_LIMIT)
    .map(([name]) => `tag:${name}`);

  const features     = [...genreSet, ...topTags];
  const featureIndex = new Map(features.map((f, i) => [f, i]));
  const dim          = features.length;
  console.log(`[coords] media features: ${genreSet.size} genres + ${topTags.length} tags = dim ${dim}`);

  const vectors = mediaRows.map(m => {
    const vec    = new Float32Array(dim);
    const tags   = JSON.parse(m.tags_json   || '[]');
    const genres = JSON.parse(m.genres_json || '[]');
    for (const g of genres) {
      const idx = featureIndex.get(`genre:${g}`);
      if (idx !== undefined) vec[idx] = 1.0;
    }
    for (const t of tags) {
      const idx = featureIndex.get(`tag:${t.name}`);
      if (idx !== undefined) vec[idx] = Math.min(1.0, t.rank / 100);
    }
    return vec;
  });

  return { vectors, features, dim };
}

/**
 * Build feature vectors for people from top roles + top tags.
 * Roles are capped — raw AniList data has thousands of unique role strings
 * (e.g. "Character Design (ep 3-6)") which explodes dimensionality.
 */
export function buildPeopleFeatureVectors(peopleRows, creditsMap, mediaTagMap) {
  const roleFreq = new Map();
  const tagFreq  = new Map();

  for (const p of peopleRows) {
    const credits = creditsMap.get(p.id) || [];
    for (const c of credits) {
      if (!c.is_localization) {
        roleFreq.set(c.role, (roleFreq.get(c.role) || 0) + 1);
        const tags = mediaTagMap.get(c.media_id) || [];
        tags.forEach(t => tagFreq.set(t, (tagFreq.get(t) || 0) + 1));
      }
    }
  }

  const topRoles = [...roleFreq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, PEOPLE_ROLE_DIM_LIMIT)
    .map(([role]) => `role:${role}`);

  const topTags = [...tagFreq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, PEOPLE_TAG_DIM_LIMIT)
    .map(([name]) => `tag:${name}`);

  const features     = [...topRoles, ...topTags];
  const featureIndex = new Map(features.map((f, i) => [f, i]));
  const dim          = features.length;
  console.log(`[coords] people features: ${topRoles.length} roles (of ${roleFreq.size}) + ${topTags.length} tags = dim ${dim}`);

  const vectors = peopleRows.map(p => {
    const vec     = new Float32Array(dim);
    const credits = creditsMap.get(p.id) || [];
    for (const c of credits) {
      if (!c.is_localization) {
        const ri = featureIndex.get(`role:${c.role}`);
        if (ri !== undefined) vec[ri] = Math.max(vec[ri], c.weight || 1.0);
        const tags = mediaTagMap.get(c.media_id) || [];
        for (const t of tags) {
          const ti = featureIndex.get(`tag:${t}`);
          if (ti !== undefined) vec[ti] = Math.min(1.0, vec[ti] + 0.1);
        }
      }
    }
    return vec;
  });

  return { vectors, features, dim };
}

/**
 * Compute 2D UMAP coordinates.
 *
 * For n > UMAP_SAMPLE: run UMAP on a random sample, then project remaining
 * points to their nearest sample-neighbour via sparse inverted-index dot
 * product (fast because vectors are sparse after L2-normalisation).
 */
export async function computeCoordinates(vectors, ids, opts = {}) {
  const {
    minDist = 0.4,
    spread  = 3.0,
  } = opts;

  if (!vectors.length) return [];
  if (vectors.length < UMAP_THRESHOLD) return deterministicLayout(ids);

  // Separate zero vectors (no features) — UMAP produces NaN for them.
  const spiral    = deterministicLayout(ids);
  const spiralMap = new Map(spiral.map(p => [p.id, p]));

  const nonZeroIdx = [];
  for (let i = 0; i < vectors.length; i++) {
    if (vectors[i].some(v => v !== 0)) nonZeroIdx.push(i);
  }

  if (nonZeroIdx.length < UMAP_THRESHOLD) {
    console.log(`[coords] Only ${nonZeroIdx.length} non-zero vectors → spiral`);
    return spiral;
  }

  const n = nonZeroIdx.length;
  console.log(`[coords] ${n} non-zero vectors (${vectors.length - n} stubs → spiral)`);

  try {
    const { UMAP } = await import('umap-js');

    // L2-normalise all non-zero vectors (single-pass, no extra copy).
    // Makes Euclidean ≈ cosine — critical for sparse genre/tag vectors.
    const normVecs = nonZeroIdx.map(i => {
      const raw = vectors[i];
      let s = 0;
      for (let j = 0; j < raw.length; j++) s += raw[j] * raw[j];
      const inv = 1 / (Math.sqrt(s) || 1);
      const out = new Array(raw.length);
      for (let j = 0; j < raw.length; j++) out[j] = raw[j] * inv;
      return out;
    });

    // Free Float32Arrays — we only need the normalised copies.
    for (let i = 0; i < vectors.length; i++) vectors[i] = null;

    const nonZeroIds = nonZeroIdx.map(i => ids[i]);

    // ── Decide: direct UMAP or subsample+project ──────────────────────────
    let embedding; // number[][] of [x, y] for each entry in nonZeroIds order

    if (n <= UMAP_SAMPLE) {
      // Small enough for direct UMAP
      const nNeighbors = n > 5000 ? 15 : 20;
      const nEpochs    = n > 5000 ? 300 : 400;
      console.log(`[coords] Direct UMAP nNeighbors=${nNeighbors} nEpochs=${nEpochs} minDist=${minDist} spread=${spread}`);
      const umap = new UMAP({ nComponents: 2, nNeighbors, minDist, spread, nEpochs, random: seededRandom(42) });
      const raw = umap.fit(normVecs);
      embedding = Array.from(raw, r => [r[0], r[1]]);

    } else {
      // Large dataset: subsample UMAP then project the rest via inverted-index
      console.log(`[coords] Subsample UMAP: ${UMAP_SAMPLE} of ${n}, then projecting remainder`);

      // Seeded deterministic sample: pick every k-th index with a stride
      const stride   = Math.floor(n / UMAP_SAMPLE);
      const sampleLocal = [];  // indices within normVecs
      for (let i = 0; i < UMAP_SAMPLE && i * stride < n; i++) sampleLocal.push(i * stride);
      const sampleVecs = sampleLocal.map(i => normVecs[i]);

      const umap = new UMAP({
        nComponents: 2, nNeighbors: 15, minDist, spread,
        nEpochs: 250, random: seededRandom(42),
      });
      const sampleEmbed = umap.fit(sampleVecs);  // number[][]

      // Build inverted index over sample vectors for fast nearest-neighbour lookup.
      // Key: feature dimension index → [{sampleIdx, value}]
      // Only non-zero entries are stored — vectors are sparse so this is tiny.
      const dim = normVecs[0].length;
      const invertedIdx = new Array(dim);
      for (let j = 0; j < dim; j++) invertedIdx[j] = [];
      for (let si = 0; si < sampleVecs.length; si++) {
        const sv = sampleVecs[si];
        for (let j = 0; j < sv.length; j++) {
          if (sv[j] > 0) invertedIdx[j].push(si, sv[j]);  // packed pairs
        }
      }

      // Project every non-sample point to its nearest sample via dot product.
      // Process in batches of 1000 to keep stack shallow.
      const BATCH = 1000;
      const sampleSet = new Set(sampleLocal);
      const projEmbedding = new Array(n);

      // Fill sample positions first
      for (let i = 0; i < sampleLocal.length; i++) {
        projEmbedding[sampleLocal[i]] = [sampleEmbed[i][0], sampleEmbed[i][1]];
      }

      // Project non-sample points
      for (let start = 0; start < n; start += BATCH) {
        const end = Math.min(start + BATCH, n);
        for (let qi = start; qi < end; qi++) {
          if (sampleSet.has(qi)) continue;
          const qv = normVecs[qi];

          // Accumulate dot products using inverted index (only shared features)
          const scores = new Float32Array(sampleLocal.length);
          for (let j = 0; j < qv.length; j++) {
            if (qv[j] === 0) continue;
            const col = invertedIdx[j];
            for (let k = 0; k < col.length; k += 2) {
              scores[col[k]] += qv[j] * col[k + 1];
            }
          }

          // Find nearest sample (max dot product = max cosine similarity)
          let bestSi = 0, bestScore = -1;
          for (let si = 0; si < scores.length; si++) {
            if (scores[si] > bestScore) { bestScore = scores[si]; bestSi = si; }
          }

          // Place near nearest sample + tiny seeded jitter so points don't pile up exactly
          const rng = seededRandom(qi);
          const jitter = 0.05;
          projEmbedding[qi] = [
            sampleEmbed[bestSi][0] + (rng() - 0.5) * jitter,
            sampleEmbed[bestSi][1] + (rng() - 0.5) * jitter,
          ];
        }
      }

      embedding = projEmbedding;
    }

    // Build result map
    const resultMap = new Map();
    for (let i = 0; i < nonZeroIds.length; i++) {
      const [x, y] = embedding[i];
      if (!isNaN(x) && !isNaN(y)) {
        resultMap.set(nonZeroIds[i], { id: nonZeroIds[i], x, y });
      }
    }

    return ids.map(id => resultMap.get(id) ?? spiralMap.get(id) ?? { id, x: 0, y: 0 });

  } catch (err) {
    console.warn('[coords] UMAP failed, falling back to spiral:', err.message);
    return spiral;
  }
}

function deterministicLayout(ids) {
  const n = ids.length;
  const g = 2.399963229728653; // golden angle
  return ids.map((id, i) => {
    const r = Math.sqrt(i / n) * 10;
    return { id, x: r * Math.cos(i * g), y: r * Math.sin(i * g) };
  });
}

function seededRandom(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

export function normalizeCoords(points) {
  if (!points.length) return points;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
  }
  const rx = maxX - minX || 1;
  const ry = maxY - minY || 1;
  return points.map(p => ({
    ...p,
    x: ((p.x - minX) / rx) * 2 - 1,
    y: ((p.y - minY) / ry) * 2 - 1,
  }));
}
