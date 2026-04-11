import React, { useState, useEffect, useCallback } from 'react';
import { useStore } from '../lib/store';
import { getRoleToPeople, getTagToMedia, getTagToPeople } from '../lib/data-loader';
import { t, translateRole, translateTag, roleToEN, tagToEN, ROLE_JP, NSFW_TAGS } from '../lib/i18n';
import { AutocompleteInput } from './AutocompleteInput';
import type { TalentResult } from '../types';

export function TalentFinder() {
  const query       = useStore(s => s.talentQuery);
  const results     = useStore(s => s.talentResults);
  const lang        = useStore(s => s.lang);
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
    // Role keys in role_to_people.json are already canonical (normalized in build-artifacts)
    getRoleToPeople().then(m => setRoleOptions(Object.keys(m).sort())).catch(() => {});
    // Tags from tag_to_people — people-relevant tags (what they've worked on)
    getTagToPeople()
      .catch(() => getTagToMedia()) // fallback to media tags if index not built yet
      .then((m: Record<string, number[]>) => setTagOptions(Object.keys(m).sort()))
      .catch(() => {});
  }, []);

  const showNSFW = useStore(s => s.mediaFilters.showNSFW);

  // Role keys are already canonical — just translate for display, dedup in case of overlap
  const displayRoleOptions = [...new Set(
    roleOptions.map(r => lang === 'jp' ? (ROLE_JP[r] ?? r) : r)
  )].sort();

  // Tags: hide NSFW when showNSFW is off
  const displayTagOptions = tagOptions
    .filter(tag => showNSFW || !NSFW_TAGS.has(tag))
    .map(tag => translateTag(tag, lang));

  const runSearch = useCallback(async () => {
    setLoading(true);
    try {
      const [roleToPeople, tagToPeople] = await Promise.all([
        getRoleToPeople(),
        getTagToPeople().catch(() => ({} as Record<string, number[]>)),
      ]);

      // ── Role matching ────────────────────────────────────────────────────
      // role_to_people keys are already canonical (normalized in build-artifacts).
      // Exact key lookup — no substring matching which would bloat results.
      const roleCandidates = new Map<number, number>();
      for (const role of query.roles) {
        const ids = roleToPeople[role] ?? [];
        for (const pid of ids) {
          roleCandidates.set(pid, (roleCandidates.get(pid) || 0) + 1);
        }
      }

      // ── Tag matching ─────────────────────────────────────────────────────
      // tag_to_people maps tag → people who worked on media with that tag.
      const tagCandidates = new Map<number, number>();
      for (const tag of query.tags) {
        const ids = tagToPeople[tag] ?? [];
        for (const pid of ids) {
          tagCandidates.set(pid, (tagCandidates.get(pid) || 0) + 1);
        }
      }

      // ── Build candidate pool ─────────────────────────────────────────────
      // Union of role + tag matches. If no filters at all, sample all people.
      let candidateIds: number[];
      const hasRoles = query.roles.length > 0;
      const hasTags  = query.tags.length > 0;

      if (!hasRoles && !hasTags) {
        candidateIds = entries.filter(e => e.kind === 'person').map(e => e.id).slice(0, 200);
      } else if (hasRoles && !hasTags) {
        candidateIds = [...roleCandidates.keys()];
      } else if (!hasRoles && hasTags) {
        candidateIds = [...tagCandidates.keys()];
      } else {
        // Intersection: must appear in both role AND tag results
        const roleSet = new Set(roleCandidates.keys());
        candidateIds = [...tagCandidates.keys()].filter(id => roleSet.has(id));
        // Fallback to union if intersection is empty
        if (candidateIds.length === 0) {
          const union = new Set([...roleCandidates.keys(), ...tagCandidates.keys()]);
          candidateIds = [...union];
        }
      }

      // ── Score ─────────────────────────────────────────────────────────────
      const scored: TalentResult[] = candidateIds.map(pid => {
        const roleFit = hasRoles
          ? Math.min(1, (roleCandidates.get(pid) || 0) / query.roles.length)
          : 0;
        const tagFit = hasTags
          ? Math.min(1, (tagCandidates.get(pid) || 0) / query.tags.length)
          : 0;
        // Combined score: roles weighted 60%, tags 40% when both present
        const total = hasRoles && hasTags
          ? roleFit * 0.6 + tagFit * 0.4
          : hasRoles ? roleFit : tagFit;
        return { personId: pid, roleFit, tagFit, quality: 0, closeness: 0, total };
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
        <div style={css.label}>{t('Roles', lang)}</div>
        <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
          <AutocompleteInput
            value={roleInput}
            onChange={setRoleInput}
            onSelect={display => {
              const en = roleToEN(display, lang);
              if (!query.roles.includes(en)) setQuery({ roles: [...query.roles, en] });
              setRoleInput('');
            }}
            options={displayRoleOptions}
            selected={query.roles.map(r => translateRole(r, lang))}
            placeholder={t('e.g. Director', lang)}
          />
        </div>
        <div style={css.chips}>
          {query.roles.map(r => (
            <Chip key={r} label={translateRole(r, lang)}
              onRemove={() => setQuery({ roles: query.roles.filter(x => x !== r) })} />
          ))}
        </div>
      </div>

      {/* Tags / Genres */}
      <div style={css.section}>
        <div style={css.label}>{t('Tags / Genres', lang)}</div>
        <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
          <AutocompleteInput
            value={tagInput}
            onChange={setTagInput}
            onSelect={display => {
              const en = tagToEN(display, lang);
              if (!query.tags.includes(en)) setQuery({ tags: [...query.tags, en] });
              setTagInput('');
            }}
            options={displayTagOptions}
            selected={query.tags.map(tag => translateTag(tag, lang))}
            placeholder={t('e.g. Isekai', lang)}
          />
        </div>
        <div style={css.chips}>
          {query.tags.map(tag => (
            <Chip key={tag} label={translateTag(tag, lang)}
              onRemove={() => setQuery({ tags: query.tags.filter(x => x !== tag) })} />
          ))}
        </div>
      </div>

      <button style={css.searchBtn} onClick={runSearch} disabled={loading}>
        {loading ? t('Searching…', lang) : t('Find Talent', lang)}
      </button>

      {results.length > 0 && (
        <div style={css.results}>
          <div style={css.label}>{results.length} {t('results', lang)}</div>
          {results.map(r => {
            const se = entries.find(e => e.id === r.personId && e.kind === 'person');
            return (
              <div key={r.personId} style={css.resultRow}
                onClick={() => setSelected(r.personId, 'person')}>
                <div style={css.resultName}>{se?.en || String(r.personId)}</div>
                <div style={css.scores}>
                  <Score label={t('Role', lang)} value={r.roleFit} />
                  <Score label={t('Tag', lang)}  value={r.tagFit} />
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
