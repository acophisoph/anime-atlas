import React, { useRef, useEffect, useState } from 'react';

interface Props {
  value: string;
  onChange: (v: string) => void;
  onSelect: (v: string) => void;
  options: string[];
  selected?: string[];
  placeholder?: string;
  maxSuggestions?: number;
}

/**
 * Autocomplete text input with keyboard navigation and match highlighting.
 * On empty input, shows top options. As the user types, filters and sorts
 * (prefix matches first, then contains matches).
 */
export function AutocompleteInput({
  value, onChange, onSelect, options, selected = [],
  placeholder = 'Search…', maxSuggestions = 8,
}: Props) {
  const [open, setOpen]           = useState(false);
  const [focusIdx, setFocusIdx]   = useState(0);
  const wrapRef  = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const q = value.toLowerCase().trim();

  const suggestions = (() => {
    const pool = options.filter(o => !selected.includes(o));
    if (!q) return pool.slice(0, maxSuggestions);
    return pool
      .filter(o => o.toLowerCase().includes(q))
      .sort((a, b) => {
        const sa = a.toLowerCase().startsWith(q) ? 0 : 1;
        const sb = b.toLowerCase().startsWith(q) ? 0 : 1;
        return sa - sb;
      })
      .slice(0, maxSuggestions);
  })();

  useEffect(() => { setFocusIdx(0); }, [suggestions.length]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  function pick(v: string) {
    onSelect(v);
    onChange('');
    setOpen(false);
    inputRef.current?.focus();
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative', flex: 1 }}>
      <input
        ref={inputRef}
        style={css.input}
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        onChange={e => { onChange(e.target.value); setOpen(true); setFocusIdx(0); }}
        onFocus={() => setOpen(true)}
        onKeyDown={e => {
          if (e.key === 'ArrowDown')  { e.preventDefault(); setFocusIdx(i => Math.min(i + 1, suggestions.length - 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setFocusIdx(i => Math.max(i - 1, 0)); }
          else if (e.key === 'Enter') {
            e.preventDefault();
            if (open && suggestions.length > 0) pick(suggestions[focusIdx]);
            else if (value.trim()) { onSelect(value.trim()); onChange(''); setOpen(false); }
          }
          else if (e.key === 'Escape') setOpen(false);
        }}
      />
      {open && suggestions.length > 0 && (
        <div style={css.dropdown}>
          {suggestions.map((s, i) => (
            <div
              key={s}
              style={{ ...css.item, ...(i === focusIdx ? css.itemHover : {}) }}
              onMouseEnter={() => setFocusIdx(i)}
              onMouseDown={e => { e.preventDefault(); pick(s); }}
            >
              {highlight(s, q)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function highlight(text: string, q: string) {
  if (!q) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(q);
  if (idx < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <span style={{ color: '#a0a0ff', fontWeight: 700 }}>{text.slice(idx, idx + q.length)}</span>
      {text.slice(idx + q.length)}
    </>
  );
}

const css: Record<string, React.CSSProperties> = {
  input: {
    width: '100%', padding: '5px 8px', borderRadius: 5,
    border: '1px solid #2a2a40', background: '#1a1a28',
    color: '#c8c8e8', fontSize: 12, outline: 'none', boxSizing: 'border-box',
  },
  dropdown: {
    position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200,
    background: '#12121e', border: '1px solid #2a2a50', borderRadius: 6,
    marginTop: 2, overflow: 'hidden', boxShadow: '0 6px 20px rgba(0,0,0,0.7)',
    maxHeight: 240, overflowY: 'auto',
  },
  item: {
    padding: '6px 10px', fontSize: 12, color: '#b0b0d0',
    cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
  },
  itemHover: { background: '#1e1e3a', color: '#e8e8ff' },
};
