import React, { useRef, useEffect, useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import { AtlasRenderer, EdgeData } from '../lib/atlas-renderer';
import { getGenreToMedia, getTagToMedia } from '../lib/data-loader';
import { t } from '../lib/i18n';

export function AtlasCanvas() {
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<AtlasRenderer | null>(null);
  const wrapRef     = useRef<HTMLDivElement>(null);
  // Track previous mode to know when to reset camera
  const prevModeRef = useRef<string>('media');

  const points         = useStore(s => s.points);
  const clusters       = useStore(s => s.clusters);
  const mode           = useStore(s => s.mode);
  const mediaFilters   = useStore(s => s.mediaFilters);
  const neighborhood   = useStore(s => s.neighborhoodMap);
  const selectedId     = useStore(s => s.selectedId);
  const searchEntries  = useStore(s => s.searchEntries);
  const graphRelations = useStore(s => s.graphRelations);
  const graphStaff     = useStore(s => s.graphStaff);
  const graphCollab    = useStore(s => s.graphCollab);
  const lang           = useStore(s => s.lang);
  const setHovered     = useStore(s => s.setHovered);
  const setSelected    = useStore(s => s.setSelected);

  // Lazy-loaded filter indices
  const [genreIndex, setGenreIndex] = useState<Record<string, number[]> | null>(null);
  const [tagIndex,   setTagIndex]   = useState<Record<string, number[]> | null>(null);

  useEffect(() => {
    getGenreToMedia().then(setGenreIndex).catch(() => {});
    getTagToMedia().then(setTagIndex).catch(() => {});
  }, []);

  // Build a fast lookup map from search entries: id → entry
  const mediaEntryMap = useMemo(() => {
    const m = new Map<number, { type?: string; year?: number; isAdult?: boolean; genres?: string }>();
    for (const e of searchEntries) {
      if (e.kind === 'media') m.set(e.id, e);
    }
    return m;
  }, [searchEntries]);

  // ── Compute filtered point set ────────────────────────────────────────────
  const filteredPoints = useMemo(() => {
    if (mode !== 'media') return points; // people mode: no media filters apply

    const { mediaType, yearMin, yearMax, showNSFW, genres, tags } = mediaFilters;

    // Pre-compute genre/tag allowed sets (intersect across all selected)
    let genreAllowed: Set<number> | null = null;
    if (genres.length > 0 && genreIndex) {
      for (const g of genres) {
        const ids = new Set<number>(genreIndex[g] ?? []);
        if (genreAllowed === null) {
          genreAllowed = ids;
        } else {
          const prev: Set<number> = genreAllowed;
          genreAllowed = new Set(Array.from(prev).filter((id: number) => ids.has(id)));
        }
      }
    }

    let tagAllowed: Set<number> | null = null;
    if (tags.length > 0 && tagIndex) {
      for (const t of tags) {
        const ids = new Set<number>(tagIndex[t] ?? []);
        if (tagAllowed === null) {
          tagAllowed = ids;
        } else {
          const prev: Set<number> = tagAllowed;
          tagAllowed = new Set(Array.from(prev).filter((id: number) => ids.has(id)));
        }
      }
    }

    // Build adult-ID set from the genre index — works with current live data
    // even before isAdult/genres fields are backfilled into search.json.
    const adultIds: Set<number> | null = (!showNSFW && genreIndex)
      ? new Set<number>(genreIndex['Hentai'] ?? [])
      : null;

    return points.filter(p => {
      if (p.kind !== 'media') return true; // person points always pass

      const entry = mediaEntryMap.get(p.id);

      // NSFW: hide adult media unless toggled on.
      // Primary check uses the genre index (works with current live artifacts).
      // Fallback checks use the isAdult/genres fields once they're in search.json.
      if (adultIds && adultIds.has(p.id)) return false;
      if (!showNSFW && entry?.isAdult) return false;
      if (!showNSFW && entry?.genres?.includes('Hentai')) return false;

      // Media type (ANIME / MANGA)
      if (mediaType !== 'BOTH' && entry?.type && entry.type !== mediaType) return false;

      // Year range
      if (yearMin && entry?.year && entry.year < yearMin) return false;
      if (yearMax && entry?.year && entry.year > yearMax) return false;

      // Genre filter (requires index, loaded async)
      if (genreAllowed && !genreAllowed.has(p.id)) return false;

      // Tag filter (requires index, loaded async)
      if (tagAllowed && !tagAllowed.has(p.id)) return false;

      return true;
    });
  }, [points, mode, mediaFilters, mediaEntryMap, genreIndex, tagIndex]);

  // ── Renderer init ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!canvasRef.current || !wrapRef.current) return;
    const { width, height } = wrapRef.current.getBoundingClientRect();

    const renderer = new AtlasRenderer({
      canvas: canvasRef.current,
      width,
      height,
      onHover: (id) => setHovered(id),
      onClick: (id, kind) => setSelected(id, kind),
    });
    rendererRef.current = renderer;

    const obs = new ResizeObserver(entries => {
      const e = entries[0];
      renderer.resize(e.contentRect.width, e.contentRect.height);
      renderer.autoFit();
    });
    obs.observe(wrapRef.current);

    return () => { obs.disconnect(); renderer.destroy(); rendererRef.current = null; };
  }, []);

  // ── Send filtered points to renderer ──────────────────────────────────────
  useEffect(() => {
    const r = rendererRef.current;
    if (!r || filteredPoints.length === 0) return;
    const rendererMode = mode === 'media' ? 'media' : 'people';
    const modeChanged = prevModeRef.current !== mode;
    prevModeRef.current = mode;
    r.setPoints(filteredPoints, rendererMode, modeChanged);
  }, [filteredPoints, mode]);

  // ── Clusters ──────────────────────────────────────────────────────────────
  useEffect(() => {
    rendererRef.current?.setClusters(clusters);
  }, [clusters]);

  // ── Neighborhood + edges ──────────────────────────────────────────────────
  useEffect(() => {
    const r = rendererRef.current;
    if (!r) return;
    r.setNeighborhood(neighborhood);
    r.setSelected(selectedId);

    if (selectedId !== null && neighborhood.size > 0) {
      const edges: EdgeData[] = [];
      for (const [nodeId, hop] of neighborhood) {
        edges.push({ fromId: selectedId, toId: nodeId, hop });
      }
      r.setEdges(edges);
    } else {
      r.setEdges([]);
    }
  }, [neighborhood, selectedId, graphRelations, graphStaff, graphCollab]);

  const visibleCount = filteredPoints.filter(p =>
    mode === 'media' ? p.kind === 'media' : p.kind === 'person'
  ).length;

  return (
    <div ref={wrapRef} style={{ width: '100%', height: '100%', position: 'relative', background: '#07070f' }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />

      <div style={styles.zoomHint}>
        {t('Scroll to zoom · Drag to pan · Click a node to explore · Zoom in to see individual titles', lang)}
      </div>

      {visibleCount === 0 && (
        <div style={styles.emptyState}>
          <div style={{ fontSize: 44, marginBottom: 12 }}>
            {mode === 'people' ? '👤' : '🔍'}
          </div>
          <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 8, color: '#c8c8f8' }}>
            {mode === 'people'
              ? t('People data not yet ingested', lang)
              : t('No media matches these filters', lang)}
          </div>
          <div style={{ fontSize: 13, color: '#6666a0', maxWidth: 300, textAlign: 'center', lineHeight: 1.6 }}>
            {mode === 'people'
              ? t('Staff and voice actor data is fetched in later ingest batches. Check back after the next scheduled run (every 6 hours).', lang)
              : t('Try relaxing your filters or reset them to see all media.', lang)}
          </div>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  zoomHint: {
    position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)',
    fontSize: 11, color: '#444466', pointerEvents: 'none', whiteSpace: 'nowrap',
  },
  emptyState: {
    position: 'absolute', inset: 0,
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    pointerEvents: 'none', background: '#07070f',
  },
};
