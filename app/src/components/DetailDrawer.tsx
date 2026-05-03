import React, { useEffect, useState, useCallback } from 'react';
import { useStore } from '../lib/store';
import { loadMediaMeta, loadPersonMeta } from '../lib/data-loader';
import { getNeighborhood } from '../lib/graph-utils';
import { t, translateGenre, translateTag, translateRole } from '../lib/i18n';
import { useIsMobile } from '../lib/use-is-mobile';
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

  const isMobile = useIsMobile();
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

  const neighborEntries = [...neighborhoodMap.entries()]
    .sort((a, b) => a[1] - b[1])
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

  const drawerStyle = isMobile
    ? {
        ...mobileDrawerStyle,
        transform: selectedId !== null ? 'translateY(0)' : 'translateY(100%)',
      }
    : styles.drawer;

  return (
    <aside style={drawerStyle}>
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
            <span style={styles.scorePill}>⭐ {m.averageScore}%</span>
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
          <InfoTab
            meta={meta}
            isMedia={isMedia}
            lang={lang}
            onSelectMedia={(id) => setSelected(id, 'media')}
          />
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
function InfoTab({
  meta, isMedia, lang, onSelectMedia,
}: {
  meta: MediaMeta | PersonMeta | null;
  isMedia: boolean;
  lang: string;
  onSelectMedia: (id: number) => void;
}) {
  if (!meta) return <div style={styles.loading}>{t('Loading…', lang)}</div>;
  if (isMedia) return <MediaInfoTab meta={meta as MediaMeta} lang={lang} />;
  return <PersonInfoTab meta={meta as PersonMeta} lang={lang} onSelectMedia={onSelectMedia} />;
}

// ---- Media Info Tab ----
function MediaInfoTab({ meta: m, lang }: { meta: MediaMeta; lang: string }) {
  const setFilters = useStore(s => s.setMediaFilters);
  const filters    = useStore(s => s.mediaFilters);

  const genres  = m.genres  ?? [];
  const tags    = m.tags    ?? [];
  const studios = m.studios ?? [];

  function addGenre(g: string) {
    if (!filters.genres.includes(g)) setFilters({ genres: [...filters.genres, g] });
  }
  function addTag(tag: string) {
    if (!filters.tags.includes(tag)) setFilters({ tags: [...filters.tags, tag] });
  }
  function setStudio(name: string) {
    setFilters({ studio: filters.studio === name ? null : name });
  }

  return (
    <div style={styles.infoWrap}>
      {genres.length > 0 && (
        <Section label={t('Genres', lang)}>
          <div style={styles.tagRow}>
            {genres.map(g => (
              <FilterPill
                key={g}
                label={translateGenre(g, lang)}
                genre={g}
                onClick={() => addGenre(g)}
                active={filters.genres.includes(g)}
                title={t('Filter by genre', lang)}
              />
            ))}
          </div>
        </Section>
      )}
      {tags.slice(0, 12).length > 0 && (
        <Section label={t('Tags', lang)}>
          <div style={styles.tagRow}>
            {tags.slice(0, 12).map(tag => (
              <FilterPill
                key={tag.id}
                label={`${translateTag(tag.name, lang)} (${tag.rank})`}
                onClick={() => addTag(tag.name)}
                active={filters.tags.includes(tag.name)}
                title={t('Filter by tag', lang)}
              />
            ))}
          </div>
        </Section>
      )}
      {studios.filter(s => s.isAnimationStudio).length > 0 && (
        <Section label={t('Animation Studio', lang)}>
          <div style={styles.tagRow}>
            {studios.filter(s => s.isAnimationStudio).map(s => (
              <FilterPill
                key={s.id}
                label={s.name}
                color="#1e3a5f"
                onClick={() => setStudio(s.name)}
                active={filters.studio === s.name}
                title={t('Filter by studio', lang)}
              />
            ))}
          </div>
        </Section>
      )}
      {filters.genres.length > 0 || filters.tags.length > 0 || filters.studio ? (
        <div style={styles.filterHint}>{t('Filters applied — switch to Media view to see results', lang)}</div>
      ) : null}
    </div>
  );
}

// ---- Person Info Tab ----
function PersonInfoTab({
  meta: p, lang, onSelectMedia,
}: {
  meta: PersonMeta;
  lang: string;
  onSelectMedia: (id: number) => void;
}) {
  const [coverMetas, setCoverMetas] = useState<Map<number, MediaMeta>>(new Map());

  useEffect(() => {
    const credits = p.topCredits;
    if (!credits?.length) return;
    let cancelled = false;
    Promise.allSettled(credits.map(c => loadMediaMeta(c.mediaId))).then(results => {
      if (cancelled) return;
      const map = new Map<number, MediaMeta>();
      results.forEach((r, i) => {
        if (r.status === 'fulfilled' && r.value) map.set(credits[i].mediaId, r.value);
      });
      setCoverMetas(map);
    });
    return () => { cancelled = true; };
  }, [p.topCredits]);

  const displayName = (lang === 'jp' ? p.nameNative : p.nameFull) ?? p.nameFull ?? '';

  // Show Sakugabooru link for people with animation roles
  const ANIMATION_ROLES_SET = new Set([
    'Key Animation', 'Animation Director', 'Chief Animation Director',
    'Episode Director', 'Director', 'Series Director', 'Storyboard',
    'In-Between Animation',
  ]);
  const isAnimator = p.topCredits?.some(c => ANIMATION_ROLES_SET.has(c.role)) ?? false;
  const sakugaName = (p.nameFull ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  const sakugaUrl  = sakugaName ? `https://www.sakugabooru.com/post?tags=${sakugaName}` : null;

  return (
    <div style={styles.infoWrap}>
      {/* Avatar: photo if available, else monogram */}
      {p.imageLarge
        ? <img src={p.imageLarge} alt={displayName} style={styles.personPhoto} />
        : displayName
          ? <MonogramAvatar name={displayName} />
          : null}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '8px 0 4px' }}>
        {p.siteUrl && (
          <a href={p.siteUrl} target="_blank" rel="noopener noreferrer" style={styles.link}>
            {t('AniList Profile ↗', lang)}
          </a>
        )}
        {isAnimator && sakugaUrl && (
          <a href={sakugaUrl} target="_blank" rel="noopener noreferrer" style={{ ...styles.link, color: '#f97316' }}>
            {t('View on Sakugabooru ↗', lang)}
          </a>
        )}
      </div>

      {p.description && (
        <Section label={t('About', lang)}>
          <p style={styles.bio}>{p.description.replace(/<[^>]*>/g, '').slice(0, 300)}…</p>
        </Section>
      )}

      {p.topCredits && p.topCredits.length > 0 && (
        <Section label={t('Notable Works', lang)}>
          <CareerTimeline
            credits={p.topCredits}
            coverMetas={coverMetas}
            lang={lang}
            onSelect={onSelectMedia}
          />
        </Section>
      )}
    </div>
  );
}

// ---- Career Timeline ----
const ROLE_BADGE_COLORS: Record<string, string> = {
  'Director':               '#5b9cf6',
  'Series Director':        '#5b9cf6',
  'Episode Director':       '#93c5fd',
  'Animation Director':     '#a855f7',
  'Chief Animation Director': '#c084fc',
  'Key Animation':          '#e879f9',
  'Character Design':       '#f97316',
  'Art Director':           '#fbbf24',
  'Music':                  '#22c55e',
  'Series Composition':     '#4ade80',
  'Screenplay':             '#34d399',
  'Script':                 '#34d399',
  'Sound Director':         '#06b6d4',
  'Producer':               '#94a3b8',
  'Executive Producer':     '#94a3b8',
  'Voice Actor':            '#fb923c',
  'Original Creator':       '#f87171',
};

function badgeColor(role: string): string {
  return ROLE_BADGE_COLORS[role] ?? '#6366f1';
}

function CareerTimeline({
  credits, coverMetas, lang, onSelect,
}: {
  credits: Array<{ mediaId: number; role: string; title: string; year: number | null }>;
  coverMetas: Map<number, MediaMeta>;
  lang: string;
  onSelect: (id: number) => void;
}) {
  const sorted = [...credits].sort((a, b) => (a.year ?? 9999) - (b.year ?? 9999));

  return (
    <div style={styles.timeline}>
      {sorted.map(c => {
        const mm = coverMetas.get(c.mediaId);
        const cover = mm?.coverImage?.large ?? null;
        const score = mm?.averageScore ?? null;
        const roleLabel = translateRole(c.role, lang);
        const color = badgeColor(c.role);

        return (
          <div
            key={c.mediaId}
            style={styles.timelineCard}
            onClick={() => onSelect(c.mediaId)}
            title={c.title}
          >
            <div style={styles.cardCover}>
              {cover
                ? <img src={cover} alt={c.title} style={styles.cardImg} />
                : <div style={styles.cardImgPlaceholder} />}
              <div style={{ ...styles.cardRoleBadge, borderColor: color + '66', color, background: color + '22' }}>
                {roleLabel}
              </div>
            </div>
            <div style={styles.cardTitle}>{c.title}</div>
            <div style={styles.cardMeta}>
              {c.year && <span>{c.year}</span>}
              {c.year && score && <span style={{ color: '#444466' }}>·</span>}
              {score && <span style={{ color: '#fbbf24' }}>⭐{score}%</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---- Monogram Avatar ----
function MonogramAvatar({ name, size = 72 }: { name: string; size?: number }) {
  const words = name.trim().split(/\s+/);
  const initials = words.length >= 2
    ? (words[0][0] + words[words.length - 1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase();
  // Deterministic hue from name
  const hue = name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % 360;
  return (
    <div style={{
      width: '100%', height: size, display: 'flex', alignItems: 'center',
      justifyContent: 'center', background: '#0e0e1a', flexShrink: 0,
      borderBottom: '1px solid #1a1a2e',
    }}>
      <div style={{
        width: size, height: size, borderRadius: '50%',
        background: `hsl(${hue}, 35%, 28%)`,
        border: `2px solid hsl(${hue}, 45%, 40%)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: size * 0.38, fontWeight: 700, color: '#e8e8f8',
        userSelect: 'none',
      }}>
        {initials}
      </div>
    </div>
  );
}

// ---- Filter Pill (interactive tag) ----
function FilterPill({
  label, genre, onClick, active, color, title: tooltipTitle,
}: {
  label: string;
  genre?: string;
  onClick: () => void;
  active: boolean;
  color?: string;
  title?: string;
}) {
  const [flash, setFlash] = useState(false);

  const GENRE_COLORS: Record<string, string> = {
    'Action': '#ef4444', 'Adventure': '#f97316', 'Comedy': '#eab308',
    'Drama': '#22c55e', 'Fantasy': '#a855f7', 'Romance': '#ec4899',
    'Sci-Fi': '#06b6d4', 'Mystery': '#6366f1', 'Horror': '#dc2626',
    'Slice of Life': '#84cc16', 'Sports': '#14b8a6', 'Supernatural': '#8b5cf6',
    'Music': '#f59e0b', 'Psychological': '#94a3b8', 'Mecha': '#0ea5e9',
  };

  const accent = color ?? (genre && GENRE_COLORS[genre] ? GENRE_COLORS[genre] : null);
  const bg     = active ? (accent ? accent + '33' : '#2a2a58')
                        : (accent ? accent + '15' : '#1e1e38');
  const border = active ? (accent ? accent + '88' : '#5050a0')
                        : (accent ? accent + '44' : '#2a2a50');
  const text   = active ? (accent ?? '#c8c8f8') : (accent ?? '#9090c8');

  function handle() {
    onClick();
    setFlash(true);
    setTimeout(() => setFlash(false), 800);
  }

  return (
    <span
      onClick={handle}
      title={tooltipTitle}
      style={{
        padding: '3px 9px', borderRadius: 10,
        background: flash ? '#1e3a1e' : bg,
        border: `1px solid ${flash ? '#22c55e66' : border}`,
        color: flash ? '#22c55e' : text,
        fontSize: 11, fontWeight: 600, cursor: 'pointer',
        transition: 'all 0.15s', userSelect: 'none',
      }}
    >
      {flash ? '✓ ' : ''}{label}
    </span>
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

      <div>
        <Label>{t('Hops out', lang)} — {hopDepth}</Label>
        <input type="range" min={1} max={3} value={hopDepth}
          onChange={e => setHopDepth(+e.target.value)}
          style={{ width: '100%', accentColor: '#5b9cf6' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#666688' }}>
          <span>1</span><span>2</span><span>3</span>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6 }}>
        <button style={styles.primaryBtn} onClick={onExplore}>
          {t('Show connections', lang)}
        </button>
        {neighborEntries.length > 0 && (
          <button style={styles.ghostBtn} onClick={onClear}>{t('Clear', lang)}</button>
        )}
      </div>

      {neighborEntries.length > 0 && (
        <div style={styles.hopLegend}>
          {[1, 2, 3].map((h, i) => (
            <span key={h} style={styles.hopPill}>
              <span style={{ ...styles.hopDot, background: hopColors[i] }} />
              {h} {t('hop', lang)}
            </span>
          ))}
        </div>
      )}

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
  if (!isMedia) {
    return <div style={styles.hint}>{t('Similar is available for media nodes — click a show or manga to explore.', lang)}</div>;
  }

  // Prefer staff overlap graph for "similar shows" — it encodes shared creators
  const graph: Graph | null = graphStaff && graphStaff.nodeCount > 0
    ? graphStaff
    : graphRelations && graphRelations.nodeCount > 0
      ? graphRelations
      : null;

  if (!graph) {
    return <div style={styles.hint}>{t('Similar items are computed from staff overlap graphs — available after more ingest runs complete.', lang)}</div>;
  }

  const node = graph.nodes.get(selectedId);
  if (!node) {
    return <div style={styles.hint}>{t('No similarity data for this title yet.', lang)}</div>;
  }

  const map = getNeighborhood(graph, selectedId, 1, 0);
  if (map.size === 0) {
    return <div style={styles.hint}>{t('No similar titles found in the graph.', lang)}</div>;
  }

  const similar = [...map.keys()].slice(0, 20).map(id => {
    const se = searchEntries.find((e: any) => e.id === id);
    return {
      id,
      name: se ? (lang === 'jp' ? se.jp : se.en) || se.ro : String(id),
      kind: (se?.kind ?? 'media') as 'media' | 'person',
    };
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
  filterHint: {
    fontSize: 10, color: '#4a6a4a', marginTop: 8, padding: '4px 8px',
    background: '#0e1e0e', border: '1px solid #1a3a1a', borderRadius: 4,
  },
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
  personPhoto: {
    width: '100%', maxHeight: 200, objectFit: 'cover' as const,
    objectPosition: 'top', flexShrink: 0, borderBottom: '1px solid #1a1a2e',
  },
  // Career timeline
  timeline: {
    display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 8,
    scrollbarWidth: 'thin',
  },
  timelineCard: {
    flexShrink: 0, width: 96, cursor: 'pointer',
    display: 'flex', flexDirection: 'column', gap: 4,
  },
  cardCover: {
    position: 'relative', width: 96, height: 135,
    borderRadius: 6, overflow: 'hidden', background: '#1a1a2a',
  },
  cardImg: {
    width: '100%', height: '100%', objectFit: 'cover' as const,
  },
  cardImgPlaceholder: {
    width: '100%', height: '100%',
    background: 'linear-gradient(135deg, #1a1a2a 0%, #2a2a40 100%)',
  },
  cardRoleBadge: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    fontSize: 9, fontWeight: 700, padding: '2px 4px',
    textAlign: 'center' as const, borderTop: '1px solid',
    background: 'rgba(0,0,0,0.7)',
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const,
  },
  cardTitle: {
    fontSize: 11, color: '#c8c8e8', lineHeight: 1.3,
    overflow: 'hidden', display: '-webkit-box',
    WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any,
  },
  cardMeta: {
    display: 'flex', gap: 4, fontSize: 10, color: '#666688', flexWrap: 'wrap' as const,
  },
};

const mobileDrawerStyle: React.CSSProperties = {
  position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 50,
  height: '70vh', background: '#0e0e1a',
  borderTop: '1px solid #1a1a2e', borderRadius: '16px 16px 0 0',
  display: 'flex', flexDirection: 'column', overflow: 'hidden',
  transition: 'transform 0.3s ease',
  boxShadow: '0 -8px 32px rgba(0,0,0,0.6)',
};
