import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useStore } from '../lib/store';
import { loadMediaMeta, loadPersonMeta } from '../lib/data-loader';
import type { MediaMeta, PersonMeta } from '../types';

export function Tooltip() {
  const hoveredId = useStore(s => s.hoveredId);
  const points    = useStore(s => s.points);
  const lang      = useStore(s => s.lang);
  const [meta, setMeta] = useState<MediaMeta | PersonMeta | null>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // O(1) lookup — rebuilt only when the points array reference changes (not on every hover)
  const pointsById = useMemo(
    () => new Map(points.map(p => [p.id, p])),
    [points]
  );

  useEffect(() => {
    const onMove = (e: MouseEvent) => setPos({ x: e.clientX, y: e.clientY });
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, []);

  useEffect(() => {
    if (hoveredId === null) {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      setMeta(null);
      return;
    }
    const pt = pointsById.get(hoveredId);
    if (!pt) return;
    // Debounce meta fetches — don't fire a network request on every hover tick
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (pt.kind === 'media') {
        loadMediaMeta(hoveredId).then(setMeta).catch(() => setMeta(null));
      } else {
        loadPersonMeta(hoveredId).then(setMeta).catch(() => setMeta(null));
      }
    }, 80);
  }, [hoveredId, pointsById]);

  if (!meta || hoveredId === null) return null;

  const pt = pointsById.get(hoveredId);
  const isMedia = pt?.kind === 'media';

  let name: string;
  let subtitle: string;
  let genreList: string[] = [];
  if (isMedia) {
    const m = meta as MediaMeta;
    name = (lang === 'jp' ? m.title?.native : m.title?.english) || m.title?.romaji || String(m.id);
    subtitle = [m.type, m.format, m.seasonYear].filter(Boolean).join(' · ');
    genreList = m.genres ?? [];
  } else {
    const p = meta as PersonMeta;
    name = (lang === 'jp' ? p.nameNative : p.nameFull) || String(p.id);
    subtitle = p.language || '';
  }

  // Offset tooltip so it doesn't cover cursor
  const left = pos.x + 16;
  const top  = pos.y - 8;

  return (
    <div style={{ ...styles.tooltip, left, top }}>
      <div style={styles.name}>{name}</div>
      {subtitle && <div style={styles.sub}>{subtitle}</div>}
      {isMedia && genreList.length > 0 && (
        <div style={styles.tags}>
          {genreList.slice(0, 4).join(' · ')}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  tooltip: {
    position: 'fixed', pointerEvents: 'none', zIndex: 1000,
    background: 'rgba(16,16,28,0.95)', border: '1px solid #333344',
    borderRadius: 8, padding: '8px 12px', maxWidth: 240,
    boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
  },
  name: { fontWeight: 600, fontSize: 13, color: '#e8e8f8', marginBottom: 2 },
  sub:  { fontSize: 11, color: '#8888a8' },
  tags: { fontSize: 11, color: '#6666a0', marginTop: 3 },
};
