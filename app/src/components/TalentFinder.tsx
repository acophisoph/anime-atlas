import React, { useCallback } from 'react';
import { useStore } from '../lib/store';
import { getRoleToPeople, loadPersonMeta } from '../lib/data-loader';
import type { TalentResult } from '../types';

export function TalentFinder() {
  const query       = useStore(s => s.talentQuery);
  const results     = useStore(s => s.talentResults);
  const setQuery    = useStore(s => s.setTalentQuery);
  const setResults  = useStore(s => s.setTalentResults);
  const setSelected = useStore(s => s.setSelected);
  const entries     = useStore(s => s.searchEntries);

  const [roleInput, setRoleInput] = React.useState('');
  const [tagInput, setTagInput]   = React.useState('');
  const [loading, setLoading]     = React.useState(false);

  const runSearch = useCallback(async () => {
    setLoading(true);
    try {
      const roleToPeople = await getRoleToPeople();
      const roleCandidates = new Map<number, number>(); // personId -> roleFit score

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

      // If no roles specified, use all people in search entries
      let candidates: number[];
      if (query.roles.length === 0) {
        candidates = entries.filter(e => e.kind === 'person').map(e => e.id).slice(0, 200);
      } else {
        candidates = [...roleCandidates.keys()].slice(0, 200);
      }

      const scored: TalentResult[] = candidates.map(pid => {
        const roleFit = (roleCandidates.get(pid) || 0) / Math.max(1, query.roles.length);
        const se = entries.find(e => e.id === pid && e.kind === 'person');
        return {
          personId: pid,
          roleFit: Math.min(1, roleFit),
          tagFit: 0,
          quality: 0,
          closeness: 0,
          total: roleFit,
        };
      });

      scored.sort((a, b) => b.total - a.total);
      setResults(scored.slice(0, 50));
    } finally {
      setLoading(false);
    }
  }, [query, entries, setResults]);

  function addRole() {
    const v = roleInput.trim();
    if (v && !query.roles.includes(v)) setQuery({ roles: [...query.roles, v] });
    setRoleInput('');
  }
  function addTag() {
    const v = tagInput.trim();
    if (v && !query.tags.includes(v)) setQuery({ tags: [...query.tags, v] });
    setTagInput('');
  }

  return (
    <div style={styles.wrap}>
      <div style={styles.section}>
        <div style={styles.sectionLabel}>Roles</div>
        <div style={styles.row}>
          <input style={styles.inp} value={roleInput} placeholder="e.g. Director"
            onChange={e => setRoleInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addRole()} />
          <button style={styles.addBtn} onClick={addRole}>+</button>
        </div>
        <div style={styles.tags}>
          {query.roles.map(r => (
            <span key={r} style={styles.tag}>{r}
              <span style={styles.tagX} onClick={() => setQuery({ roles: query.roles.filter(x => x !== r) })}>×</span>
            </span>
          ))}
        </div>
      </div>

      <div style={styles.section}>
        <div style={styles.sectionLabel}>Tags / Genres</div>
        <div style={styles.row}>
          <input style={styles.inp} value={tagInput} placeholder="e.g. Action"
            onChange={e => setTagInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addTag()} />
          <button style={styles.addBtn} onClick={addTag}>+</button>
        </div>
        <div style={styles.tags}>
          {query.tags.map(t => (
            <span key={t} style={styles.tag}>{t}
              <span style={styles.tagX} onClick={() => setQuery({ tags: query.tags.filter(x => x !== t) })}>×</span>
            </span>
          ))}
        </div>
      </div>

      <button style={styles.searchBtn} onClick={runSearch} disabled={loading}>
        {loading ? 'Searching…' : 'Find Talent'}
      </button>

      {results.length > 0 && (
        <div style={styles.results}>
          <div style={styles.sectionLabel}>{results.length} results</div>
          {results.map(r => {
            const se = entries.find(e => e.id === r.personId && e.kind === 'person');
            return (
              <div key={r.personId} style={styles.resultRow}
                onClick={() => setSelected(r.personId, 'person')}>
                <div style={styles.resultName}>{se?.en || String(r.personId)}</div>
                <div style={styles.scores}>
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

function Score({ label, value }: { label: string; value: number }) {
  return (
    <span style={{ fontSize: 10, color: '#6666a0' }}>
      {label}: <span style={{ color: '#9090d0' }}>{(value * 100).toFixed(0)}%</span>
    </span>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: { display: 'flex', flexDirection: 'column', gap: 12 },
  section: { display: 'flex', flexDirection: 'column', gap: 6 },
  sectionLabel: { fontSize: 11, fontWeight: 600, color: '#6666a0', textTransform: 'uppercase', letterSpacing: 1 },
  row: { display: 'flex', gap: 4 },
  inp: {
    flex: 1, padding: '5px 8px', borderRadius: 5, border: '1px solid #2a2a40',
    background: '#1a1a28', color: '#c8c8e8', fontSize: 12, outline: 'none',
  },
  addBtn: {
    padding: '5px 10px', borderRadius: 5, border: '1px solid #2a2a40',
    background: '#2a2a4a', color: '#c8c8f8', cursor: 'pointer', fontSize: 14,
  },
  tags: { display: 'flex', flexWrap: 'wrap', gap: 4 },
  tag: {
    display: 'flex', alignItems: 'center', gap: 4, padding: '2px 8px',
    borderRadius: 12, background: '#1e1e38', border: '1px solid #2a2a50', color: '#9090c8', fontSize: 11,
  },
  tagX: { cursor: 'pointer', color: '#666688', fontWeight: 700 },
  searchBtn: {
    padding: '8px 0', borderRadius: 6, border: 'none',
    background: '#3030a0', color: '#e8e8f8', cursor: 'pointer', fontSize: 13, fontWeight: 600,
  },
  results: { display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 },
  resultRow: {
    padding: '8px 10px', borderRadius: 6, background: '#141420', cursor: 'pointer',
    border: '1px solid #1e1e30', transition: 'background 0.1s',
  },
  resultName: { fontSize: 12, color: '#c8c8e8', marginBottom: 3 },
  scores: { display: 'flex', gap: 8 },
};
