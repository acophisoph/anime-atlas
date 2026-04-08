import React, { useState, useEffect } from 'react';
import { useStore } from '../lib/store';
import { getTagToMedia, getGenreToMedia } from '../lib/data-loader';
import { AutocompleteInput } from './AutocompleteInput';

// Fixed AniList genre list with JP translations.
// Tags are English-only (AniList API doesn't expose native-language tag names).
const GENRES_EN = [
  'Action', 'Adventure', 'Comedy', 'Drama', 'Ecchi', 'Fantasy',
  'Hentai', 'Horror', 'Mahou Shoujo', 'Mecha', 'Music', 'Mystery',
  'Psychological', 'Romance', 'Sci-Fi', 'Slice of Life', 'Sports',
  'Supernatural', 'Thriller',
];
const GENRE_JP: Record<string, string> = {
  'Action': 'アクション', 'Adventure': 'アドベンチャー', 'Comedy': 'コメディ',
  'Drama': 'ドラマ', 'Ecchi': 'エッチ', 'Fantasy': 'ファンタジー',
  'Hentai': 'ヘンタイ', 'Horror': 'ホラー', 'Mahou Shoujo': '魔法少女',
  'Mecha': 'メカ', 'Music': '音楽', 'Mystery': 'ミステリー',
  'Psychological': '心理', 'Romance': 'ロマンス', 'Sci-Fi': 'SF',
  'Slice of Life': '日常', 'Sports': 'スポーツ',
  'Supernatural': '超自然', 'Thriller': 'スリラー',
};

export function MediaFiltersPanel() {
  const filters    = useStore(s => s.mediaFilters);
  const setFilters = useStore(s => s.setMediaFilters);
  const lang       = useStore(s => s.lang);

  const [genreInput, setGenreInput] = useState('');
  const [tagInput,   setTagInput]   = useState('');
  const [tagOptions, setTagOptions] = useState<string[]>([]);

  // Load tag names once
  useEffect(() => {
    getTagToMedia().then(m => setTagOptions(Object.keys(m).sort())).catch(() => {});
  }, []);

  // Display genre names in selected lang; stored value is always EN
  const genreOptions = lang === 'jp'
    ? GENRES_EN.map(g => GENRE_JP[g] || g)
    : GENRES_EN;

  // Convert stored EN genre to display name
  function genreDisplay(en: string) {
    return lang === 'jp' ? (GENRE_JP[en] || en) : en;
  }
  // Convert display name back to EN for storage
  function genreToEN(display: string): string {
    if (lang === 'jp') {
      return GENRES_EN.find(g => GENRE_JP[g] === display) ?? display;
    }
    return display;
  }

  return (
    <div style={s.wrap}>
      {/* Media Type */}
      <Section label="Media Type">
        <div style={s.btnGroup}>
          {(['BOTH', 'ANIME', 'MANGA'] as const).map(t => (
            <button key={t}
              style={{ ...s.btn, ...(filters.mediaType === t ? s.btnActive : {}) }}
              onClick={() => setFilters({ mediaType: t })}>
              {t === 'BOTH' ? 'Both' : t.charAt(0) + t.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
      </Section>

      {/* NSFW */}
      <Section label="Content">
        <label style={s.toggle}>
          <span style={s.toggleLabel}>Show NSFW (18+)</span>
          <div style={{ ...s.toggleTrack, ...(filters.showNSFW ? s.toggleTrackOn : {}) }}
            onClick={() => setFilters({ showNSFW: !filters.showNSFW })}>
            <div style={{ ...s.toggleThumb, ...(filters.showNSFW ? s.toggleThumbOn : {}) }} />
          </div>
        </label>
      </Section>

      {/* Year Range */}
      <Section label="Year Range">
        <div style={s.row}>
          <input type="number" placeholder="From" style={s.numInput}
            value={filters.yearMin ?? ''}
            onChange={e => setFilters({ yearMin: e.target.value ? +e.target.value : null })} />
          <span style={{ color: '#555' }}>–</span>
          <input type="number" placeholder="To" style={s.numInput}
            value={filters.yearMax ?? ''}
            onChange={e => setFilters({ yearMax: e.target.value ? +e.target.value : null })} />
        </div>
      </Section>

      {/* Genres */}
      <Section label={lang === 'jp' ? 'ジャンル' : 'Genres'}>
        <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
          <AutocompleteInput
            value={genreInput}
            onChange={setGenreInput}
            onSelect={display => {
              const en = genreToEN(display);
              if (!filters.genres.includes(en)) setFilters({ genres: [...filters.genres, en] });
              setGenreInput('');
            }}
            options={genreOptions}
            selected={filters.genres.map(genreDisplay)}
            placeholder={lang === 'jp' ? 'ジャンルを追加…' : 'Add genre…'}
          />
        </div>
        <div style={s.chips}>
          {filters.genres.map(g => (
            <Chip key={g} label={genreDisplay(g)}
              onRemove={() => setFilters({ genres: filters.genres.filter(x => x !== g) })} />
          ))}
        </div>
      </Section>

      {/* Tags */}
      <Section label={lang === 'jp' ? 'タグ' : 'Tags'}>
        <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
          <AutocompleteInput
            value={tagInput}
            onChange={setTagInput}
            onSelect={tag => {
              if (!filters.tags.includes(tag)) setFilters({ tags: [...filters.tags, tag] });
              setTagInput('');
            }}
            options={tagOptions}
            selected={filters.tags}
            placeholder={lang === 'jp' ? 'タグを追加…' : 'Add tag…'}
          />
        </div>
        <div style={s.chips}>
          {filters.tags.map(t => (
            <Chip key={t} label={t}
              onRemove={() => setFilters({ tags: filters.tags.filter(x => x !== t) })} />
          ))}
        </div>
      </Section>

      <button style={s.resetBtn} onClick={() => setFilters({
        mediaType: 'BOTH', yearMin: null, yearMax: null,
        genres: [], tags: [], studio: null, showNSFW: false,
      })}>Reset Filters</button>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#6666a0',
        textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  );
}

function Chip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span style={s.chip}>
      {label}
      <span style={s.chipX} onClick={onRemove}>×</span>
    </span>
  );
}

const s: Record<string, React.CSSProperties> = {
  wrap:       { display: 'flex', flexDirection: 'column', gap: 0 },
  btnGroup:   { display: 'flex', gap: 4 },
  btn: {
    flex: 1, padding: '5px 0', borderRadius: 5, border: '1px solid #2a2a40',
    background: 'transparent', color: '#8888a8', cursor: 'pointer', fontSize: 12,
  },
  btnActive:  { background: '#2a2a4a', color: '#c8c8f8', borderColor: '#4040a0' },
  row:        { display: 'flex', alignItems: 'center', gap: 6 },
  numInput: {
    width: 72, padding: '5px 8px', borderRadius: 5, border: '1px solid #2a2a40',
    background: '#1a1a28', color: '#c8c8e8', fontSize: 12, outline: 'none',
  },
  chips: { display: 'flex', flexWrap: 'wrap', gap: 4 },
  chip: {
    display: 'flex', alignItems: 'center', gap: 4, padding: '2px 8px',
    borderRadius: 12, background: '#1e1e38', border: '1px solid #2a2a50',
    color: '#9090c8', fontSize: 11,
  },
  chipX:      { cursor: 'pointer', color: '#666688', fontWeight: 700 },
  resetBtn: {
    marginTop: 8, width: '100%', padding: '7px 0', borderRadius: 6,
    border: '1px solid #2a2a40', background: 'transparent',
    color: '#8888a8', cursor: 'pointer', fontSize: 12,
  },
  // Toggle switch
  toggle:     { display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' },
  toggleLabel:{ fontSize: 12, color: '#9090b8' },
  toggleTrack:{
    width: 32, height: 18, borderRadius: 9, background: '#2a2a40',
    position: 'relative', transition: 'background 0.2s', cursor: 'pointer', flexShrink: 0,
  },
  toggleTrackOn: { background: '#4040a0' },
  toggleThumb:{
    position: 'absolute', top: 2, left: 2, width: 14, height: 14,
    borderRadius: '50%', background: '#6666a0', transition: 'left 0.2s, background 0.2s',
  },
  toggleThumbOn: { left: 16, background: '#a0a0ff' },
};
