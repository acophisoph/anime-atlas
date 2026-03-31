import React from 'react';
import { useStore } from '../lib/store';

export function MediaFiltersPanel() {
  const filters    = useStore(s => s.mediaFilters);
  const setFilters = useStore(s => s.setMediaFilters);
  const entries    = useStore(s => s.searchEntries);

  // Derive genre list from search entries
  const genreSet = new Set<string>();
  // (in a real build we'd load tag_to_media; here we derive from store)

  return (
    <div style={styles.wrap}>
      <Section label="Media Type">
        <div style={styles.btnGroup}>
          {(['BOTH', 'ANIME', 'MANGA'] as const).map(t => (
            <button key={t}
              style={{ ...styles.btn, ...(filters.mediaType === t ? styles.btnActive : {}) }}
              onClick={() => setFilters({ mediaType: t })}>
              {t === 'BOTH' ? 'Both' : t.charAt(0) + t.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
      </Section>

      <Section label="Year Range">
        <div style={styles.row}>
          <input type="number" placeholder="From" style={styles.numInput}
            value={filters.yearMin ?? ''}
            onChange={e => setFilters({ yearMin: e.target.value ? +e.target.value : null })} />
          <span style={{ color: '#555' }}>–</span>
          <input type="number" placeholder="To" style={styles.numInput}
            value={filters.yearMax ?? ''}
            onChange={e => setFilters({ yearMax: e.target.value ? +e.target.value : null })} />
        </div>
      </Section>

      <Section label="Genres">
        <TagInput
          values={filters.genres}
          placeholder="Add genre…"
          onChange={genres => setFilters({ genres })}
        />
      </Section>

      <Section label="Tags">
        <TagInput
          values={filters.tags}
          placeholder="Add tag…"
          onChange={tags => setFilters({ tags })}
        />
      </Section>

      <button style={styles.resetBtn} onClick={() => setFilters({
        mediaType: 'BOTH', yearMin: null, yearMax: null, genres: [], tags: [], studio: null,
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

function TagInput({ values, placeholder, onChange }: {
  values: string[];
  placeholder: string;
  onChange: (v: string[]) => void;
}) {
  const [input, setInput] = React.useState('');
  function add() {
    const v = input.trim();
    if (v && !values.includes(v)) onChange([...values, v]);
    setInput('');
  }
  return (
    <div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
        <input style={{ ...styles.textInput, flex: 1 }}
          value={input} placeholder={placeholder}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && add()} />
        <button style={styles.addBtn} onClick={add}>+</button>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {values.map(v => (
          <span key={v} style={styles.tag}>
            {v}
            <span style={styles.tagX} onClick={() => onChange(values.filter(x => x !== v))}>×</span>
          </span>
        ))}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: { display: 'flex', flexDirection: 'column', gap: 0 },
  btnGroup: { display: 'flex', gap: 4 },
  btn: {
    flex: 1, padding: '5px 0', borderRadius: 5, border: '1px solid #2a2a40',
    background: 'transparent', color: '#8888a8', cursor: 'pointer', fontSize: 12,
  },
  btnActive: { background: '#2a2a4a', color: '#c8c8f8', borderColor: '#4040a0' },
  row: { display: 'flex', alignItems: 'center', gap: 6 },
  numInput: {
    width: 72, padding: '5px 8px', borderRadius: 5, border: '1px solid #2a2a40',
    background: '#1a1a28', color: '#c8c8e8', fontSize: 12, outline: 'none',
  },
  textInput: {
    padding: '5px 8px', borderRadius: 5, border: '1px solid #2a2a40',
    background: '#1a1a28', color: '#c8c8e8', fontSize: 12, outline: 'none',
  },
  addBtn: {
    padding: '5px 10px', borderRadius: 5, border: '1px solid #2a2a40',
    background: '#2a2a4a', color: '#c8c8f8', cursor: 'pointer', fontSize: 14,
  },
  tag: {
    display: 'flex', alignItems: 'center', gap: 4,
    padding: '2px 8px', borderRadius: 12, background: '#1e1e38',
    border: '1px solid #2a2a50', color: '#9090c8', fontSize: 11,
  },
  tagX: { cursor: 'pointer', color: '#666688', fontWeight: 700 },
  resetBtn: {
    marginTop: 8, width: '100%', padding: '7px 0', borderRadius: 6,
    border: '1px solid #2a2a40', background: 'transparent',
    color: '#8888a8', cursor: 'pointer', fontSize: 12,
  },
};
