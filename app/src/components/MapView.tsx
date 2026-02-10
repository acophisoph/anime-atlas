import { useEffect, useMemo, useState } from 'react';
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
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const transform = useMemo(() => `translate(${view.x}, ${view.y}) scale(${view.scale})`, [view.x, view.y, view.scale]);

  useEffect(() => {
    setView((prev) => ({ ...prev, x: 0, y: 0, scale: defaultScale ?? 1, dragging: false }));
    setHoveredId(null);
    onHover?.({ object: null });
  }, [viewKey, defaultScale]);

  return (
    <svg
      viewBox="-1 -1 2 2"
      style={{ width: '100%', height: '100%', background: '#0f1117', cursor: view.dragging ? 'grabbing' : 'grab' }}
      onWheel={(e: WheelEvent<SVGSVGElement>) => {
        e.preventDefault();
        const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
        setView((prev) => ({ ...prev, scale: clamp(prev.scale * zoomFactor, 0.16, 24) }));
      }}
      onDoubleClick={() => setView((prev) => ({ ...prev, scale: clamp(prev.scale * 1.35, 0.16, 24) }))}
      onMouseDown={(e: MouseEvent<SVGSVGElement>) => {
        setView((prev) => ({ ...prev, dragging: true, startX: e.clientX, startY: e.clientY }));
      }}
      onMouseMove={(e: MouseEvent<SVGSVGElement>) => {
        if (!view.dragging) {
          if (hoveredId !== null && e.target === e.currentTarget) {
            setHoveredId(null);
            onHover?.({ object: null });
          }
          return;
        }
        const dxPx = e.clientX - view.startX;
        const dyPx = e.clientY - view.startY;
        const dx = dxPx / 380;
        const dy = dyPx / 380;
        setView((prev) => ({ ...prev, x: prev.x + dx, y: prev.y + dy, startX: e.clientX, startY: e.clientY }));
      }}
      onMouseUp={() => setView((prev) => ({ ...prev, dragging: false }))}
      onMouseLeave={() => {
        setView((prev) => ({ ...prev, dragging: false }));
        setHoveredId(null);
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
          const visibleRadius = clamp(0.0023, 0.0068 / Math.sqrt(view.scale), 0.0068);
          const hitRadius = Math.max(visibleRadius * 1.22, 0.0028);
          const fill = getFillColor ? getFillColor(p) : p.type === 0 ? '#66a3ff' : '#ff8080';
          return (
            <g key={p.id}>
              <circle cx={p.x} cy={p.y} r={visibleRadius} fill={fill} pointerEvents="none" />
              <circle
                cx={p.x}
                cy={p.y}
                r={hitRadius}
                fill="transparent"
                onMouseEnter={() => {
                  if (hoveredId === p.id) return;
                  setHoveredId(p.id);
                  onHover?.({ object: p });
                }}
                onMouseLeave={() => {
                  if (hoveredId !== p.id) return;
                  setHoveredId(null);
                  onHover?.({ object: null });
                }}
                onClick={() => onClick?.({ object: p })}
              />
            </g>
          );
        })}
      </g>
    </svg>
  );
}
