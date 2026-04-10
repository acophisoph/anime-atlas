import React, { useEffect, useState, useCallback } from 'react';
import { useStore } from '../lib/store';
import { loadMediaMeta, loadPersonMeta } from '../lib/data-loader';
import { getNeighborhood } from '../lib/graph-utils';
import { t, translateGenre, translateTag, translateRole } from '../lib/i18n';
import type { MediaMeta, PersonMeta, Graph } from '../types';

type ConnTab = 'info' | 'connections' | 'similar';

export function DetailDrawer() {
  const selectedId    = useStore(s => s.selectedId);
  const selectedKind  = useStore(s => s.selectedKind);
  const lang          = useStore(s => s.lang);
  const setSelected   = useStore(s => s.setSelected);
  const setNeighborhood  = useStore(s => s.setNeighborhood);
  const clearNeighborhood = useStore(s => s.clearNeighborhood);
  const neighborhoodMap  = useStore(s => s.neighborhoodMap);
  const graphRelations = useStore(s => s.graphRelations);
  const graphStaff     = useStore(s => s.graphStaff);
  const graphCollab    = useStore(s => s.graphCollab);
  const searchEntries  = useStore(s => s.searchEntries);
  const mediaFilters   = useStore(s => s.mediaFilters);
  const points         = useStore(s => s.points);

  const [meta, setMeta] = useState<MediaMeta | PersonMeta | null>(null);
  const [tab, setTab]   = useState<ConnTab>('info');
  const [connMethod, setConnMethod] = useState<'relations' | 'staff' | 'collab'>('relations');
  const [hopDepth, setHopDepth]     = useState(1);
  const [minWeight, setMinWeight]   = useState(1);

  useEffect(() => {
    if (selectedId === null) { setMeta(null); return; }
    setTab('info');
    // Default connection edge type to 'collab' for people, 'relations' for media
    setConnMethod(selectedKind === 'person' ? 'collab' : 'relations');
    if (selectedKind === 'media') {
      loadMediaMeta(selectedId).then(setMeta).catch(() => setMeta(null));
    } else {
      loadPersonMeta(selectedId).then(setMeta).catch(() => setMeta(null));
    }
  }, [selectedId, selectedKind]);

  const exploreConnections = useCallback(() => {
    if (selectedId === null) return;
    let graph = connMethod === 'relations' ? graphRelations
              : connMethod === 'staff'     ? graphStaff
              : graphCollab;
    if (!graph || graph.nodeCount === 0) return;
    const map = getNeighborhood(graph, selectedId, hopDepth, minWeight);
    setNeighborhood(map);
  }, [selectedId, connMethod, hopDepth, minWeight, graphRelations, graphStaff, graphCollab, setNeighborhood]);

  const close = () => { setSelected(null, null); clearNeighborhood(); };

  if (selectedId === null) return null;

  const isMedia = selectedKind === 'media';
  const m = meta as MediaMeta | null;
  const p = meta as PersonMeta | null;

  const title = !meta ? '…'
    : isMedia
      ? (lang === 'jp' ? m!.title.native : m!.title.english) || m!.title.romaji || String(selectedId)
      : (lang === 'jp' ? p!.nameNative : p!.nameFull) || String(selectedId);

  const subtitle = !meta ? ''
    : isMedia
      ? [m!.type, m!.format, m!.seasonYear].filter(Boolean).join(' · ')
      : p!.language || '';

  // Neighbor list with names
  const neighborEntries = [...neighborhoodMap.entries()]
    .sort((a, b) => a[1] - b[1]) // sort by hop
    .slice(0, 60)
    .map(([id, hop]) => {
      const se = searchEntries.find(e => e.id === id);
      const name = se ? (lang === 'jp' ? se.jp : se.en) || se.ro : String(id);
      return { id, hop, name, kind: se?.kind ?? 'media', isAdult: se?.isAdult ?? false, genres: se?.genres ?? '' };
    })
    .filter(({ kind, isAdult, genres }: { kind: string; isAdult: boolean; genres: string }) => {
      if (!mediaFilters.showNSFW && kind === 'media') {
        if (isAdult) return false;
        if (genres?.split(',').includes('Hentai')) return false;
      }
      return true;
    });

  const graphAvailable = (g: typeof graphRelations) => g && g.nodeCount > 0;

  return (
    <aside style={styles.drawer}>
      {/* Header */}
      <div style={styles.header}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={styles.title} title={title}>{title}</div>
          {subtitle && <div style={styles.subtitle}>{subtitle}</div>}
        </div>
        <button style={styles.closeBtn} onClick={close}>✕</button>
      </div>

      {/* Cover image */}
      {isMedia && m?.coverImage.large && (
        <img src={m.coverImage.large} alt={title} style={styles.cover} />
      )}

      {/* Score bar */}
      {isMedia && m && (m.averageScore || m.popularity) && (
        <div style={styles.scoreRow}>
          {m.averageScore && (
            <span style={styles.scorePill}>
              ⭐ {m.averageScore}%
            </span>
          )}
          {m.popularity ? (
            <span style={styles.popPill}>
              🔥 {m.popularity.toLocaleString()} {t('fans', lang)}
            </span>
          ) : null}
        </div>
      )}

      {/* Tabs */}
      <div style={styles.tabs}>
        {(['info', 'connections', 'similar'] as ConnTab[]).map(tab_ => (
          <button key={tab_} style={{ ...styles.tab, ...(tab === tab_ ? styles.tabActive : {}) }}
            onClick={() => setTab(tab_)}>
            {tab_ === 'info'
              ? t('Info', lang)
              : tab_ === 'connections'
                ? `${t('Connections', lang)}${neighborhoodMap.size > 0 ? ` (${neighborhoodMap.size})` : ''}`
                : t('Similar', lang)}
          </button>
        ))}
      </div>

      <div style={styles.body}>
        {tab === 'info' && (
          <InfoTab meta={meta} isMedia={isMedia} lang={lang} />
        )}

        {tab === 'connections' && (
          <ConnectionsTab
            isMedia={isMedia}
            connMethod={connMethod}
            setConnMethod={setConnMethod}
            hopDepth={hopDepth}
            setHopDepth={setHopDepth}
            minWeight={minWeight}
            setMinWeight={setMinWeight}
            onExplore={exploreConnections}
            onClear={clearNeighborhood}
            neighborEntries={neighborEntries}
            graphAvailable={graphAvailable}
            graphRelations={graphRelations}
            graphStaff={graphStaff}
            graphCollab={graphCollab}
            onSelectNode={(id: number, kind: 'media' | 'person') => setSelected(id, kind)}
            lang={lang}
          />
        )}

        {tab === 'similar' && (
          <SimilarTab
            selectedId={selectedId}
            isMedia={isMedia}
            graphRelations={graphRelations}
            graphStaff={graphStaff}
            searchEntries={searchEntries}
            onSelect={(id, kind) => setSelected(id, kind)}
            lang={lang}
          />
        )}
      </div>
    </aside>
  );
}

// ---- Info Tab ----
function InfoTab({ meta, isMedia, lang }: { meta: MediaMeta | PersonMeta | null; isMedia: boolean; lang: string }) {
  if (!meta) return <div style={styles.loading}>{t('Loading…', lang)}</div>;

  if (isMedia) {
    const m = meta as MediaMeta;
    return (
      <div style={styles.infoWrap}>
        {m.genres.length > 0 && (
          <Section label={t('Genres', lang)}>
            <div style={styles.tagRow}>
              {m.genres.map(g => <Tag key={g} label={translateGenre(g, lang)} genre={g} />)}
            </div>
          </Section>
        )}
        {m.tags.slice(0, 10).length > 0 && (
          <Section label={t('Tags', lang)}>
            <div style={styles.tagRow}>
              {m.tags.slice(0, 10).map(tag => (
                <Tag key={tag.id} label={`${translateTag(tag.name, lang)} (${tag.rank})`} />
              ))}
            </div>
          </Section>
        )}
        {m.studios.filter(s => s.isAnimationStudio).length > 0 && (
          <Section label={t('Animation Studio', lang)}>
            <div style={styles.tagRow}>
              {m.studios.filter(s => s.isAnimationStudio).map(s => (
                <Tag key={s.id} label={s.name} color="#1e3a5f" />
              ))}
            </div>
          </Section>
        )}
      </div>
    );
  }

  const p = meta as PersonMeta;
  return (
    <div style={styles.infoWrap}>
      {p.imageLarge && (
        <img src={p.imageLarge} alt={p.nameFull ?? ''} style={styles.personPhoto} />
      )}
      {p.siteUrl && (
        <a href={p.siteUrl} target="_blank" rel="noopener noreferrer" style={styles.link}>
          {t('AniList Profile ↗', lang)}
        </a>
      )}
      {p.description && (
        <Section label={t('About', lang)}>
          <p style={styles.bio}>{p.description.replace(/<[^>]*>/g, '').slice(0, 300)}…</p>
        </Section>
      )}
      {p.topCredits && p.topCredits.length > 0 && (
        <Section label={t('Notable Works', lang)}>
          <div style={styles.creditList}>
            {p.topCredits.map((c, i) => (
              <div key={i} style={styles.creditRow}>
                <span style={styles.creditRole}>{translateRole(c.role, lang)}</span>
                <span style={styles.creditTitle}>{c.title}{c.year ? ` (${c.year})` : ''}</span>
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

// ---- Connections Tab ----
function ConnectionsTab({
  isMedia, connMethod, setConnMethod, hopDepth, setHopDepth,
  minWeight, setMinWeight, onExplore, onClear, neighborEntries,
  graphAvailable, graphRelations, graphStaff, graphCollab, onSelectNode, lang,
}: any) {
  const hopColors = ['#fbbf24', '#fb923c', '#f87171'];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Method selector */}
      <div>
        <Label>{t('Edge Type', lang)}</Label>
        <div style={styles.segGroup}>
          {isMedia && (
            <>
              <SegBtn active={connMethod === 'relations'} onClick={() => setConnMethod('relations')}
                disabled={!graphAvailable(graphRelations)}>
                {t('Relations', lang)}{!graphAvailable(graphRelations) && ` ${t('(loading)', lang)}`}
              </SegBtn>
              <SegBtn active={connMethod === 'staff'} onClick={() => setConnMethod('staff')}
                disabled={!graphAvailable(graphStaff)}>
                {t('Staff overlap', lang)}{!graphAvailable(graphStaff) && ` ${t('(loading)', lang)}`}
              </SegBtn>
            </>
          )}
          {!isMedia && (
            <SegBtn active={connMethod === 'collab'} onClick={() => setConnMethod('collab')}
              disabled={!graphAvailable(graphCollab)}>
              {t('Collaborators', lang)}{!graphAvailable(graphCollab) && ` ${t('(loading)', lang)}`}
            </SegBtn>
          )}
        </div>
      </div>

      {/* Hop depth */}
      <div>
        <Label>{t('Hops out', lang)} — {hopDepth}</Label>
        <input type="range" min={1} max={3} value={hopDepth}
          onChange={e => setHopDepth(+e.target.value)}
          style={{ width: '100%', accentColor: '#5b9cf6' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#666688' }}>
          <span>1</span><span>2</span><span>3</span>
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 6 }}>
        <button style={styles.primaryBtn} onClick={onExplore}>
          {t('Show connections', lang)}
        </button>
        {neighborEntries.length > 0 && (
          <button style={styles.ghostBtn} onClick={onClear}>{t('Clear', lang)}</button>
        )}
      </div>

      {/* Hop legend */}
      {neighborEntries.length > 0 && (
        <div style={styles.hopLegend}>
          {[1,2,3].map((h,i) => (
            <span key={h} style={styles.hopPill}>
              <span style={{ ...styles.hopDot, background: hopColors[i] }} />
              {h} {t('hop', lang)}
            </span>
          ))}
        </div>
      )}

      {/* Neighbor list */}
      {neighborEntries.length > 0 && (
        <div>
          <Label>{neighborEntries.length} {t('nodes reachable', lang)}</Label>
          <div style={styles.neighborList}>
            {neighborEntries.map(({ id, hop, name, kind }: any) => (
              <div key={id} style={styles.neighborRow} onClick={() => onSelectNode(id, kind)}>
                <span style={{ ...styles.hopBadge, background: hopColors[hop - 1] }}>{hop}</span>
                <span style={styles.neighborName}>{name}</span>
                <span style={styles.neighborKind}>{kind === 'media' ? '🎬' : '👤'}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {neighborEntries.length === 0 && (
        <div style={styles.hint}>
          {t('Select an edge type and click "Show connections" to explore the network from this node.', lang)}
        </div>
      )}
    </div>
  );
}

// ---- Similar Tab ----
function SimilarTab({ selectedId, isMedia, graphRelations, graphStaff, searchEntries, onSelect, lang }: {
  selectedId: number; isMedia: boolean;
  graphRelations: Graph | null; graphStaff: Graph | null;
  searchEntries: any[]; onSelect: (id: number, kind: 'media' | 'person') => void; lang: string;
}) {
  const graph: Graph | null = isMedia
    ? (graphStaff && graphStaff.nodeCount > 0 ? graphStaff : graphRelations)
    : null;

  if (!graph || graph.nodeCount === 0) {
    return <div style={styles.hint}>{t('Similar items are computed from staff overlap graphs — available after more ingest runs complete.', lang)}</div>;
  }
  const map = getNeighborhood(graph, selectedId, 1, 0);
  const similar = [...map.keys()].slice(0, 20).map(id => {
    const se = searchEntries.find((e: any) => e.id === id);
    return { id, name: se ? (lang === 'jp' ? se.jp : se.en) || se.ro : String(id), kind: (se?.kind ?? 'media') as 'media' | 'person' };
  });

  return (
    <div style={styles.neighborList}>
      {similar.map(({ id, name, kind }) => (
        <div key={id} style={styles.neighborRow} onClick={() => onSelect(id, kind)}>
          <span style={styles.neighborName}>{name}</span>
          <span style={styles.neighborKind}>{kind === 'media' ? '🎬' : '👤'}</span>
        </div>
      ))}
    </div>
  );
}

// ---- Small components ----
function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <div style={styles.label}>{children}</div>;
}

const GENRE_COLORS: Record<string, string> = {
  'Action': '#ef4444', 'Adventure': '#f97316', 'Comedy': '#eab308',
  'Drama': '#22c55e', 'Fantasy': '#a855f7', 'Romance': '#ec4899',
  'Sci-Fi': '#06b6d4', 'Mystery': '#6366f1', 'Horror': '#dc2626',
  'Slice of Life': '#84cc16', 'Sports': '#14b8a6', 'Supernatural': '#8b5cf6',
  'Music': '#f59e0b', 'Psychological': '#94a3b8', 'Mecha': '#0ea5e9',
};

function Tag({ label, genre, color }: { label: string; genre?: string; color?: string }) {
  const bg = color ?? (genre && GENRE_COLORS[genre] ? GENRE_COLORS[genre] + '22' : '#1e1e38');
  const border = genre && GENRE_COLORS[genre] ? GENRE_COLORS[genre] + '66' : '#2a2a50';
  const text = genre && GENRE_COLORS[genre] ? GENRE_COLORS[genre] : '#9090c8';
  return (
    <span style={{ padding: '3px 9px', borderRadius: 10, background: bg,
      border: `1px solid ${border}`, color: text, fontSize: 11, fontWeight: 600 }}>
      {label}
    </span>
  );
}

function SegBtn({ active, disabled, onClick, children }: any) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      flex: 1, padding: '5px 0', fontSize: 11, border: '1px solid #2a2a40',
      borderRadius: 5, cursor: disabled ? 'default' : 'pointer',
      background: active ? '#2a3a6a' : 'transparent',
      color: active ? '#93c5fd' : disabled ? '#444466' : '#8888a8',
      fontWeight: active ? 600 : 400,
    }}>
      {children}
    </button>
  );
}

const styles: Record<string, React.CSSProperties> = {
  drawer: {
    width: 320, flexShrink: 0, background: '#0e0e1a',
    borderLeft: '1px solid #1a1a2e',
    display: 'flex', flexDirection: 'column', overflow: 'hidden',
  },
  header: {
    display: 'flex', alignItems: 'flex-start', gap: 8,
    padding: '14px 16px 10px', borderBottom: '1px solid #1a1a2e', flexShrink: 0,
  },
  title: {
    fontWeight: 700, fontSize: 15, color: '#e8e8f8', lineHeight: 1.3,
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  subtitle: { fontSize: 11, color: '#6666a0', marginTop: 3 },
  closeBtn: {
    border: 'none', background: 'transparent', color: '#555577',
    cursor: 'pointer', fontSize: 17, padding: '0 2px', lineHeight: 1, flexShrink: 0,
    marginTop: 1,
  },
  cover: {
    width: '100%', maxHeight: 180, objectFit: 'cover', flexShrink: 0,
  },
  scoreRow: {
    display: 'flex', gap: 8, padding: '8px 16px', flexShrink: 0,
  },
  scorePill: {
    fontSize: 12, color: '#fbbf24', background: '#2a2010',
    border: '1px solid #4a3820', borderRadius: 12, padding: '2px 10px',
  },
  popPill: {
    fontSize: 12, color: '#93c5fd', background: '#101a2a',
    border: '1px solid #1e3a5f', borderRadius: 12, padding: '2px 10px',
  },
  tabs: {
    display: 'flex', borderBottom: '1px solid #1a1a2e', flexShrink: 0,
  },
  tab: {
    flex: 1, padding: '9px 4px', border: 'none', background: 'transparent',
    color: '#6666a0', cursor: 'pointer', fontSize: 12,
    borderBottom: '2px solid transparent', transition: 'all 0.15s',
  },
  tabActive: { color: '#93c5fd', borderBottomColor: '#3b82f6', fontWeight: 600 },
  body: {
    flex: 1, overflowY: 'auto', padding: 16,
    scrollbarWidth: 'thin',
  },
  infoWrap: { display: 'flex', flexDirection: 'column' },
  tagRow: { display: 'flex', flexWrap: 'wrap', gap: 5 },
  label: {
    fontSize: 10, fontWeight: 700, color: '#444466',
    textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 7,
  },
  link: { color: '#5b9cf6', fontSize: 13, marginBottom: 14, display: 'block' },
  bio: { fontSize: 12, color: '#9090b0', lineHeight: 1.7, margin: 0 },
  loading: { color: '#444466', fontSize: 13, padding: '20px 0' },
  hint: { fontSize: 12, color: '#444466', lineHeight: 1.6 },
  segGroup: { display: 'flex', gap: 4 },
  primaryBtn: {
    flex: 1, padding: '9px 0', borderRadius: 7, border: 'none',
    background: '#1e40af', color: '#e8e8f8', cursor: 'pointer',
    fontSize: 13, fontWeight: 600,
  },
  ghostBtn: {
    padding: '9px 14px', borderRadius: 7, border: '1px solid #2a2a40',
    background: 'transparent', color: '#8888a8', cursor: 'pointer', fontSize: 12,
  },
  hopLegend: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  hopPill: {
    display: 'flex', alignItems: 'center', gap: 5,
    fontSize: 11, color: '#8888a8',
    background: '#0e0e1a', border: '1px solid #1e1e30',
    borderRadius: 10, padding: '2px 8px',
  },
  hopDot: { width: 8, height: 8, borderRadius: '50%', flexShrink: 0 },
  neighborList: {
    display: 'flex', flexDirection: 'column', gap: 2,
    maxHeight: 360, overflowY: 'auto',
  },
  neighborRow: {
    display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px',
    borderRadius: 6, cursor: 'pointer', transition: 'background 0.1s',
    background: '#0a0a14',
  },
  hopBadge: {
    width: 18, height: 18, borderRadius: '50%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 10, fontWeight: 700, color: '#000', flexShrink: 0,
  },
  neighborName: {
    flex: 1, fontSize: 12, color: '#c8c8e8',
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  neighborKind: { fontSize: 13, flexShrink: 0 },
  personPhoto: { width: '100%', maxHeight: 200, objectFit: 'cover' as const, objectPosition: 'top', flexShrink: 0, borderBottom: '1px solid #1a1a2e' },
  creditList: { display: 'flex', flexDirection: 'column' as const, gap: 4 },
  creditRow: { display: 'flex', flexDirection: 'column' as const, gap: 1, padding: '4px 0', borderBottom: '1px solid #0e0e1a' },
  creditRole: { fontSize: 10, color: '#5b9cf6', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: 0.5 },
  creditTitle: { fontSize: 12, color: '#c8c8e8' },
};
