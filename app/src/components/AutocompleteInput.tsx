import React, { useRef, useEffect, useState, useCallback } from 'react';
import ReactDOM from 'react-dom';

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
 * The dropdown renders via a portal at document root so it is never clipped
 * by parent overflow:hidden containers (e.g. the LeftPanel sidebar).
 * On empty input, shows the full scrollable list. As the user types, filters
 * and sorts (prefix matches first, then contains matches).
 * The dropdown flips above the input when there is insufficient viewport space below.
 */
export function AutocompleteInput({
  value, onChange, onSelect, options, selected = [],
  placeholder = 'Search…', maxSuggestions = 2000,
}: Props) {
  const [open, setOpen]         = useState(false);
  const [focusIdx, setFocusIdx] = useState(0);
  const [dropRect, setDropRect] = useState<DOMRect | null>(null);
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

  // Recompute anchor position whenever the dropdown opens or window scrolls/resizes
  const updateRect = useCallback(() => {
    if (wrapRef.current) setDropRect(wrapRef.current.getBoundingClientRect());
  }, []);

  useEffect(() => {
    if (!open) return;
    updateRect();
    window.addEventListener('scroll', updateRect, true);
    window.addEventListener('resize', updateRect);
    return () => {
      window.removeEventListener('scroll', updateRect, true);
      window.removeEventListener('resize', updateRect);
    };
  }, [open, updateRect]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        // Also allow clicks inside the portal dropdown
        const portal = document.getElementById('autocomplete-portal');
        if (portal && portal.contains(e.target as Node)) return;
        setOpen(false);
      }
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

  const dropdown = open && suggestions.length > 0 && dropRect
    ? ReactDOM.createPortal(
        <div
          id="autocomplete-portal"
          style={(() => {
            const spaceBelow = window.innerHeight - dropRect.bottom - 4;
            const spaceAbove = dropRect.top - 4;
            const maxH = Math.min(540, window.innerHeight * 0.55);
            const fitsBelow = spaceBelow >= 120;
            return {
              ...css.dropdown,
              position: 'fixed' as const,
              left: dropRect.left,
              width: dropRect.width,
              maxHeight: Math.min(maxH, fitsBelow ? spaceBelow : spaceAbove),
              ...(fitsBelow
                ? { top: dropRect.bottom + 2 }
                : { bottom: window.innerHeight - dropRect.top + 2 }),
            };
          })()}
        >
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
        </div>,
        document.body
      )
    : null;

  return (
    <div ref={wrapRef} style={{ position: 'relative', flex: 1 }}>
      <input
        ref={inputRef}
        style={css.input}
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        onChange={e => { onChange(e.target.value); setOpen(true); setFocusIdx(0); }}
        onFocus={() => { setOpen(true); updateRect(); }}
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
      {dropdown}
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
    zIndex: 9999,
    background: '#12121e', border: '1px solid #2a2a50', borderRadius: 6,
    overflowX: 'hidden', overflowY: 'auto',
    boxShadow: '0 6px 20px rgba(0,0,0,0.7)',
  },
  item: {
    padding: '6px 10px', fontSize: 12, color: '#b0b0d0',
    cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
  },
  itemHover: { background: '#1e1e3a', color: '#e8e8ff' },
};
