import { useMemo, useState } from 'react';

type ViewState = { x: number; y: number; scale: number; dragging: boolean; startX: number; startY: number };

export function MapView({ points, onClick }: any) {
  const [view, setView] = useState<ViewState>({ x: 0, y: 0, scale: 1, dragging: false, startX: 0, startY: 0 });

  const transform = useMemo(() => `translate(${view.x}, ${view.y}) scale(${view.scale})`, [view.x, view.y, view.scale]);

  return (
    <svg
      viewBox="-1 -1 2 2"
      style={{ width: '100%', height: '100%', background: '#0f1117', cursor: view.dragging ? 'grabbing' : 'grab' }}
      onWheel={(e) => {
        e.preventDefault();
        const nextScale = Math.min(8, Math.max(0.5, view.scale * (e.deltaY > 0 ? 0.92 : 1.08)));
        setView((prev) => ({ ...prev, scale: nextScale }));
      }}
      onMouseDown={(e) => setView((prev) => ({ ...prev, dragging: true, startX: e.clientX, startY: e.clientY }))}
      onMouseMove={(e) => {
        if (!view.dragging) return;
        const dx = (e.clientX - view.startX) / 400;
        const dy = (e.clientY - view.startY) / 400;
        setView((prev) => ({ ...prev, x: prev.x + dx, y: prev.y + dy, startX: e.clientX, startY: e.clientY }));
      }}
      onMouseUp={() => setView((prev) => ({ ...prev, dragging: false }))}
      onMouseLeave={() => setView((prev) => ({ ...prev, dragging: false }))}
    >
      <g transform={transform}>
        {points.map((p: any) => (
          <circle
            key={p.id}
            cx={p.x}
            cy={p.y}
            r={0.01 / Math.sqrt(view.scale)}
            fill={p.type === 0 ? '#66a3ff' : '#ff8080'}
            onClick={() => onClick({ object: p })}
          >
            <title>{p.id}</title>
          </circle>
        ))}
      </g>
    </svg>
  );
}
