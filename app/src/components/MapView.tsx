import { useMemo, useRef, useState } from 'react';

type ViewState = { x: number; y: number; scale: number; dragging: boolean; startX: number; startY: number };

export function MapView({ points, onClick }: any) {
  const [view, setView] = useState<ViewState>({ x: 0, y: 0, scale: 1, dragging: false, startX: 0, startY: 0 });
  const dragDistanceRef = useRef(0);

  const transform = useMemo(() => `translate(${view.x}, ${view.y}) scale(${view.scale})`, [view.x, view.y, view.scale]);

  return (
    <svg
      viewBox="-1 -1 2 2"
      style={{ width: '100%', height: '100%', background: '#0f1117', cursor: view.dragging ? 'grabbing' : 'grab' }}
      onWheel={(e) => {
        e.preventDefault();
        const nextScale = Math.min(20, Math.max(0.25, view.scale * (e.deltaY > 0 ? 0.9 : 1.1)));
        setView((prev) => ({ ...prev, scale: nextScale }));
      }}
      onDoubleClick={() => setView((prev) => ({ ...prev, scale: Math.min(20, prev.scale * 1.5) }))}
      onMouseDown={(e) => {
        dragDistanceRef.current = 0;
        setView((prev) => ({ ...prev, dragging: true, startX: e.clientX, startY: e.clientY }));
      }}
      onMouseMove={(e) => {
        if (!view.dragging) return;
        const dxPx = e.clientX - view.startX;
        const dyPx = e.clientY - view.startY;
        dragDistanceRef.current += Math.abs(dxPx) + Math.abs(dyPx);
        const dx = dxPx / 400;
        const dy = dyPx / 400;
        setView((prev) => ({ ...prev, x: prev.x + dx, y: prev.y + dy, startX: e.clientX, startY: e.clientY }));
      }}
      onMouseUp={() => setView((prev) => ({ ...prev, dragging: false }))}
      onMouseLeave={() => setView((prev) => ({ ...prev, dragging: false }))}
    >
      <g transform={transform}>
        {points.map((p: any) => {
          const visibleRadius = Math.max(0.004, 0.012 / Math.sqrt(view.scale));
          const hitRadius = Math.max(visibleRadius, 0.018);
          return (
            <g key={p.id}>
              <circle cx={p.x} cy={p.y} r={visibleRadius} fill={p.type === 0 ? '#66a3ff' : '#ff8080'} pointerEvents="none">
                <title>{p.id}</title>
              </circle>
              <circle
                cx={p.x}
                cy={p.y}
                r={hitRadius}
                fill="transparent"
                onClick={() => {
                  if (dragDistanceRef.current > 4) return;
                  onClick({ object: p });
                }}
              />
            </g>
          );
        })}
      </g>
    </svg>
  );
}
