import React, { useRef, useEffect, useCallback } from 'react';
import { useStore } from '../lib/store';
import { AtlasRenderer, EdgeData } from '../lib/atlas-renderer';
import { getNeighborhood } from '../lib/graph-utils';

export function AtlasCanvas() {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<AtlasRenderer | null>(null);
  const wrapRef    = useRef<HTMLDivElement>(null);

  const points        = useStore(s => s.points);
  const clusters      = useStore(s => s.clusters);
  const mode          = useStore(s => s.mode);
  const neighborhood  = useStore(s => s.neighborhoodMap);
  const selectedId    = useStore(s => s.selectedId);
  const graphRelations = useStore(s => s.graphRelations);
  const graphStaff     = useStore(s => s.graphStaff);
  const graphCollab    = useStore(s => s.graphCollab);
  const setHovered    = useStore(s => s.setHovered);
  const setSelected   = useStore(s => s.setSelected);

  // Init renderer
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

  // Build genre map from points + meta — use search entries genre field when available
  // For now derive from points colorRGB (enough for initial render)
  // Points update → rebuild sprites + autofit
  useEffect(() => {
    const r = rendererRef.current;
    if (!r || points.length === 0) return;
    r.setPoints(points, mode === 'media' ? 'media' : 'people');
  }, [points, mode]);

  useEffect(() => {
    rendererRef.current?.setClusters(clusters);
  }, [clusters]);

  // Neighborhood + edges
  useEffect(() => {
    const r = rendererRef.current;
    if (!r) return;
    r.setNeighborhood(neighborhood);
    r.setSelected(selectedId);

    // Build edge list for drawing lines
    if (selectedId !== null && neighborhood.size > 0) {
      const edges: EdgeData[] = [];
      // Gather all graphs that might have edges
      const graphs = [graphRelations, graphStaff, graphCollab].filter(Boolean);
      for (const [nodeId, hop] of neighborhood) {
        // Find which graph connects selectedId → nodeId (or nodeId → other nodes at further hops)
        edges.push({ fromId: selectedId, toId: nodeId, hop });
      }
      r.setEdges(edges);
    } else {
      r.setEdges([]);
    }
  }, [neighborhood, selectedId, graphRelations, graphStaff, graphCollab]);

  const visibleCount = points.filter(p =>
    mode === 'media' ? p.kind === 'media' : p.kind === 'person'
  ).length;

  return (
    <div ref={wrapRef} style={{ width: '100%', height: '100%', position: 'relative', background: '#080810' }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />

      {/* Zoom hint */}
      <div style={styles.zoomHint}>Scroll to zoom · Drag to pan · Click a node to explore · Zoom in to see individual titles</div>

      {/* Empty state for People mode */}
      {visibleCount === 0 && (
        <div style={styles.emptyState}>
          <div style={{ fontSize: 44, marginBottom: 12 }}>👤</div>
          <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 8, color: '#c8c8f8' }}>
            People data not yet ingested
          </div>
          <div style={{ fontSize: 13, color: '#6666a0', maxWidth: 300, textAlign: 'center', lineHeight: 1.6 }}>
            Staff and voice actor data is fetched in later ingest batches.
            Check back after the next scheduled run (every 6 hours).
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
    pointerEvents: 'none',
  },
};
