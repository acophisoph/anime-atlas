import React, { useState, useCallback } from 'react';
import { useStore } from '../lib/store';
import { t } from '../lib/i18n';
import { useIsMobile } from '../lib/use-is-mobile';
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
  const mediaFilters = useStore(s => s.mediaFilters);
  const leftPanelOpen = useStore(s => s.leftPanelOpen);
  const setLeftPanelOpen = useStore(s => s.setLeftPanelOpen);
  const [focused, setFocused] = useState(false);
  const isMobile = useIsMobile();

  const handleSearch = useCallback((q: string) => {
    setQuery(q);
    if (!q.trim()) { setResults([]); return; }
    const lower = q.toLowerCase();
    const showNSFW = mediaFilters.showNSFW;
    const hits = entries.filter(e => {
      if (!showNSFW && e.kind === "media") {
        if (e.isAdult) return false;
        if (e.genres?.split(",").includes("Hentai")) return false;
      }
      return (
        e.en.toLowerCase().includes(lower) ||
        e.jp.toLowerCase().includes(lower) ||
        e.ro.toLowerCase().includes(lower)
      );
    }).slice(0, 20);
    setResults(hits);
  }, [entries, mediaFilters.showNSFW, setQuery, setResults]);

  function pickResult(entry: SearchEntry) {
    setSelected(entry.id, entry.kind);
    setQuery('');
    setResults([]);
  }

  function displayName(e: SearchEntry) {
    return lang === 'jp' ? (e.jp || e.en) : (e.en || e.ro);
  }

  if (isMobile) {
    return (
      <header style={mobileStyles.header}>
        {/* Row 1: hamburger + brand + mode buttons + lang */}
        <div style={mobileStyles.row1}>
          <button
            style={mobileStyles.hamburger}
            onClick={() => setLeftPanelOpen(!leftPanelOpen)}
            aria-label="Toggle filters"
          >
            {leftPanelOpen ? '✕' : '☰'}
          </button>
          <span style={mobileStyles.title}>{t('Anime Atlas', lang)}</span>
          <div style={mobileStyles.modeGroup}>
            <button
              style={{ ...mobileStyles.modeBtn, ...(mode === 'media' ? mobileStyles.modeBtnActive : {}) }}
              onClick={() => setMode('media')}
            >{t('Media', lang)}</button>
            <button
              style={{ ...mobileStyles.modeBtn, ...(mode === 'people' ? mobileStyles.modeBtnActive : {}) }}
              onClick={() => setMode('people')}
            >{t('People', lang)}</button>
            <button
              style={{ ...mobileStyles.modeBtn, ...(mode === 'season' ? mobileStyles.modeBtnActive : {}), ...mobileStyles.modeBtnSeason }}
              onClick={() => setMode('season')}
            >{t('Season', lang)}</button>
          </div>
          <div style={mobileStyles.langGroup}>
            <button style={{ ...mobileStyles.langBtn, ...(lang === 'en' ? mobileStyles.langBtnActive : {}) }}
              onClick={() => setLang('en')}>EN</button>
            <button style={{ ...mobileStyles.langBtn, ...(lang === 'jp' ? mobileStyles.langBtnActive : {}) }}
              onClick={() => setLang('jp')}>JP</button>
          </div>
        </div>
        {/* Row 2: search bar */}
        <div style={mobileStyles.row2}>
          <div style={mobileStyles.searchWrap}>
            <input
              style={mobileStyles.searchInput}
              placeholder={mode === 'media' ? t('Search anime / manga…', lang) : t('Search staff / VA…', lang)}
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
        </div>
      </header>
    );
  }

  return (
    <header style={styles.header}>
      <div style={styles.brand}>
        <span style={styles.logo}>⚛️</span>
        <span style={styles.title}>{t('Anime Atlas', lang)}</span>
      </div>

      <div style={styles.modeGroup}>
        <button
          style={{ ...styles.modeBtn, ...(mode === 'media' ? styles.modeBtnActive : {}) }}
          onClick={() => setMode('media')}
        >{t('Media', lang)}</button>
        <button
          style={{ ...styles.modeBtn, ...(mode === 'people' ? styles.modeBtnActive : {}) }}
          onClick={() => setMode('people')}
        >{t('People', lang)}</button>
        <button
          style={{ ...styles.modeBtn, ...(mode === 'season' ? styles.modeBtnActive : {}), ...styles.modeBtnSeason }}
          onClick={() => setMode('season')}
        >{t('Season', lang)}</button>
      </div>

      <div style={styles.searchWrap}>
        <input
          style={styles.searchInput}
          placeholder={mode === 'media' ? t('Search anime / manga…', lang) : t('Search staff / VA…', lang)}
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
  modeBtnActive:  { background: '#2a2a4a', color: '#c8c8f8', borderColor: '#5050a0' },
  modeBtnSeason:  { borderColor: '#3a3a20', color: '#c8b860' },
  searchWrap: { flex: 1, position: 'relative', maxWidth: 400 },
  searchInput: {
    width: '100%', padding: '7px 12px', borderRadius: 8, border: '1px solid #333344',
    background: '#1a1a28', color: '#e8e8f8', fontSize: 14, outline: 'none',
    boxSizing: 'border-box',
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

const mobileStyles: Record<string, React.CSSProperties> = {
  header: {
    display: 'flex', flexDirection: 'column',
    background: '#111118', borderBottom: '1px solid #222230',
    flexShrink: 0, zIndex: 20, padding: '6px 10px 6px',
  },
  row1: {
    display: 'flex', alignItems: 'center', gap: 8, minHeight: 40,
  },
  row2: {
    paddingTop: 6,
  },
  hamburger: {
    background: 'transparent', border: '1px solid #333344', borderRadius: 6,
    color: '#c8c8f8', cursor: 'pointer', fontSize: 16,
    width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  title: { fontWeight: 700, fontSize: 15, color: '#e8e8f8', letterSpacing: '-0.5px', flexShrink: 0 },
  modeGroup: { display: 'flex', gap: 3, flex: 1, justifyContent: 'center' },
  modeBtn: {
    padding: '4px 8px', borderRadius: 6, border: '1px solid #333344',
    background: 'transparent', color: '#9090b0', cursor: 'pointer', fontSize: 11,
  },
  modeBtnActive: { background: '#2a2a4a', color: '#c8c8f8', borderColor: '#5050a0' },
  modeBtnSeason: { borderColor: '#3a3a20', color: '#c8b860' },
  langGroup: { display: 'flex', gap: 2, flexShrink: 0 },
  langBtn: {
    padding: '3px 6px', borderRadius: 4, border: '1px solid #333344',
    background: 'transparent', color: '#9090b0', cursor: 'pointer', fontSize: 11,
  },
  langBtnActive: { background: '#2a2a4a', color: '#c8c8f8' },
  searchWrap: { position: 'relative', width: '100%' },
  searchInput: {
    width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #333344',
    background: '#1a1a28', color: '#e8e8f8', fontSize: 14, outline: 'none',
    boxSizing: 'border-box',
  },
};
