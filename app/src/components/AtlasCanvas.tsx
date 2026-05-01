import React, { useRef, useEffect, useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import { AtlasRenderer, EdgeData } from '../lib/atlas-renderer';
import { getGenreToMedia, getTagToMedia, getRoleToPeople } from '../lib/data-loader';
import { getDirectEdgeWeight } from '../lib/graph-utils';
import { t, translateClusterLabel } from '../lib/i18n';

// Cluster label segments that indicate adult content — hide them when NSFW is off
const NSFW_LABEL_TERMS = new Set(['Hentai', 'Large Breasts', 'Softcore', 'Explicit']);

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
  const peopleFilters  = useStore(s => s.peopleFilters);
  const neighborhood   = useStore(s => s.neighborhoodMap);
  const selectedId     = useStore(s => s.selectedId);
  const searchEntries  = useStore(s => s.searchEntries);
  const graphRelations = useStore(s => s.graphRelations);
  const graphStaff     = useStore(s => s.graphStaff);
  const graphCollab    = useStore(s => s.graphCollab);
  const lang           = useStore(s => s.lang);
  const setHovered        = useStore(s => s.setHovered);
  const setSelected       = useStore(s => s.setSelected);
  const clearNeighborhood = useStore(s => s.clearNeighborhood);

  // Lazy-loaded filter indices
  const [genreIndex, setGenreIndex] = useState<Record<string, number[]> | null>(null);
  const [tagIndex,   setTagIndex]   = useState<Record<string, number[]> | null>(null);
  const [roleIndex,  setRoleIndex]  = useState<Record<string, number[]> | null>(null);

  useEffect(() => {
    getGenreToMedia().then(setGenreIndex).catch(() => {});
    getTagToMedia().then(setTagIndex).catch(() => {});
    getRoleToPeople().then(setRoleIndex).catch(() => {});
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
    if (mode === 'season') return points; // SeasonView handles its own display

    if (mode !== 'media') {
      // ── People mode filters ──────────────────────────────────────────────
      const { includeVA, roles } = peopleFilters;

      // VA exclusion set
      const vaIds: Set<number> | null = (!includeVA && roleIndex)
        ? new Set<number>(roleIndex['Voice Actor'] ?? [])
        : null;

      // Role filter: intersection across all selected roles
      let roleAllowed: Set<number> | null = null;
      if (roles.length > 0 && roleIndex) {
        for (const r of roles) {
          const ids = new Set<number>(roleIndex[r] ?? []);
          if (roleAllowed === null) {
            roleAllowed = ids;
          } else {
            const prev: Set<number> = roleAllowed;
            roleAllowed = new Set(Array.from(prev).filter((id: number) => ids.has(id)));
          }
        }
      }

      if (!vaIds && !roleAllowed) return points; // no people filters active

      return points.filter(p => {
        if (p.kind !== 'person') return true;
        if (vaIds && vaIds.has(p.id)) return false;
        if (roleAllowed && !roleAllowed.has(p.id)) return false;
        return true;
      });
    }

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
  }, [points, mode, mediaFilters, peopleFilters, mediaEntryMap, genreIndex, tagIndex, roleIndex]);

  // ── Renderer init ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!canvasRef.current || !wrapRef.current) return;
    const { width, height } = wrapRef.current.getBoundingClientRect();

    const renderer = new AtlasRenderer({
      canvas: canvasRef.current,
      width,
      height,
      onHover: (id) => setHovered(id),
      onClick: (id, kind) => {
        if (id === null) { clearNeighborhood(); setSelected(null, null); }
        else setSelected(id, kind);
      },
      onPanStart: () => clearNeighborhood(),
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
    const r = rendererRef.current;
    if (!r) return;
    const showNSFW = mediaFilters.showNSFW;
    // Hide clusters whose labels contain adult-content terms when NSFW is off
    const visible = showNSFW
      ? clusters
      : clusters.filter(cl =>
          !cl.label.split(' · ').some(part => NSFW_LABEL_TERMS.has(part))
        );
    // Translate each label segment in JP mode
    r.setClusters(
      visible.map(cl => ({ ...cl, label: translateClusterLabel(cl.label, lang) }))
    );
  }, [clusters, mediaFilters.showNSFW, lang]);

  // ── Neighborhood + edges ──────────────────────────────────────────────────
  useEffect(() => {
    const r = rendererRef.current;
    if (!r) return;
    r.setNeighborhood(neighborhood);
    r.setSelected(selectedId);

    if (selectedId !== null && neighborhood.size > 0) {
      const edges: EdgeData[] = [];
      // Pick the best available graph for weight lookup (prefer staff > relations > collab)
      const weightGraph = graphStaff && graphStaff.nodeCount > 0 ? graphStaff
                        : graphRelations && graphRelations.nodeCount > 0 ? graphRelations
                        : graphCollab;
      for (const [nodeId, hop] of neighborhood) {
        const weight = (hop === 1 && weightGraph)
          ? getDirectEdgeWeight(weightGraph, selectedId, nodeId)
          : undefined;
        edges.push({ fromId: selectedId, toId: nodeId, hop, weight });
      }
      r.setEdges(edges);
    } else {
      r.setEdges([]);
    }
  }, [neighborhood, selectedId, graphRelations, graphStaff, graphCollab]);

  // "No people data" = zero person nodes in the raw dataset (not yet ingested).
  // We do NOT show this overlay based on visibleCount (filtered count) because
  // transient filter states can make visibleCount=0 and the solid background
  // causes the "black screen" bug during normal interaction.
  const hasPeopleData = useMemo(() => points.some(p => p.kind === 'person'), [points]);
  const mediaVisibleCount = useMemo(() => filteredPoints.filter(p => p.kind === 'media').length, [filteredPoints]);

  return (
    <div ref={wrapRef} style={{ width: '100%', height: '100%', position: 'relative', background: '#07070f' }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />

      <div style={styles.zoomHint}>
        {t('Scroll to zoom · Drag to pan · Click a node to explore · Zoom in to see individual titles', lang)}
      </div>

      {/* People not yet ingested — only when data truly doesn't exist */}
      {mode !== 'media' && !hasPeopleData && (
        <div style={styles.emptyState}>
          <div style={{ fontSize: 44, marginBottom: 12 }}>👤</div>
          <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 8, color: '#c8c8f8' }}>
            {t('People data not yet ingested', lang)}
          </div>
          <div style={{ fontSize: 13, color: '#6666a0', maxWidth: 300, textAlign: 'center', lineHeight: 1.6 }}>
            {t('Staff and voice actor data is fetched in later ingest batches. Check back after the next scheduled run (every 6 hours).', lang)}
          </div>
        </div>
      )}

      {/* Media filters returned nothing — non-blocking, no solid background */}
      {mode === 'media' && mediaVisibleCount === 0 && hasPeopleData !== undefined && (
        <div style={styles.filterEmpty}>
          <div style={{ fontSize: 13, color: '#6666a0' }}>
            🔍 {t('No media matches these filters', lang)}
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
  filterEmpty: {
    position: 'absolute', bottom: 48, left: '50%', transform: 'translateX(-50%)',
    background: 'rgba(7,7,15,0.85)', borderRadius: 8, padding: '8px 16px',
    pointerEvents: 'none',
  },
  emptyState: {
    position: 'absolute', inset: 0,
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    pointerEvents: 'none', background: '#07070f',
  },
};
