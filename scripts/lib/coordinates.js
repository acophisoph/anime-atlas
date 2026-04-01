/**
 * Coordinate computation from tag/genre similarity.
 * Falls back to deterministic grid layout for small datasets.
 *
 * Memory budget (GitHub Actions runner: ~7 GB RAM, default Node heap: 4 GB):
 *   n=18k media, dim=500 → 18k × 500 × 8B = 72 MB  ✓
 *   n=38k people, dim=300 → 38k × 300 × 8B = 91 MB  ✓
 *   Without dimension cap: 18k × 10k × 8 = 1.44 GB per dataset → OOM.
 */

const UMAP_THRESHOLD = 200; // minimum points to attempt UMAP

// Maximum tag dimensions to include in feature vectors.
// Only the most-used tags are kept — rare tags add noise and eat memory.
const MEDIA_TAG_DIM_LIMIT  = 500;
const PEOPLE_TAG_DIM_LIMIT = 300;

/**
 * Build feature vectors for media items from their tags and genres.
 * Genres always included (only ~20). Tags capped to top MEDIA_TAG_DIM_LIMIT by usage.
 */
export function buildMediaFeatureVectors(mediaRows) {
  // Count tag frequencies across all media
  const tagFreq = new Map();
  const genreSet = new Set();

  for (const m of mediaRows) {
    const tags   = JSON.parse(m.tags_json   || '[]');
    const genres = JSON.parse(m.genres_json || '[]');
    genres.forEach(g => genreSet.add(`genre:${g}`));
    tags.forEach(t => tagFreq.set(`tag:${t.name}`, (tagFreq.get(`tag:${t.name}`) || 0) + 1));
  }

  // Keep only the top-N tags by usage frequency
  const topTags = [...tagFreq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, MEDIA_TAG_DIM_LIMIT)
    .map(([name]) => name);

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
 * Build feature vectors for people from credited roles + associated media tags.
 * Roles always included (few unique values). Tags capped to top PEOPLE_TAG_DIM_LIMIT.
 */
export function buildPeopleFeatureVectors(peopleRows, creditsMap, mediaTagMap) {
  const roleSet = new Set();
  const tagFreq = new Map();

  for (const p of peopleRows) {
    const credits = creditsMap.get(p.id) || [];
    for (const c of credits) {
      if (!c.is_localization) {
        roleSet.add(`role:${c.role}`);
        const tags = mediaTagMap.get(c.media_id) || [];
        tags.forEach(t => tagFreq.set(`tag:${t}`, (tagFreq.get(`tag:${t}`) || 0) + 1));
      }
    }
  }

  const topTags = [...tagFreq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, PEOPLE_TAG_DIM_LIMIT)
    .map(([name]) => name);

  const features     = [...roleSet, ...topTags];
  const featureIndex = new Map(features.map((f, i) => [f, i]));
  const dim          = features.length;

  console.log(`[coords] people features: ${roleSet.size} roles + ${topTags.length} tags = dim ${dim}`);

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
 * Compute 2D coordinates. Uses UMAP if >= UMAP_THRESHOLD points, else fallback layout.
 */
export async function computeCoordinates(vectors, ids) {
  if (vectors.length === 0) return [];

  if (vectors.length < UMAP_THRESHOLD) {
    return deterministicLayout(ids);
  }

  // Filter out all-zero vectors — UMAP produces NaN for these.
  const spiral    = deterministicLayout(ids);
  const spiralMap = new Map(spiral.map(p => [p.id, p]));

  const nonZeroIdx = [];
  for (let i = 0; i < vectors.length; i++) {
    if (vectors[i].some(v => v !== 0)) nonZeroIdx.push(i);
  }

  if (nonZeroIdx.length < UMAP_THRESHOLD) {
    console.log(`[coords] Only ${nonZeroIdx.length} non-zero vectors, using spiral layout`);
    return spiral;
  }

  const n = nonZeroIdx.length;
  console.log(`[coords] UMAP on ${n} non-zero vectors (${vectors.length - n} zero-vector stubs → spiral)`);

  try {
    const { UMAP } = await import('umap-js');

    // L2-normalize + convert to number[] in a single pass.
    // Keeps only one copy of the data in memory (no separate rawVecs intermediate).
    // Normalization makes Euclidean ≈ cosine similarity — critical for sparse
    // high-dimensional genre/tag vectors where raw Euclidean distance is dominated
    // by vector magnitude rather than directional similarity.
    const subVectors = nonZeroIdx.map(i => {
      const raw  = vectors[i];
      let norm2  = 0;
      for (let j = 0; j < raw.length; j++) norm2 += raw[j] * raw[j];
      const norm = Math.sqrt(norm2) || 1;
      const out  = new Array(raw.length);
      for (let j = 0; j < raw.length; j++) out[j] = raw[j] / norm;
      return out;
    });

    // Free Float32Array memory — subVectors is now the only copy needed
    for (let i = 0; i < vectors.length; i++) vectors[i] = null;

    const subIds = nonZeroIdx.map(i => ids[i]);

    // Adaptive UMAP params: fewer neighbors + epochs for very large n to
    // reduce peak memory (UMAP internal kNN matrix is O(n × nNeighbors)).
    const nNeighbors = n > 20000 ? 15 : n > 5000 ? 20 : 30;
    const nEpochs    = n > 20000 ? 300 : n > 5000 ? 400 : 500;

    console.log(`[coords] UMAP params: nNeighbors=${nNeighbors} minDist=0.5 spread=3.5 nEpochs=${nEpochs}`);

    const umap = new UMAP({
      nComponents: 2,
      nNeighbors,
      minDist: 0.5,
      spread:  3.5,
      nEpochs,
      random: seededRandom(42),
    });

    const embedding = umap.fit(subVectors);

    const resultMap = new Map();
    for (let i = 0; i < subIds.length; i++) {
      const [x, y] = embedding[i];
      if (!isNaN(x) && !isNaN(y)) {
        resultMap.set(subIds[i], { id: subIds[i], x, y });
      }
    }

    return ids.map(id => resultMap.get(id) ?? spiralMap.get(id) ?? { id, x: 0, y: 0 });
  } catch (err) {
    console.warn('[coords] UMAP failed, falling back to spiral:', err.message);
    return spiral;
  }
}

function deterministicLayout(ids) {
  const n           = ids.length;
  const goldenAngle = 2.399963229728653;
  return ids.map((id, i) => {
    const r     = Math.sqrt(i / n) * 10;
    const theta = i * goldenAngle;
    return { id, x: r * Math.cos(theta), y: r * Math.sin(theta) };
  });
}

function seededRandom(seed) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

/**
 * Normalize coordinates to roughly [-1, 1] range.
 */
export function normalizeCoords(points) {
  if (points.length === 0) return points;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  }
  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;
  return points.map(p => ({
    ...p,
    x: ((p.x - minX) / rangeX) * 2 - 1,
    y: ((p.y - minY) / rangeY) * 2 - 1,
  }));
}
