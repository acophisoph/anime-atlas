import React, { useRef, useEffect, useCallback } from 'react';
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

  return (
    <div ref={wrapRef} style={{ width: '100%', height: '100%', position: 'relative' }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
    </div>
  );
}
