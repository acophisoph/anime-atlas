import { useMemo, useState } from 'react';
import type { ChangeEvent } from 'react';
import { intersectSorted } from '../lib/setOps';

type WindowKey = 'all_time' | 'last_3y' | 'last_5y' | 'last_10y';

const windowCutoff = (window: WindowKey) => {
  const year = new Date().getFullYear();
  if (window === 'last_3y') return year - 3;
  if (window === 'last_5y') return year - 5;
  if (window === 'last_10y') return year - 10;
  return 0;
};

export function TalentFinder({ roleToPeople, tagRoleToPeople, peopleById, media, onOpenPerson }: any) {
  const roles = useMemo(() => Object.keys(roleToPeople).sort(), [roleToPeople]);
  const [role, setRole] = useState<string>('');
  const [tags, setTags] = useState<string[]>([]);
  const [window, setWindow] = useState<WindowKey>('all_time');

  const candidateTags = useMemo(() => {
    if (!role) return [];
    return Object.keys(tagRoleToPeople)
      .filter((k) => k.startsWith(`${role}|`))
      .map((k) => k.split('|')[1])
      .sort();
  }, [role, tagRoleToPeople]);

  const results = useMemo(() => {
    if (!role) return [];
    const base = roleToPeople[role] ?? [];
    const tagSets = tags.map((t) => tagRoleToPeople[`${role}|${t}`] ?? []);
    const candidatePeople = tags.length ? intersectSorted([base, ...tagSets]) : base;

    const cutoff = windowCutoff(window);

    return candidatePeople
      .map((personId: number) => {
        const works = media.filter(
          (m: any) =>
            (m.year ?? 0) >= cutoff &&
            (m.staff ?? []).some((s: any) => s.personId === personId && s.roleGroup === role) &&
            tags.every((tag) => (m.tags ?? []).some((t: any) => t.name === tag))
        );

        const collaborators = new Map<number, number>();
        for (const work of works) {
          for (const s of work.staff ?? []) {
            if (s.personId && s.personId !== personId) {
              collaborators.set(s.personId, (collaborators.get(s.personId) ?? 0) + 1);
            }
          }
        }

        const topCollaborators = [...collaborators.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 2)
          .map(([id]) => peopleById[id]?.name?.full ?? peopleById[id]?.name?.native ?? `#${id}`);

        const score = works.length * 5 + topCollaborators.length;
        return {
          personId,
          score,
          works,
          why: `${works.length} works match role ${role}${tags.length ? ` + tags ${tags.join(', ')}` : ''}`,
          topCollaborators
        };
      })
      .filter((r: any) => r.works.length > 0)
      .sort((a: any, b: any) => b.score - a.score)
      .slice(0, 20);
  }, [role, tags, window, roleToPeople, tagRoleToPeople, media, peopleById]);

  return (
    <div>
      <h3>Talent Finder</h3>
      <div style={{ display: 'grid', gap: 6 }}>
        <select value={role} onChange={(e: ChangeEvent<HTMLSelectElement>) => setRole(e.target.value)}>
          <option value="">Select role group</option>
          {roles.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>

        <select value={window} onChange={(e: ChangeEvent<HTMLSelectElement>) => setWindow(e.target.value as WindowKey)}>
          <option value="all_time">All-time</option>
          <option value="last_3y">Last 3 years</option>
          <option value="last_5y">Last 5 years</option>
          <option value="last_10y">Last 10 years</option>
        </select>

        {role && (
          <div style={{ maxHeight: 120, overflow: 'auto', border: '1px solid #333', padding: 6 }}>
            {candidateTags.map((tag) => (
              <label key={tag} style={{ display: 'block' }}>
                <input
                  type="checkbox"
                  checked={tags.includes(tag)}
                  onChange={(e: ChangeEvent<HTMLInputElement>) =>
                    setTags((prev) => (e.target.checked ? [...prev, tag] : prev.filter((x) => x !== tag)))
                  }
                />
                {tag}
              </label>
            ))}
          </div>
        )}
      </div>

      <ul>
        {results.map((r: any) => {
          const person = peopleById[r.personId];
          const name = person?.name?.full ?? person?.name?.native ?? `#${r.personId}`;
          return (
            <li key={r.personId} style={{ marginTop: 8 }}>
              <button onClick={() => onOpenPerson(r.personId)}>{name}</button>
              <div>
                <small>Why: {r.why}</small>
              </div>
              <div>
                <small>
                  Works: {r.works.slice(0, 3).map((m: any) => `${m.title?.english ?? m.title?.romaji ?? m.title?.native} (${m.year})`).join(', ')}
                </small>
              </div>
              <div>
                <small>Top collaborators: {r.topCollaborators.join(', ') || '—'}</small>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
