import React, { useState, useEffect } from 'react';
import { useStore } from '../lib/store';
import { getRoleToPeople } from '../lib/data-loader';
import { AutocompleteInput } from './AutocompleteInput';

export function PeopleFiltersPanel() {
  const filters    = useStore(s => s.peopleFilters);
  const setFilters = useStore(s => s.setPeopleFilters);
  const [roleInput,   setRoleInput]   = useState('');
  const [roleOptions, setRoleOptions] = useState<string[]>([]);

  useEffect(() => {
    getRoleToPeople()
      .then(m => setRoleOptions(Object.keys(m).sort()))
      .catch(() => {});
  }, []);

  return (
    <div style={s.wrap}>
      <Section label="Voice Actors">
        <label style={s.checkLabel}>
          <input type="checkbox" checked={filters.includeVA}
            onChange={e => setFilters({ includeVA: e.target.checked })} />
          Include Voice Actors
        </label>
      </Section>

      <Section label="Roles">
        <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
          <AutocompleteInput
            value={roleInput}
            onChange={setRoleInput}
            onSelect={role => {
              if (!filters.roles.includes(role)) setFilters({ roles: [...filters.roles, role] });
              setRoleInput('');
            }}
            options={roleOptions}
            selected={filters.roles}
            placeholder="e.g. Director…"
          />
        </div>
        <div style={s.chips}>
          {filters.roles.map(r => (
            <span key={r} style={s.chip}>
              {r}
              <span style={s.chipX}
                onClick={() => setFilters({ roles: filters.roles.filter(x => x !== r) })}>×</span>
            </span>
          ))}
        </div>
      </Section>

      <button style={s.resetBtn}
        onClick={() => setFilters({ includeVA: true, roles: [], studio: null })}>
        Reset Filters
      </button>
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

const s: Record<string, React.CSSProperties> = {
  wrap:       { display: 'flex', flexDirection: 'column' },
  checkLabel: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#c8c8e8', cursor: 'pointer' },
  chips:      { display: 'flex', flexWrap: 'wrap', gap: 4 },
  chip: {
    display: 'flex', alignItems: 'center', gap: 4, padding: '2px 8px',
    borderRadius: 12, background: '#1e1e38', border: '1px solid #2a2a50',
    color: '#9090c8', fontSize: 11,
  },
  chipX:   { cursor: 'pointer', color: '#666688', fontWeight: 700 },
  resetBtn: {
    marginTop: 8, width: '100%', padding: '7px 0', borderRadius: 6,
    border: '1px solid #2a2a40', background: 'transparent',
    color: '#8888a8', cursor: 'pointer', fontSize: 12,
  },
};
