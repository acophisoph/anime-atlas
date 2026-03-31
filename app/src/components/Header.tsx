import React, { useState, useCallback } from 'react';
import { useStore } from '../lib/store';
import type { SearchEntry } from '../types';

export function Header() {
  const mode    = useStore(s => s.mode);
  const lang    = useStore(s => s.lang);
  const setMode = useStore(s => s.setMode);
  const setLang = useStore(s => s.setLang);
  const query   = useStore(s => s.searchQuery);
  const results = useStore(s => s.searchResults);
  const entries = useStore(s => s.searchEntries);
  const setQuery   = useStore(s => s.setSearchQuery);
  const setResults = useStore(s => s.setSearchResults);
  const setSelected = useStore(s => s.setSelected);
  const [focused, setFocused] = useState(false);

  const handleSearch = useCallback((q: string) => {
    setQuery(q);
    if (!q.trim()) { setResults([]); return; }
    const lower = q.toLowerCase();
    const hits = entries.filter(e =>
      e.en.toLowerCase().includes(lower) ||
      e.jp.toLowerCase().includes(lower) ||
      e.ro.toLowerCase().includes(lower)
    ).slice(0, 20);
    setResults(hits);
  }, [entries, setQuery, setResults]);

  function pickResult(entry: SearchEntry) {
    setSelected(entry.id, entry.kind);
    setQuery('');
    setResults([]);
  }

  function displayName(e: SearchEntry) {
    return lang === 'jp' ? (e.jp || e.en) : (e.en || e.ro);
  }

  return (
    <header style={styles.header}>
      <div style={styles.brand}>
        <span style={styles.logo}>⚛️</span>
        <span style={styles.title}>Anime Atlas</span>
      </div>

      <div style={styles.modeGroup}>
        <button
          style={{ ...styles.modeBtn, ...(mode === 'media' ? styles.modeBtnActive : {}) }}
          onClick={() => setMode('media')}
        >Media</button>
        <button
          style={{ ...styles.modeBtn, ...(mode === 'people' ? styles.modeBtnActive : {}) }}
          onClick={() => setMode('people')}
        >People</button>
      </div>

      <div style={styles.searchWrap}>
        <input
          style={styles.searchInput}
          placeholder={mode === 'media' ? 'Search anime / manga…' : 'Search staff / VA…'}
          value={query}
          onChange={e => handleSearch(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
        />
        {focused && results.length > 0 && (
          <div style={styles.dropdown}>
            {results.map(r => (
              <div key={r.id} style={styles.dropdownItem} onMouseDown={() => pickResult(r)}>
                <span style={styles.dropdownKind}>{r.kind === 'media' ? '🎬' : '👤'}</span>
                <span>{displayName(r)}</span>
                {r.year && <span style={styles.dropdownYear}>{r.year}</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={styles.langGroup}>
        <button style={{ ...styles.langBtn, ...(lang === 'en' ? styles.langBtnActive : {}) }}
          onClick={() => setLang('en')}>EN</button>
        <button style={{ ...styles.langBtn, ...(lang === 'jp' ? styles.langBtnActive : {}) }}
          onClick={() => setLang('jp')}>JP</button>
      </div>
    </header>
  );
}

const styles: Record<string, React.CSSProperties> = {
  header: {
    display: 'flex', alignItems: 'center', gap: 16,
    padding: '0 16px', height: 52, background: '#111118',
    borderBottom: '1px solid #222230', flexShrink: 0, zIndex: 10,
  },
  brand: { display: 'flex', alignItems: 'center', gap: 8 },
  logo: { fontSize: 22 },
  title: { fontWeight: 700, fontSize: 18, color: '#e8e8f8', letterSpacing: '-0.5px' },
  modeGroup: { display: 'flex', gap: 4 },
  modeBtn: {
    padding: '5px 14px', borderRadius: 6, border: '1px solid #333344',
    background: 'transparent', color: '#9090b0', cursor: 'pointer', fontSize: 13,
    transition: 'all 0.15s',
  },
  modeBtnActive: { background: '#2a2a4a', color: '#c8c8f8', borderColor: '#5050a0' },
  searchWrap: { flex: 1, position: 'relative', maxWidth: 400 },
  searchInput: {
    width: '100%', padding: '7px 12px', borderRadius: 8, border: '1px solid #333344',
    background: '#1a1a28', color: '#e8e8f8', fontSize: 14, outline: 'none',
  },
  dropdown: {
    position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4,
    background: '#1a1a28', border: '1px solid #333344', borderRadius: 8,
    boxShadow: '0 8px 24px rgba(0,0,0,0.5)', zIndex: 100, overflow: 'hidden',
  },
  dropdownItem: {
    padding: '8px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center',
    gap: 8, fontSize: 13, color: '#c8c8e8',
    transition: 'background 0.1s',
  },
  dropdownKind: { fontSize: 14 },
  dropdownYear: { marginLeft: 'auto', color: '#666680', fontSize: 11 },
  langGroup: { display: 'flex', gap: 2 },
  langBtn: {
    padding: '4px 8px', borderRadius: 4, border: '1px solid #333344',
    background: 'transparent', color: '#9090b0', cursor: 'pointer', fontSize: 12,
  },
  langBtnActive: { background: '#2a2a4a', color: '#c8c8f8' },
};
