/**
 * Coordinate computation from tag/genre similarity.
 * Falls back to deterministic grid layout for small datasets.
 */

const UMAP_THRESHOLD = 200; // minimum points to attempt UMAP

/**
 * Build feature vectors for media items from their tags and genres.
 */
export function buildMediaFeatureVectors(mediaRows) {
  // Collect all unique tags and genres
  const tagSet = new Set();
  const genreSet = new Set();

  for (const m of mediaRows) {
    const tags = JSON.parse(m.tags_json || '[]');
    const genres = JSON.parse(m.genres_json || '[]');
    tags.forEach(t => tagSet.add(`tag:${t.name}`));
    genres.forEach(g => genreSet.add(`genre:${g}`));
  }

  const features = [...genreSet, ...tagSet];
  const featureIndex = new Map(features.map((f, i) => [f, i]));
  const dim = features.length;

  const vectors = mediaRows.map(m => {
    const vec = new Float32Array(dim);
    const tags = JSON.parse(m.tags_json || '[]');
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
 * Build feature vectors for people from their credited roles + associated media tags.
 */
export function buildPeopleFeatureVectors(peopleRows, creditsMap, mediaTagMap) {
  const roleSet = new Set();
  const tagSet = new Set();

  for (const p of peopleRows) {
    const credits = creditsMap.get(p.id) || [];
    for (const c of credits) {
      if (!c.is_localization) roleSet.add(`role:${c.role}`);
      const tags = mediaTagMap.get(c.media_id) || [];
      tags.forEach(t => tagSet.add(`tag:${t}`));
    }
  }

  const features = [...roleSet, ...tagSet];
  const featureIndex = new Map(features.map((f, i) => [f, i]));
  const dim = features.length;

  const vectors = peopleRows.map(p => {
    const vec = new Float32Array(dim);
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

  // Filter out all-zero vectors — UMAP produces NaN for identical zero vectors.
  // Keep a fallback position map for them and only UMAP the non-zero subset.
  const spiral = deterministicLayout(ids);
  const spiralMap = new Map(spiral.map(p => [p.id, p]));

  const nonZeroIdx = [];
  for (let i = 0; i < vectors.length; i++) {
    if (vectors[i].some(v => v !== 0)) nonZeroIdx.push(i);
  }

  if (nonZeroIdx.length < UMAP_THRESHOLD) {
    console.log(`[coords] Only ${nonZeroIdx.length} non-zero vectors, using spiral layout`);
    return spiral;
  }

  try {
    const { UMAP } = await import('umap-js');
    const subVectors = nonZeroIdx.map(i => Array.from(vectors[i]));
    const subIds     = nonZeroIdx.map(i => ids[i]);

    const umap = new UMAP({
      nComponents: 2,
      nNeighbors: Math.min(15, subVectors.length - 1),
      minDist: 0.1,
      spread: 1.0,
      random: seededRandom(42),
    });

    const embedding = umap.fit(subVectors);

    // Build result: UMAP coords for non-zero vectors, spiral for zero-vector stubs
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
  // Stable spiral layout seeded by index
  const n = ids.length;
  const goldenAngle = 2.399963229728653; // radians
  return ids.map((id, i) => {
    const r = Math.sqrt(i / n) * 10;
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
