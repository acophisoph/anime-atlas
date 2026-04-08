import React, { useState, useEffect, useCallback } from 'react';
import { useStore } from '../lib/store';
import { getRoleToPeople, getTagToMedia } from '../lib/data-loader';
import { AutocompleteInput } from './AutocompleteInput';
import type { TalentResult } from '../types';

export function TalentFinder() {
  const query       = useStore(s => s.talentQuery);
  const results     = useStore(s => s.talentResults);
  const setQuery    = useStore(s => s.setTalentQuery);
  const setResults  = useStore(s => s.setTalentResults);
  const setSelected = useStore(s => s.setSelected);
  const entries     = useStore(s => s.searchEntries);

  const [roleInput, setRoleInput] = useState('');
  const [tagInput,  setTagInput]  = useState('');
  const [loading, setLoading]     = useState(false);
  const [roleOptions, setRoleOptions] = useState<string[]>([]);
  const [tagOptions,  setTagOptions]  = useState<string[]>([]);

  useEffect(() => {
    getRoleToPeople().then(m => setRoleOptions(Object.keys(m).sort())).catch(() => {});
    getTagToMedia().then(m => setTagOptions(Object.keys(m).sort())).catch(() => {});
  }, []);

  const runSearch = useCallback(async () => {
    setLoading(true);
    try {
      const roleToPeople = await getRoleToPeople();
      const roleCandidates = new Map<number, number>();

      for (const role of query.roles) {
        const roleKey = Object.keys(roleToPeople).find(k =>
          k.toLowerCase().includes(role.toLowerCase())
        );
        if (roleKey) {
          for (const pid of roleToPeople[roleKey]) {
            roleCandidates.set(pid, (roleCandidates.get(pid) || 0) + 1);
          }
        }
      }

      let candidates: number[];
      if (query.roles.length === 0) {
        candidates = entries.filter(e => e.kind === 'person').map(e => e.id).slice(0, 200);
      } else {
        candidates = [...roleCandidates.keys()].slice(0, 200);
      }

      const scored: TalentResult[] = candidates.map(pid => {
        const roleFit = (roleCandidates.get(pid) || 0) / Math.max(1, query.roles.length);
        return { personId: pid, roleFit: Math.min(1, roleFit), tagFit: 0, quality: 0, closeness: 0, total: roleFit };
      });

      scored.sort((a, b) => b.total - a.total);
      setResults(scored.slice(0, 50));
    } finally {
      setLoading(false);
    }
  }, [query, entries, setResults]);

  return (
    <div style={css.wrap}>
      {/* Roles */}
      <div style={css.section}>
        <div style={css.label}>Roles</div>
        <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
          <AutocompleteInput
            value={roleInput}
            onChange={setRoleInput}
            onSelect={role => {
              if (!query.roles.includes(role)) setQuery({ roles: [...query.roles, role] });
              setRoleInput('');
            }}
            options={roleOptions}
            selected={query.roles}
            placeholder="e.g. Director"
          />
        </div>
        <div style={css.chips}>
          {query.roles.map(r => (
            <Chip key={r} label={r}
              onRemove={() => setQuery({ roles: query.roles.filter(x => x !== r) })} />
          ))}
        </div>
      </div>

      {/* Tags / Genres */}
      <div style={css.section}>
        <div style={css.label}>Tags / Genres</div>
        <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
          <AutocompleteInput
            value={tagInput}
            onChange={setTagInput}
            onSelect={tag => {
              if (!query.tags.includes(tag)) setQuery({ tags: [...query.tags, tag] });
              setTagInput('');
            }}
            options={tagOptions}
            selected={query.tags}
            placeholder="e.g. Isekai"
          />
        </div>
        <div style={css.chips}>
          {query.tags.map(t => (
            <Chip key={t} label={t}
              onRemove={() => setQuery({ tags: query.tags.filter(x => x !== t) })} />
          ))}
        </div>
      </div>

      <button style={css.searchBtn} onClick={runSearch} disabled={loading}>
        {loading ? 'Searching…' : 'Find Talent'}
      </button>

      {results.length > 0 && (
        <div style={css.results}>
          <div style={css.label}>{results.length} results</div>
          {results.map(r => {
            const se = entries.find(e => e.id === r.personId && e.kind === 'person');
            return (
              <div key={r.personId} style={css.resultRow}
                onClick={() => setSelected(r.personId, 'person')}>
                <div style={css.resultName}>{se?.en || String(r.personId)}</div>
                <div style={css.scores}>
                  <Score label="Role" value={r.roleFit} />
                  <Score label="Tag"  value={r.tagFit} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Chip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span style={css.chip}>
      {label}
      <span style={css.chipX} onClick={onRemove}>×</span>
    </span>
  );
}

function Score({ label, value }: { label: string; value: number }) {
  return (
    <span style={{ fontSize: 10, color: '#6666a0' }}>
      {label}: <span style={{ color: '#9090d0' }}>{(value * 100).toFixed(0)}%</span>
    </span>
  );
}

const css: Record<string, React.CSSProperties> = {
  wrap:       { display: 'flex', flexDirection: 'column', gap: 12 },
  section:    { display: 'flex', flexDirection: 'column', gap: 4 },
  label:      { fontSize: 11, fontWeight: 600, color: '#6666a0', textTransform: 'uppercase', letterSpacing: 1 },
  chips:      { display: 'flex', flexWrap: 'wrap', gap: 4 },
  chip: {
    display: 'flex', alignItems: 'center', gap: 4, padding: '2px 8px',
    borderRadius: 12, background: '#1e1e38', border: '1px solid #2a2a50',
    color: '#9090c8', fontSize: 11,
  },
  chipX:      { cursor: 'pointer', color: '#666688', fontWeight: 700 },
  searchBtn: {
    padding: '8px 0', borderRadius: 6, border: 'none',
    background: '#3030a0', color: '#e8e8f8', cursor: 'pointer', fontSize: 13, fontWeight: 600,
  },
  results:    { display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 },
  resultRow: {
    padding: '8px 10px', borderRadius: 6, background: '#141420',
    cursor: 'pointer', border: '1px solid #1e1e30',
  },
  resultName: { fontSize: 12, color: '#c8c8e8', marginBottom: 3 },
  scores:     { display: 'flex', gap: 8 },
};
