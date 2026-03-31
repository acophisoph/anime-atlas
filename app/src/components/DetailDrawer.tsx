import React, { useEffect, useState } from 'react';
import { useStore } from '../lib/store';
import { loadMediaMeta, loadPersonMeta, loadGraph } from '../lib/data-loader';
import { getNeighborhood } from '../lib/graph-utils';
import type { MediaMeta, PersonMeta, ConnectionMethod } from '../types';

export function DetailDrawer() {
  const selectedId   = useStore(s => s.selectedId);
  const selectedKind = useStore(s => s.selectedKind);
  const lang         = useStore(s => s.lang);
  const setSelected  = useStore(s => s.setSelected);
  const setNeighborhood = useStore(s => s.setNeighborhood);
  const clearNeighborhood = useStore(s => s.clearNeighborhood);
  const graphRelations = useStore(s => s.graphRelations);
  const graphStaff     = useStore(s => s.graphStaff);
  const graphCollab    = useStore(s => s.graphCollab);

  const [meta, setMeta] = useState<MediaMeta | PersonMeta | null>(null);
  const [connMethod, setConnMethod] = useState<ConnectionMethod>('relations');
  const [hopDepth, setHopDepth]     = useState(1);

  useEffect(() => {
    if (selectedId === null) { setMeta(null); return; }
    if (selectedKind === 'media') {
      loadMediaMeta(selectedId).then(setMeta).catch(() => setMeta(null));
    } else {
      loadPersonMeta(selectedId).then(setMeta).catch(() => setMeta(null));
    }
  }, [selectedId, selectedKind]);

  function exploreConnections() {
    if (selectedId === null) return;
    let graph = graphRelations;
    if (connMethod === 'staff') graph = graphStaff;
    else if (connMethod === 'relations') graph = graphRelations;
    if (!graph) return;
    const map = getNeighborhood(graph, selectedId, hopDepth);
    setNeighborhood(map);
  }

  if (selectedId === null || !meta) {
    return null;
  }

  const isMedia = selectedKind === 'media';
  const m = meta as MediaMeta;
  const p = meta as PersonMeta;

  const title = isMedia
    ? (lang === 'jp' ? m.title.native : m.title.english) || m.title.romaji || String(selectedId)
    : (lang === 'jp' ? p.nameNative : p.nameFull) || String(selectedId);

  const subtitle = isMedia
    ? [m.type, m.format, m.seasonYear].filter(Boolean).join(' · ')
    : p.language || '';

  return (
    <aside style={styles.drawer}>
      <div style={styles.header}>
        <div>
          <div style={styles.title}>{title}</div>
          {subtitle && <div style={styles.subtitle}>{subtitle}</div>}
        </div>
        <button style={styles.closeBtn} onClick={() => { setSelected(null, null); clearNeighborhood(); }}>✕</button>
      </div>

      {isMedia && m.coverImage.large && (
        <img src={m.coverImage.large} alt={title} style={styles.cover} />
      )}

      {isMedia && (
        <>
          {m.genres.length > 0 && (
            <div style={styles.section}>
              <div style={styles.sectionLabel}>Genres</div>
              <div style={styles.tagRow}>
                {m.genres.map(g => <Tag key={g} label={g} />)}
              </div>
            </div>
          )}

          {m.tags.slice(0, 8).length > 0 && (
            <div style={styles.section}>
              <div style={styles.sectionLabel}>Tags</div>
              <div style={styles.tagRow}>
                {m.tags.slice(0, 8).map(t => <Tag key={t.id} label={t.name} />)}
              </div>
            </div>
          )}

          {m.studios.length > 0 && (
            <div style={styles.section}>
              <div style={styles.sectionLabel}>Studios</div>
              <div style={styles.tagRow}>
                {m.studios.filter(s => s.isAnimationStudio).map(s => (
                  <Tag key={s.id} label={s.name} color="#2a3a5a" />
                ))}
              </div>
            </div>
          )}

          {m.averageScore && (
            <div style={styles.score}>
              Score: <span style={{ color: '#ffd700' }}>{m.averageScore}%</span>
              {' '}· Popularity: <span style={{ color: '#93c5fd' }}>{m.popularity?.toLocaleString()}</span>
            </div>
          )}
        </>
      )}

      {!isMedia && p.description && (
        <div style={styles.section}>
          <div style={styles.sectionLabel}>About</div>
          <div style={styles.bio}>{p.description.slice(0, 300)}{p.description.length > 300 ? '…' : ''}</div>
        </div>
      )}

      {!isMedia && p.siteUrl && (
        <a href={p.siteUrl} target="_blank" rel="noopener noreferrer" style={styles.link}>
          AniList Profile ↗
        </a>
      )}

      {/* Explore Connections */}
      <div style={styles.section}>
        <div style={styles.sectionLabel}>Explore Connections</div>
        <div style={styles.controlRow}>
          <select style={styles.select} value={connMethod}
            onChange={e => setConnMethod(e.target.value as ConnectionMethod)}>
            {isMedia && <option value="relations">Relations</option>}
            {isMedia && <option value="staff">Staff Overlap</option>}
            {!isMedia && <option value="collab">Collaborators</option>}
          </select>
          <select style={styles.select} value={hopDepth}
            onChange={e => setHopDepth(+e.target.value)}>
            <option value={1}>1 hop</option>
            <option value={2}>2 hops</option>
            <option value={3}>3 hops</option>
          </select>
        </div>
        <button style={styles.actionBtn} onClick={exploreConnections}>
          Show Connections
        </button>
        <button style={{ ...styles.actionBtn, ...styles.secondaryBtn }} onClick={clearNeighborhood}>
          Clear Overlay
        </button>
      </div>

      {/* Hop Legend */}
      <div style={styles.hopLegend}>
        {[1, 2, 3].map((h, i) => (
          <div key={h} style={styles.hopItem}>
            <div style={{ ...styles.hopDot, background: ['#ffd700','#ff8c00','#ff4500'][i] }} />
            <span>Hop {h}</span>
          </div>
        ))}
      </div>
    </aside>
  );
}

function Tag({ label, color = '#1e2040' }: { label: string; color?: string }) {
  return (
    <span style={{
      padding: '2px 8px', borderRadius: 10, background: color,
      border: '1px solid #2a2a50', color: '#9090c8', fontSize: 11,
    }}>{label}</span>
  );
}

const styles: Record<string, React.CSSProperties> = {
  drawer: {
    width: 300, flexShrink: 0, background: '#111118', borderLeft: '1px solid #1e1e2e',
    overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 0,
  },
  header: {
    display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
    marginBottom: 12, gap: 8,
  },
  title: { fontWeight: 700, fontSize: 15, color: '#e8e8f8', lineHeight: 1.3 },
  subtitle: { fontSize: 12, color: '#8888a8', marginTop: 2 },
  closeBtn: {
    border: 'none', background: 'transparent', color: '#888', cursor: 'pointer', fontSize: 16,
    padding: 4, lineHeight: 1, flexShrink: 0,
  },
  cover: {
    width: '100%', maxHeight: 200, objectFit: 'cover',
    borderRadius: 8, marginBottom: 12,
  },
  section: { marginBottom: 14 },
  sectionLabel: {
    fontSize: 11, fontWeight: 600, color: '#6666a0',
    textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6,
  },
  tagRow: { display: 'flex', flexWrap: 'wrap', gap: 4 },
  score: { fontSize: 12, color: '#8888a8', marginBottom: 12 },
  bio: { fontSize: 12, color: '#9090b0', lineHeight: 1.6 },
  link: { display: 'block', color: '#5b9cf6', fontSize: 13, marginBottom: 12 },
  controlRow: { display: 'flex', gap: 6, marginBottom: 6 },
  select: {
    flex: 1, padding: '5px 8px', borderRadius: 5, border: '1px solid #2a2a40',
    background: '#1a1a28', color: '#c8c8e8', fontSize: 12, outline: 'none',
  },
  actionBtn: {
    width: '100%', padding: '8px 0', borderRadius: 6, border: 'none',
    background: '#2030a0', color: '#e8e8f8', cursor: 'pointer', fontSize: 13,
    marginBottom: 6,
  },
  secondaryBtn: { background: '#1e1e38', color: '#9090c8' },
  hopLegend: { display: 'flex', gap: 12, marginTop: 4 },
  hopItem: { display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#8888a8' },
  hopDot: { width: 10, height: 10, borderRadius: '50%' },
};
