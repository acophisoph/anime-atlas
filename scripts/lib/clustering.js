/**
 * K-means clustering with label derivation from dominant tags/genres.
 */

export async function clusterPoints(points, mediaRows, peopleRows) {
  if (points.length === 0) return [];

  const k = Math.max(5, Math.min(30, Math.floor(Math.sqrt(points.length / 3))));
  const coords = points.map(p => [p.x, p.y]);

  let centroids;
  try {
    const { kmeans } = await import('ml-kmeans');
    const result = kmeans(coords, k, {
      initialization: 'kmeans++',
      seed: 42,
      maxIterations: 100,
    });
    centroids = result.centroids.map((c, i) => {
      const clusterPoints = points.filter((_, j) => result.clusters[j] === i);
      return {
        id: i,
        x: c[0],
        y: c[1],
        size: clusterPoints.length,
        label: deriveClusterLabel(clusterPoints, mediaRows, peopleRows),
      };
    });
  } catch (err) {
    console.warn('[cluster] kmeans failed, using grid centroids:', err.message);
    // Fallback: evenly spaced grid
    centroids = Array.from({ length: k }, (_, i) => ({
      id: i,
      x: (i % Math.ceil(Math.sqrt(k))) / Math.ceil(Math.sqrt(k)) * 2 - 1,
      y: Math.floor(i / Math.ceil(Math.sqrt(k))) / Math.ceil(Math.sqrt(k)) * 2 - 1,
      size: 0,
      label: `Cluster ${i + 1}`,
    }));
  }

  return centroids;
}

function deriveClusterLabel(clusterPoints, mediaRows, peopleRows) {
  const mediaById = new Map(mediaRows.map(m => [m.id, m]));
  const tagFreq = new Map();
  const genreFreq = new Map();

  for (const p of clusterPoints) {
    if (p.kind === 'media') {
      const m = mediaById.get(p.id);
      if (!m) continue;
      const tags = JSON.parse(m.tags_json || '[]');
      const genres = JSON.parse(m.genres_json || '[]');
      for (const g of genres) genreFreq.set(g, (genreFreq.get(g) || 0) + 2);
      for (const t of tags.slice(0, 5)) tagFreq.set(t.name, (tagFreq.get(t.name) || 0) + 1);
    }
  }

  const topGenres = [...genreFreq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(e => e[0]);
  const topTags = [...tagFreq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(e => e[0]);

  const terms = [...new Set([...topGenres, ...topTags])].slice(0, 3);
  return terms.length > 0 ? terms.join(' · ') : 'Mixed';
}
