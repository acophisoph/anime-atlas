import React, { useEffect, useState, useMemo } from 'react';
import { useStore } from '../lib/store';
import { loadSeasonData, loadMediaMeta } from '../lib/data-loader';
import { t, translateGenre } from '../lib/i18n';
import type { SeasonData, SeasonMediaEntry, MediaMeta } from '../types';

// Current season based on system clock
function currentSeason(): { year: number; season: 'WINTER' | 'SPRING' | 'SUMMER' | 'FALL' } {
  const now = new Date();
  const m = now.getMonth() + 1;
  const season = m <= 3 ? 'WINTER' : m <= 6 ? 'SPRING' : m <= 9 ? 'SUMMER' : 'FALL';
  return { year: now.getFullYear(), season };
}

// Animation-related role check for Sakugabooru link
const ANIMATION_ROLES = new Set([
  'Key Animation', 'Animation Director', 'Chief Animation Director',
  'In-Between Animation', 'Episode Director', 'Director', 'Series Director',
  'Storyboard',
]);

export function SeasonView() {
  const lang          = useStore(s => s.lang);
  const searchEntries = useStore(s => s.searchEntries);
  const points        = useStore(s => s.points);
  const setMode       = useStore(s => s.setMode);
  const setSelected   = useStore(s => s.setSelected);

  const [seasonData,  setSeasonData]  = useState<SeasonData | null>(null);
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
    loadSeasonData()
      .then(d => { setSeasonData(d); setLoadingData(false); })
      .catch(() => { setSeasonData(null); setLoadingData(false); });
  }, []);

  // Build a popularity map from points
  const popMap = useMemo(() => {
    const m = new Map<number, number>();
    for (const p of points) m.set(p.id, p.popularity);
    return m;
  }, [points]);

  // Resolve media IDs to display: prefer season_current.json, fall back to searchEntries
  const ids: number[] = useMemo(() => {
    if (seasonData) {
      return [...seasonData.media]
        .sort((a, b) => (popMap.get(b.id) ?? 0) - (popMap.get(a.id) ?? 0))
        .map(m => m.id);
    }
    const { year } = currentSeason();
    return searchEntries
      .filter(e => e.kind === 'media' && e.type === 'ANIME' && e.year && e.year >= year - 1)
      .sort((a, b) => (popMap.get(b.id) ?? 0) - (popMap.get(a.id) ?? 0))
      .slice(0, 48)
      .map(e => e.id);
  }, [seasonData, searchEntries, popMap]);

  const pedigreeMap = useMemo(() => {
    const m = new Map<number, SeasonMediaEntry['pedigree']>();
    for (const se of seasonData?.media ?? []) m.set(se.id, se.pedigree);
    return m;
  }, [seasonData]);

  const { year, season } = seasonData ?? currentSeason();
  const seasonLabel = seasonData
    ? `${t(season, lang)} ${year}`
    : t('Recent Anime', lang);

  function selectMedia(id: number) {
    setMode('media');
    setSelected(id, 'media');
  }

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.topBar}>
        <span style={styles.seasonTitle}>📅 {seasonLabel}</span>
        {loadingData && (
          <span style={styles.loadingNote}>{t('Loading season data…', lang)}</span>
        )}
        {!loadingData && !seasonData && (
          <span style={styles.loadingNote}>{t('Showing recent anime', lang)}</span>
        )}
      </div>

      {/* Grid */}
      {ids.length === 0 && !loadingData ? (
        <div style={styles.empty}>{t('No seasonal data found.', lang)}</div>
      ) : (
        <div style={styles.grid}>
          {ids.map(id => (
            <SeasonCard
              key={id}
              id={id}
              pedigree={pedigreeMap.get(id) ?? []}
              lang={lang}
              onSelect={() => selectMedia(id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---- Individual season card ----
function SeasonCard({
  id, pedigree, lang, onSelect,
}: {
  id: number;
  pedigree: SeasonMediaEntry['pedigree'];
  lang: string;
  onSelect: () => void;
}) {
  const [meta, setMeta] = useState<MediaMeta | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadMediaMeta(id).then(m => { if (!cancelled) setMeta(m); }).catch(() => {});
    return () => { cancelled = true; };
  }, [id]);

  const title = !meta ? '…'
    : (lang === 'jp' ? meta.title?.native : meta.title?.english)
      || meta.title?.romaji
      || String(id);

  const genres = meta?.genres?.slice(0, 2) ?? [];
  const studio = meta?.studios?.find(s => s.isAnimationStudio)?.name ?? null;
  const score  = meta?.averageScore ?? null;
  const cover  = meta?.coverImage?.large ?? null;

  return (
    <div style={styles.card} onClick={onSelect} title={title}>
      {/* Cover */}
      <div style={styles.coverWrap}>
        {cover
          ? <img src={cover} alt={title} style={styles.coverImg} />
          : <div style={styles.coverPlaceholder}><span style={{ fontSize: 32 }}>🎬</span></div>}
        {score && (
          <div style={styles.scoreBadge}>⭐ {score}%</div>
        )}
      </div>

      {/* Body */}
      <div style={styles.cardBody}>
        <div style={styles.cardTitle}>{title}</div>

        {genres.length > 0 && (
          <div style={styles.genreRow}>
            {genres.map(g => (
              <span key={g} style={styles.genrePill}>{translateGenre(g, lang)}</span>
            ))}
          </div>
        )}

        {studio && (
          <div style={styles.studioRow}>
            <span style={styles.studioLabel}>{studio}</span>
          </div>
        )}

        {/* Staff pedigree */}
        {pedigree.slice(0, 2).map((p, i) => (
          <div key={i} style={styles.pedigreeRow}>
            <span style={styles.pedigreeRole}>{p.role}</span>
            <span style={styles.pedigreeName}>{p.name}</span>
            <span style={styles.pedigreeWork}>
              {t('Known for', lang)}: {p.notableWork}
              {p.notableWorkScore ? ` (${p.notableWorkScore}%)` : ''}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: '100%', height: '100%', overflowY: 'auto',
    background: '#07070f', padding: 20,
    scrollbarWidth: 'thin',
  },
  topBar: {
    display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20,
    borderBottom: '1px solid #1a1a2e', paddingBottom: 12,
  },
  seasonTitle: {
    fontSize: 22, fontWeight: 700, color: '#e8e8f8', letterSpacing: '-0.5px',
  },
  loadingNote: {
    fontSize: 12, color: '#555577',
  },
  empty: {
    color: '#444466', fontSize: 14, textAlign: 'center', marginTop: 60,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
    gap: 16,
  },
  card: {
    background: '#111118', borderRadius: 8, overflow: 'hidden',
    border: '1px solid #1a1a2e', cursor: 'pointer',
    transition: 'transform 0.15s, border-color 0.15s',
    display: 'flex', flexDirection: 'column',
  },
  coverWrap: {
    position: 'relative', width: '100%', paddingTop: '140%', flexShrink: 0,
  },
  coverImg: {
    position: 'absolute', inset: 0, width: '100%', height: '100%',
    objectFit: 'cover' as const,
  },
  coverPlaceholder: {
    position: 'absolute', inset: 0, display: 'flex',
    alignItems: 'center', justifyContent: 'center',
    background: '#1a1a2a',
  },
  scoreBadge: {
    position: 'absolute', bottom: 6, right: 6,
    background: 'rgba(0,0,0,0.75)', borderRadius: 6, padding: '2px 6px',
    fontSize: 11, color: '#fbbf24', fontWeight: 600,
  },
  cardBody: {
    padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 4, flex: 1,
  },
  cardTitle: {
    fontSize: 12, fontWeight: 600, color: '#e8e8f8', lineHeight: 1.35,
    overflow: 'hidden', display: '-webkit-box',
    WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any,
  },
  genreRow: { display: 'flex', flexWrap: 'wrap', gap: 3 },
  genrePill: {
    fontSize: 10, padding: '1px 6px', borderRadius: 8,
    background: '#1e1e38', color: '#8888c8', border: '1px solid #2a2a50',
  },
  studioRow: { marginTop: 1 },
  studioLabel: { fontSize: 10, color: '#555577' },
  pedigreeRow: {
    display: 'flex', flexDirection: 'column', gap: 1,
    padding: '4px 0', borderTop: '1px solid #0e0e1a',
  },
  pedigreeRole: {
    fontSize: 9, color: '#5b9cf6', fontWeight: 700,
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  pedigreeName: { fontSize: 11, color: '#c8c8e8', fontWeight: 600 },
  pedigreeWork: { fontSize: 10, color: '#666688', lineHeight: 1.3 },
};
