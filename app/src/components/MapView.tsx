import { useEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent, WheelEvent } from 'react';

type ViewState = { x: number; y: number; scale: number; dragging: boolean; startX: number; startY: number };

type Point = { id: number; x: number; y: number; type?: number };
type Edge = { from: { x: number; y: number }; to: { x: number; y: number }; width?: number; color?: string; opacity?: number };

type MapViewProps = {
  points: Point[];
  onClick?: (info: { object: Point | null }) => void;
  onHover?: (info: { object: Point | null }) => void;
  getFillColor?: (p: Point) => string;
  edges?: Edge[];
  viewKey?: string;
  defaultScale?: number;
};

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function MapView({ points, onClick, onHover, getFillColor, edges = [], viewKey, defaultScale }: MapViewProps) {
  const [view, setView] = useState<ViewState>({ x: 0, y: 0, scale: defaultScale ?? 1, dragging: false, startX: 0, startY: 0 });
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragDistanceRef = useRef(0);

  useEffect(() => {
    setView((prev) => ({ ...prev, x: 0, y: 0, scale: defaultScale ?? 1, dragging: false }));
  }, [viewKey, defaultScale]);

  const transform = useMemo(() => `translate(${view.x}, ${view.y}) scale(${view.scale})`, [view.x, view.y, view.scale]);

  const nearest = (clientX: number, clientY: number): Point | null => {
    if (!svgRef.current || !points.length) return null;
    const rect = svgRef.current.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;

    const sx = ((clientX - rect.left) / rect.width) * 2 - 1;
    const sy = ((clientY - rect.top) / rect.height) * 2 - 1;
    const worldX = (sx - view.x) / view.scale;
    const worldY = (sy - view.y) / view.scale;

    const worldThreshold = ((18 / rect.width) * 2) / view.scale;
    const maxDist2 = worldThreshold * worldThreshold;
    let best: Point | null = null;
    let bestD2 = maxDist2;

    for (const p of points) {
      const dx = p.x - worldX;
      const dy = p.y - worldY;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD2) {
        bestD2 = d2;
        best = p;
      }
    }
    return best;
  };

  return (
    <svg
      ref={svgRef}
      viewBox="-1 -1 2 2"
      style={{ width: '100%', height: '100%', background: '#0f1117', cursor: view.dragging ? 'grabbing' : 'grab' }}
      onWheel={(e: WheelEvent<SVGSVGElement>) => {
        e.preventDefault();
        const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
        setView((prev) => ({ ...prev, scale: clamp(prev.scale * zoomFactor, 0.16, 24) }));
      }}
      onDoubleClick={() => setView((prev) => ({ ...prev, scale: clamp(prev.scale * 1.35, 0.16, 24) }))}
      onMouseDown={(e: MouseEvent<SVGSVGElement>) => {
        dragDistanceRef.current = 0;
        setView((prev) => ({ ...prev, dragging: true, startX: e.clientX, startY: e.clientY }));
      }}
      onMouseMove={(e: MouseEvent<SVGSVGElement>) => {
        if (!view.dragging) {
          onHover?.({ object: nearest(e.clientX, e.clientY) });
          return;
        }
        const dxPx = e.clientX - view.startX;
        const dyPx = e.clientY - view.startY;
        dragDistanceRef.current += Math.abs(dxPx) + Math.abs(dyPx);
        const dx = dxPx / 380;
        const dy = dyPx / 380;
        setView((prev) => ({ ...prev, x: prev.x + dx, y: prev.y + dy, startX: e.clientX, startY: e.clientY }));
      }}
      onMouseUp={(e: MouseEvent<SVGSVGElement>) => {
        const moved = dragDistanceRef.current > 4;
        setView((prev) => ({ ...prev, dragging: false }));
        if (!moved) onClick?.({ object: nearest(e.clientX, e.clientY) });
      }}
      onMouseLeave={() => {
        setView((prev) => ({ ...prev, dragging: false }));
        onHover?.({ object: null });
      }}
    >
      <g transform={transform}>
        {!view.dragging &&
          edges.map((e: Edge, idx: number) => (
            <line
              key={`edge-${idx}`}
              x1={e.from.x}
              y1={e.from.y}
              x2={e.to.x}
              y2={e.to.y}
              stroke={e.color ?? '#64748b'}
              strokeWidth={Math.max(0.0012, (e.width ?? 1) / 280)}
              strokeOpacity={e.opacity ?? 0.3}
            />
          ))}
        {points.map((p: Point) => {
          const visibleRadius = Math.max(0.0038, 0.011 / Math.sqrt(view.scale));
          const fill = getFillColor ? getFillColor(p) : p.type === 0 ? '#66a3ff' : '#ff8080';
          return <circle key={p.id} cx={p.x} cy={p.y} r={visibleRadius} fill={fill} pointerEvents="none" />;
        })}
      </g>
    </svg>
  );
}
