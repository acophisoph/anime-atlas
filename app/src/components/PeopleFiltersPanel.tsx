import React from 'react';
import { useStore } from '../lib/store';

export function PeopleFiltersPanel() {
  const filters    = useStore(s => s.peopleFilters);
  const setFilters = useStore(s => s.setPeopleFilters);

  return (
    <div style={styles.wrap}>
      <Section label="Voice Actors">
        <label style={styles.checkLabel}>
          <input type="checkbox" checked={filters.includeVA}
            onChange={e => setFilters({ includeVA: e.target.checked })} />
          Include Voice Actors
        </label>
      </Section>

      <Section label="Roles">
        <TagInput
          values={filters.roles}
          placeholder="e.g. Director…"
          onChange={roles => setFilters({ roles })}
        />
      </Section>

      <button style={styles.resetBtn} onClick={() => setFilters({
        includeVA: true, roles: [], studio: null,
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
  values: string[]; placeholder: string; onChange: (v: string[]) => void;
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
        <input style={{ ...styles.textInput, flex: 1 }} value={input} placeholder={placeholder}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && add()} />
        <button style={styles.addBtn} onClick={add}>+</button>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {values.map(v => (
          <span key={v} style={styles.tag}>
            {v}<span style={styles.tagX} onClick={() => onChange(values.filter(x => x !== v))}>×</span>
          </span>
        ))}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: { display: 'flex', flexDirection: 'column' },
  checkLabel: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#c8c8e8', cursor: 'pointer' },
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
