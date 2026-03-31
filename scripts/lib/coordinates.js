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

  try {
    const { UMAP } = await import('umap-js');
    const data = vectors.map(v => Array.from(v));

    const umap = new UMAP({
      nComponents: 2,
      nNeighbors: Math.min(15, vectors.length - 1),
      minDist: 0.1,
      spread: 1.0,
      random: seededRandom(42),
    });

    const embedding = umap.fit(data);
    return embedding.map((coords, i) => ({ id: ids[i], x: coords[0], y: coords[1] }));
  } catch (err) {
    console.warn('[coords] UMAP failed, falling back to grid:', err.message);
    return deterministicLayout(ids);
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
