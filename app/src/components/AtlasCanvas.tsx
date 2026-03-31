import React, { useRef, useEffect } from 'react';
import { useStore } from '../lib/store';
import { AtlasRenderer } from '../lib/atlas-renderer';

export function AtlasCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<AtlasRenderer | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const points       = useStore(s => s.points);
  const clusters     = useStore(s => s.clusters);
  const mode         = useStore(s => s.mode);
  const neighborhood = useStore(s => s.neighborhoodMap);
  const selectedId   = useStore(s => s.selectedId);
  const setHovered   = useStore(s => s.setHovered);
  const setSelected  = useStore(s => s.setSelected);

  // Init renderer
  useEffect(() => {
    if (!canvasRef.current || !wrapRef.current) return;
    const rect = wrapRef.current.getBoundingClientRect();

    const renderer = new AtlasRenderer({
      canvas: canvasRef.current,
      width: rect.width,
      height: rect.height,
      onHover: (id) => setHovered(id),
      onClick: (id, kind) => setSelected(id, kind),
    });
    rendererRef.current = renderer;

    const obs = new ResizeObserver(entries => {
      const e = entries[0];
      const w = e.contentRect.width;
      const h = e.contentRect.height;
      renderer.resize(w, h);
    });
    obs.observe(wrapRef.current);

    return () => {
      obs.disconnect();
      renderer.destroy();
      rendererRef.current = null;
    };
  }, []);

  // Update points when they change or mode changes
  useEffect(() => {
    if (rendererRef.current && points.length > 0) {
      rendererRef.current.setPoints(points, mode === 'media' ? 'media' : 'people');
    }
  }, [points, mode]);

  // Update clusters
  useEffect(() => {
    if (rendererRef.current) {
      rendererRef.current.setClusters(clusters);
    }
  }, [clusters]);

  // Update neighborhood overlay
  useEffect(() => {
    if (rendererRef.current) {
      rendererRef.current.setNeighborhood(neighborhood);
      rendererRef.current.setSelected(selectedId);
    }
  }, [neighborhood, selectedId]);

  const visiblePoints = points.filter(p =>
    mode === 'media' ? p.kind === 'media' : p.kind === 'person'
  );

  const emptyStyle: React.CSSProperties = {
    position: 'absolute', inset: 0,
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    color: '#8888a8', pointerEvents: 'none',
  };

  return (
    <div ref={wrapRef} style={{ width: '100%', height: '100%', position: 'relative' }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
      {visiblePoints.length === 0 && (
        <div style={emptyStyle}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>👤</div>
          <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 6 }}>
            People data not yet ingested
          </div>
          <div style={{ fontSize: 13, color: '#6666a0', maxWidth: 320, textAlign: 'center' }}>
            Staff and voice actor data is fetched in later ingest batches.
            Check back after the next scheduled run.
          </div>
        </div>
      )}
    </div>
  );
}
