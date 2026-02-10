import { useEffect, useMemo, useState } from 'react';
import type { ChangeEvent } from 'react';
import { Header } from './components/Header';
import { Filters } from './components/Filters';
import { SearchBox } from './components/SearchBox';
import { Drawer } from './components/Drawer';
import { Loading } from './components/Loading';
import { MapView } from './components/MapView';
import { TalentFinder } from './components/TalentFinder';
import { NetworkGraph } from './components/NetworkGraph';
import { PersonPage } from './components/PersonPage';
import { dict, localizeTitle } from './i18n/i18n';
import { loadAllMeta, loadGraphEdges, loadJson, loadPoints } from './lib/api';
import type { Lang, Scope } from './lib/types';
import { intersectSorted } from './lib/setOps';

const ROLE_COLORS: Record<string, string> = {
  Direction: '#ff7f50',
  Writing: '#87cefa',
  Art: '#dda0dd',
  Animation: '#66cdaa',
  Music: '#ffd166',
  Sound: '#f4a261',
  Voice: '#f28482',
  'Studio/Production': '#8ecae6',
  Other: '#adb5bd'
};

const STUDIO_COLORS: Record<string, string> = {
  'Studio/Production': '#a78bfa',
  Unaffiliated: '#94a3b8'
};

const HOP_COLORS = ['#22c55e', '#3b82f6', '#a855f7', '#f59e0b', '#ef4444', '#14b8a6'];


function hash01(n: number): number {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}


function personDisplayName(person: any, fallbackId?: number): string {
  if (!person) return fallbackId ? `Person ${fallbackId}` : 'Unknown person';
  if (typeof person.name === 'string') return person.name;
  if (typeof person.name?.full === 'string' && person.name.full.trim()) return person.name.full;
  if (typeof person.name?.native === 'string' && person.name.native.trim()) return person.name.native;
  if (typeof person.name?.alternative === 'string' && person.name.alternative.trim()) return person.name.alternative;
  if (Array.isArray(person.name?.alternative) && person.name.alternative.length) return String(person.name.alternative[0]);
  return fallbackId ? `Person ${fallbackId}` : 'Unknown person';
}

function normalizePoints<T extends { x: number; y: number }>(pts: T[], targetHalfSpan = 0.84): T[] {
  if (!pts.length) return [];
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const span = Math.max(1e-6, maxX - minX, maxY - minY);
  const scale = (targetHalfSpan * 2) / span;
  return pts.map((p) => ({ ...p, x: (p.x - cx) * scale, y: (p.y - cy) * scale }));
}

export default function App() {
  const [lang, setLang] = useState<Lang>('en');
  const [scope, setScope] = useState<Scope>('BOTH');
  const [atlasMode, setAtlasMode] = useState<'media' | 'people'>('media');
  const [peopleColorBy, setPeopleColorBy] = useState<'role' | 'studio'>('role');
  const [roleFilter, setRoleFilter] = useState<string[]>([]);
  const [studioFilter, setStudioFilter] = useState<string[]>([]);
  const [peopleDepth, setPeopleDepth] = useState<number>(1);
  const [peopleExploreMode, setPeopleExploreMode] = useState<boolean>(false);
  const [mediaColorBy, setMediaColorBy] = useState<'type' | 'studio'>('type');
  const [selectedAnimeStudios, setSelectedAnimeStudios] = useState<string[]>([]);

  const [points, setPoints] = useState<any[]>([]);
  const [media, setMedia] = useState<any[]>([]);
  const [people, setPeople] = useState<any[]>([]);
  const [characters, setCharacters] = useState<any[]>([]);
  const [relationLookup, setRelationLookup] = useState<Record<string, any>>({});
  const [selected, setSelected] = useState<any>(null);
  const [selectedPersonId, setSelectedPersonId] = useState<number | null>(null);
  const [mediaNetworkSeedId, setMediaNetworkSeedId] = useState<number | null>(null);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [hoveredNode, setHoveredNode] = useState<any>(null);
  const [tagToMedia, setTagToMedia] = useState<Record<string, number[]>>({});
  const [roleToPeople, setRoleToPeople] = useState<Record<string, number[]>>({});
  const [tagRoleToPeople, setTagRoleToPeople] = useState<Record<string, number[]>>({});
  const [collab, setCollab] = useState<Array<[number, number, number]>>([]);

  useEffect(() => {
    Promise.all([
      loadPoints().then(setPoints),
      loadAllMeta().then(({ media, people, characters, relationLookup }) => {
        setMedia(media);
        setPeople(people);
        setCharacters(characters);
        setRelationLookup(relationLookup);
      }),
      loadJson<Record<string, number[]>>('indices/tag_to_media.json').then(setTagToMedia),
      loadJson<Record<string, number[]>>('indices/role_to_people.json').then(setRoleToPeople),
      loadJson<Record<string, number[]>>('indices/tagrole_to_people.json').then(setTagRoleToPeople),
      loadGraphEdges('person_collab').then(setCollab)
    ]);
  }, []);

  const t = dict[lang];
  const mediaById = useMemo(() => Object.fromEntries(media.map((m) => [m.id, m])), [media]);
  const peopleById = useMemo(() => Object.fromEntries(people.map((p) => [p.id, p])), [people]);
  const charactersById = useMemo(() => Object.fromEntries(characters.map((c) => [c.id, c])), [characters]);
  const mediaPointById = useMemo(() => Object.fromEntries(points.map((p) => [p.id, p])), [points]);
  const availableTags = useMemo(() => Object.keys(tagToMedia).sort(), [tagToMedia]);

  const personStats = useMemo(() => {
    const roleCounts = new Map<number, Map<string, number>>();
    const studioFlag = new Map<number, boolean>();
    for (const m of media) {
      for (const s of m.staff ?? []) {
        if (!s.personId) continue;
        const rm = roleCounts.get(s.personId) ?? new Map<string, number>();
        rm.set(s.roleGroup ?? 'Other', (rm.get(s.roleGroup ?? 'Other') ?? 0) + 1);
        roleCounts.set(s.personId, rm);
        if (s.roleGroup === 'Studio/Production') studioFlag.set(s.personId, true);
      }
    }
    const out: Record<number, { primaryRole: string; studioCategory: string }> = {};
    for (const [pid, rm] of roleCounts.entries()) {
      const primaryRole = [...rm.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'Other';
      out[pid] = { primaryRole, studioCategory: studioFlag.get(pid) ? 'Studio/Production' : 'Unaffiliated' };
    }
    return out;
  }, [media]);


  const mediaStudioById = useMemo(() => {
    const out: Record<number, string> = {};
    for (const m of media) {
      const studio = (m.studios ?? []).find((st: any) => st?.isAnimationStudio)?.name ?? (m.studios ?? [])[0]?.name;
      out[m.id] = studio ?? 'Unknown Studio';
    }
    return out;
  }, [media]);

  const animeStudios = useMemo(() => {
    const counts = new Map<string, number>();
    for (const m of media) {
      if (m.type !== 'ANIME') continue;
      const studio = mediaStudioById[m.id] ?? 'Unknown Studio';
      counts.set(studio, (counts.get(studio) ?? 0) + 1);
    }
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name);
    return sorted.filter((name) => name !== 'Unknown Studio').slice(0, 24);
  }, [media, mediaStudioById]);

  const studioPalette = useMemo(() => {
    const palette = ['#7dd3fc', '#fca5a5', '#86efac', '#fde68a', '#c4b5fd', '#f9a8d4', '#67e8f9', '#fdba74', '#93c5fd', '#d8b4fe'];
    const out: Record<string, string> = {};
    animeStudios.forEach((name, i) => { out[name] = palette[i % palette.length]; });
    out['Unknown Studio'] = '#6b7280';
    return out;
  }, [animeStudios]);

  const personAdjacency = useMemo(() => {
    const adj = new Map<number, Array<[number, number]>>();
    for (const [a, b, w] of collab) {
      adj.set(a, [...(adj.get(a) ?? []), [b, w]]);
      adj.set(b, [...(adj.get(b) ?? []), [a, w]]);
    }
    return adj;
  }, [collab]);

  const selectedNeighborhoodMap = useMemo(() => {
    if (atlasMode !== 'people' || !peopleExploreMode || !selectedPersonId) return null;
    const depthMap = new Map<number, number>([[selectedPersonId, 0]]);
    let frontier = new Set<number>([selectedPersonId]);
    for (let d = 1; d <= peopleDepth; d += 1) {
      const next = new Set<number>();
      for (const pid of frontier) {
        for (const [nid] of personAdjacency.get(pid) ?? []) {
          if (!depthMap.has(nid)) {
            depthMap.set(nid, d);
            next.add(nid);
          }
        }
      }
      frontier = next;
      if (!frontier.size) break;
    }
    return depthMap;
  }, [atlasMode, peopleExploreMode, selectedPersonId, peopleDepth, personAdjacency]);

  const peoplePoints = useMemo(() => {
    const sorted = [...people].sort((a, b) => a.id - b.id);
    const degree = new Map<number, number>();
    const adj = new Map<number, number[]>();

    for (const [a, b, w] of collab) {
      degree.set(a, (degree.get(a) ?? 0) + w);
      degree.set(b, (degree.get(b) ?? 0) + w);
      adj.set(a, [...(adj.get(a) ?? []), b]);
      adj.set(b, [...(adj.get(b) ?? []), a]);
    }

    const visited = new Set<number>();
    const components: number[][] = [];
    for (const p of sorted) {
      if (visited.has(p.id)) continue;
      const queue = [p.id];
      const comp: number[] = [];
      visited.add(p.id);
      while (queue.length) {
        const curr = queue.shift()!;
        comp.push(curr);
        for (const n of adj.get(curr) ?? []) {
          if (visited.has(n)) continue;
          visited.add(n);
          queue.push(n);
        }
      }
      components.push(comp);
    }

    components.sort((a, b) => b.length - a.length);

    const out: any[] = [];
    components.forEach((comp, ci) => {
      const centerAngle = ci * 2.399963229728653;
      const centerRadius = Math.min(0.82, 0.08 + Math.sqrt(ci) * 0.1);
      const cx = Math.cos(centerAngle) * centerRadius;
      const cy = Math.sin(centerAngle) * centerRadius;
      const compSorted = [...comp].sort((a, b) => (degree.get(b) ?? 0) - (degree.get(a) ?? 0));

      const localPos = new Map<number, { x: number; y: number }>();
      compSorted.forEach((pid, i) => {
        const angle = i * 2.399963229728653;
        const r = Math.min(0.58, 0.08 + Math.sqrt(i) * 0.034);
        localPos.set(pid, { x: Math.cos(angle) * r, y: Math.sin(angle) * r });
      });

      compSorted.forEach((pid, i) => {
        const base = localPos.get(pid) ?? { x: 0, y: 0 };
        const angle = hash01(pid * 5 + i) * Math.PI * 2;
        localPos.set(pid, { x: base.x + Math.cos(angle) * 0.01, y: base.y + Math.sin(angle) * 0.01 });
      });

      compSorted.forEach((pid) => {
        const stat = personStats[pid] ?? { primaryRole: 'Other', studioCategory: 'Unaffiliated' };
        const lp = localPos.get(pid) ?? { x: 0, y: 0 };
        out.push({
          id: pid,
          type: 2,
          x: cx + lp.x,
          y: cy + lp.y,
          role: stat.primaryRole,
          studioCategory: stat.studioCategory,
          hop: selectedNeighborhoodMap?.get(pid) ?? 0
        });
      });
    });

    return out;
  }, [people, collab, personStats, selectedNeighborhoodMap]);

  const roleCategories = useMemo(() => Object.keys(ROLE_COLORS), []);
  const studioCategories = useMemo(() => Object.keys(STUDIO_COLORS), []);

  const filteredIds = useMemo(() => {
    const scoped = media.filter((m) => scope === 'BOTH' || m.type === scope).map((m) => m.id);
    if (!selectedTags.length) return scoped;
    return intersectSorted([scoped.sort((a, b) => a - b), ...selectedTags.map((tag) => tagToMedia[tag] ?? [])]);
  }, [media, scope, selectedTags, tagToMedia]);

  const mediaRelationIds = useMemo(() => {
    if (!selected) return new Set<number>();
    return new Set<number>([selected.id, ...(selected.relations ?? []).map((r: any) => r.id)]);
  }, [selected]);

  const filteredMediaPoints = useMemo(() => {
    let byScope = points.filter((p) => filteredIds.includes(p.id));

    if (selectedAnimeStudios.length) {
      const studioSet = new Set(selectedAnimeStudios);
      byScope = byScope.filter((p) => {
        const m = mediaById[p.id];
        if (!m) return false;
        if (m.type !== 'ANIME') return true;
        return studioSet.has(mediaStudioById[p.id] ?? 'Unknown Studio');
      });
    }

    const base = mediaNetworkSeedId && selected ? byScope.filter((p) => mediaRelationIds.has(p.id)) : byScope;

    return base.map((p) => {
      const m = mediaById[p.id];
      if (!m) return p;
      const j = hash01(p.id * 7.13);
      const offset = m.type === 'ANIME' ? -0.006 : 0.006;
      return { ...p, x: p.x + Math.cos(j * Math.PI * 2) * Math.abs(offset), y: p.y + Math.sin(j * Math.PI * 2) * Math.abs(offset) };
    });
  }, [points, filteredIds, mediaNetworkSeedId, selected, mediaRelationIds, selectedAnimeStudios, mediaById, mediaStudioById]);


  const displayedMediaPoints = useMemo(() => {
    if (!filteredMediaPoints.length) return [];

    const lightlySeparated = filteredMediaPoints.map((p: any, idx: number) => {
      const j = hash01((p.id + idx) * 13.17);
      const nudge = 0.0018;
      return {
        ...p,
        x: p.x + Math.cos(j * Math.PI * 2) * nudge,
        y: p.y + Math.sin(j * Math.PI * 2) * nudge
      };
    });

    return normalizePoints(lightlySeparated, 0.86);
  }, [filteredMediaPoints]);

  const displayedMediaPointById = useMemo(() => Object.fromEntries(displayedMediaPoints.map((p) => [p.id, p])), [displayedMediaPoints]);

  const filteredPeoplePoints = peoplePoints.filter((p) => {
    const roleOk = roleFilter.length ? roleFilter.includes(p.role) : true;
    const studioOk = studioFilter.length ? studioFilter.includes(p.studioCategory) : true;
    const neighborhoodOk = selectedNeighborhoodMap ? selectedNeighborhoodMap.has(p.id) : true;
    return roleOk && studioOk && neighborhoodOk;
  });



  const displayedPeoplePoints = useMemo(() => {
    if (!filteredPeoplePoints.length) return [];
    return filteredPeoplePoints.map((p: any, idx: number) => {
      const j = hash01((p.id + idx) * 29.77);
      const baseScale = selectedNeighborhoodMap ? 1.16 : 1.38;
      return {
        ...p,
        x: p.x * baseScale + Math.cos(j * Math.PI * 2) * 0.008,
        y: p.y * baseScale + Math.sin(j * Math.PI * 2) * 0.008
      };
    });
  }, [filteredPeoplePoints, selectedNeighborhoodMap]);

  const peoplePointById = useMemo(() => Object.fromEntries(displayedPeoplePoints.map((p) => [p.id, p])), [displayedPeoplePoints]);

  const peopleEdges = useMemo(() => {
    if (atlasMode !== 'people' || !selectedNeighborhoodMap || !selectedPersonId) return [];

    const ranked = collab
      .filter(([a, b]) => selectedNeighborhoodMap.has(a) && selectedNeighborhoodMap.has(b))
      .sort((a, b) => b[2] - a[2]);

    const perNode = new Map<number, number>();
    const out: any[] = [];
    for (const [a, b, w] of ranked) {
      const ha = selectedNeighborhoodMap.get(a) ?? 99;
      const hb = selectedNeighborhoodMap.get(b) ?? 99;
      const hop = Math.max(ha, hb);
      const pa = peoplePointById[a];
      const pb = peoplePointById[b];
      if (!pa || !pb) continue;

      const nearSeed = a === selectedPersonId || b === selectedPersonId;
      if (!(nearSeed || (hop <= 2 && Math.abs(ha - hb) <= 1))) continue;

      const ca = perNode.get(a) ?? 0;
      const cb = perNode.get(b) ?? 0;
      if (ca >= 4 || cb >= 4) continue;

      out.push({
        from: pa,
        to: pb,
        width: 0.14 + Math.log2(1 + Math.max(1, w)) * 0.08,
        color: HOP_COLORS[Math.max(0, hop - 1)] ?? '#64748b',
        opacity: hop <= 1 ? 0.11 : 0.07
      });
      perNode.set(a, ca + 1);
      perNode.set(b, cb + 1);
      if (out.length >= 80) break;
    }

    return out;
  }, [atlasMode, selectedNeighborhoodMap, collab, peoplePointById, selectedPersonId]);

  const mediaEdges = useMemo(() => {
    if (atlasMode !== 'media' || !selected || !mediaNetworkSeedId) return [];
    return (selected.relations ?? [])
      .map((r: any) => {
        const to = displayedMediaPointById[r.id];
        const from = displayedMediaPointById[selected.id];
        if (!to || !from) return null;
        return { from, to, width: 1.2, color: '#cbd5e1', opacity: 0.55 };
      })
      .filter(Boolean) as any[];
  }, [atlasMode, selected, displayedMediaPointById, mediaNetworkSeedId]);

  const searchResults = useMemo(() => {
    if (!query.trim()) return [] as Array<{ kind: 'media' | 'people'; id: number; label: string; sub: string }>;
    const q = query.toLowerCase();
    const mediaMatches = media
      .filter((m) => localizeTitle(m.title, lang).toLowerCase().includes(q))
      .slice(0, 8)
      .map((m) => ({ kind: 'media' as const, id: m.id, label: localizeTitle(m.title, lang), sub: `[${m.type}] ${m.year || ''}` }));
    const peopleMatches = people
      .filter((p) => personDisplayName(p, p.id).toLowerCase().includes(q))
      .slice(0, 8)
      .map((p) => ({ kind: 'people' as const, id: p.id, label: personDisplayName(p, p.id), sub: 'Staff' }));
    return [...mediaMatches, ...peopleMatches].slice(0, 12);
  }, [query, media, people, lang]);

  const selectedPerson = selectedPersonId ? peopleById[selectedPersonId] : null;
  const dynamicMediaScale = clamp(1.05 / Math.sqrt(Math.max(1, displayedMediaPoints.length) / 180), 0.14, 0.95);
  const dynamicPeopleScale = clamp(1.05 / Math.sqrt(Math.max(1, displayedPeoplePoints.length) / 180), 0.14, 0.9);
  const mapViewKey = `${atlasMode}-${atlasMode === 'media' ? (mediaNetworkSeedId ? 'explore' : 'global') : (peopleExploreMode ? 'explore' : 'global')}`;

  if (!points.length || !media.length) return <Loading />;

  return (
    <div style={{ height: '100vh', display: 'grid', gridTemplateRows: 'auto 1fr auto' }}>
      <Header t={t} lang={lang} setLang={setLang} scope={scope} setScope={setScope} atlasMode={atlasMode} setAtlasMode={setAtlasMode} />
      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr 360px', minHeight: 0 }}>
        <div style={{ padding: 10, overflow: 'auto' }}>
          <SearchBox placeholder={t.search} value={query} setValue={setQuery} />
          <ul>
            {searchResults.map((r) => (
              <li key={`${r.kind}-${r.id}`}>
                <button
                  onClick={() => {
                    if (r.kind === 'media') {
                      setSelected(mediaById[r.id] ?? relationLookup[String(r.id)] ?? null);
                      setSelectedPersonId(null);
                      setAtlasMode('media');
                      setMediaNetworkSeedId(null);
                      setPeopleExploreMode(false);
                    } else {
                      setSelectedPersonId(r.id);
                      setSelected(null);
                      setAtlasMode('people');
                    }
                  }}
                >
                  {r.label} <small>{r.sub}</small>
                </button>
              </li>
            ))}
          </ul>

          {atlasMode === 'media' ? (
            <>
              <Filters tags={availableTags} selectedTags={selectedTags} setSelectedTags={setSelectedTags} />
              <div style={{ marginTop: 8 }}>
                <h4>Media Atlas Controls</h4>
                <label>
                  Color by:{' '}
                  <select value={mediaColorBy} onChange={(e: ChangeEvent<HTMLSelectElement>) => setMediaColorBy(e.target.value as 'type' | 'studio')}>
                    <option value="type">Anime vs Manga</option>
                    <option value="studio">Animation Studio</option>
                  </select>
                </label>
                {mediaNetworkSeedId ? (
                  <div style={{ marginTop: 6 }}>
                    <small>Explore network mode for selected title.</small>{' '}
                    <button onClick={() => setMediaNetworkSeedId(null)}>Back to global media atlas</button>
                  </div>
                ) : null}
                {mediaColorBy === 'studio' ? (
                  <details style={{ marginTop: 8 }} open>
                    <summary><strong>Animation studio filters</strong></summary>
                    <button style={{ marginTop: 6 }} onClick={() => setSelectedAnimeStudios([])}>Clear studio filters</button>
                    <div style={{ marginTop: 6 }}>
                      {(['Unknown Studio', ...animeStudios]).map((studio) => (
                        <label key={studio} style={{ display: 'block' }}>
                          <input
                            type="checkbox"
                            checked={selectedAnimeStudios.includes(studio)}
                            onChange={(e: ChangeEvent<HTMLInputElement>) =>
                              setSelectedAnimeStudios((prev) => (e.target.checked ? [...prev, studio] : prev.filter((x) => x !== studio)))
                            }
                          />
                          <span style={{ display: 'inline-block', width: 10, height: 10, margin: '0 6px', background: studioPalette[studio] ?? '#9ca3af' }} />
                          {studio}
                        </label>
                      ))}
                    </div>
                  </details>
                ) : null}
              </div>
              <TalentFinder roleToPeople={roleToPeople} tagRoleToPeople={tagRoleToPeople} peopleById={peopleById} media={media} onOpenPerson={(id: number) => { setSelectedPersonId(id); setSelected(null); setAtlasMode('people'); setPeopleExploreMode(true); }} />
              <NetworkGraph selectedMedia={selected} selectedPersonId={selectedPersonId} depth={peopleDepth} edges={collab} peopleById={peopleById} mediaById={mediaById} relationLookup={relationLookup} lang={lang} />
            </>
          ) : (
            <div>
              <h3>Staff Atlas Controls</h3>
              <label>
                Color by:{' '}
                <select value={peopleColorBy} onChange={(e: ChangeEvent<HTMLSelectElement>) => setPeopleColorBy(e.target.value as 'role' | 'studio')}>
                  <option value="role">Most frequent role</option>
                  <option value="studio">Studio affiliation</option>
                </select>
              </label>
              <label style={{ marginLeft: 8 }}>
                Hops:{' '}
                <select value={peopleDepth} onChange={(e: ChangeEvent<HTMLSelectElement>) => setPeopleDepth(Number(e.target.value))}>
                  {[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
              <div style={{ marginTop: 6 }}>
                <label>
                  <input type="checkbox" checked={peopleExploreMode} onChange={(e: ChangeEvent<HTMLInputElement>) => setPeopleExploreMode(e.target.checked)} /> Explore network mode (click staff nodes)
                </label>
              </div>
              {selectedPersonId && (
                <div>
                  <small>{peopleExploreMode ? `Focused around selected person id ${selectedPersonId}` : `Selected person id ${selectedPersonId}`}</small>{' '}
                  {peopleExploreMode ? (
                    <button onClick={() => setPeopleExploreMode(false)}>Back to global staff atlas</button>
                  ) : (
                    <button onClick={() => setPeopleExploreMode(true)}>Explore selected person network</button>
                  )}
                </div>
              )}
              <details style={{ marginTop: 8 }}>
                <summary><strong>Advanced staff filters</strong></summary>
                <div style={{ marginTop: 6 }}><strong>Hop line colors:</strong>{HOP_COLORS.map((c, i) => <div key={c}><span style={{display:'inline-block',width:10,height:10,background:c,marginRight:6}} />Hop {i+1}</div>)}</div>
                <div style={{ marginTop: 8 }}>
                  <strong>Role filters</strong>
                  {roleCategories.map((r) => (
                    <label key={r} style={{ display: 'block' }}><input type="checkbox" checked={roleFilter.includes(r)} onChange={(e: ChangeEvent<HTMLInputElement>) => setRoleFilter((prev) => (e.target.checked ? [...prev, r] : prev.filter((x) => x !== r)))} />{r}</label>
                  ))}
                </div>
                <div style={{ marginTop: 8 }}>
                  <strong>Studio filters</strong>
                  {studioCategories.map((s) => (
                    <label key={s} style={{ display: 'block' }}><input type="checkbox" checked={studioFilter.includes(s)} onChange={(e: ChangeEvent<HTMLInputElement>) => setStudioFilter((prev) => (e.target.checked ? [...prev, s] : prev.filter((x) => x !== s)))} />{s}</label>
                  ))}
                </div>
              </details>
            </div>
          )}
        </div>

        <div style={{ position: 'relative', minHeight: 0 }}>
          <MapView
            viewKey={mapViewKey}
            defaultScale={atlasMode === 'media' ? dynamicMediaScale : dynamicPeopleScale}
            points={atlasMode === 'media' ? displayedMediaPoints : displayedPeoplePoints}
            edges={atlasMode === 'media' ? mediaEdges : peopleEdges}
            getFillColor={(p: any) => {
              if (atlasMode === 'media') {
                if (mediaNetworkSeedId && selected) {
                  if (p.id === selected.id) return '#facc15';
                  if (mediaRelationIds.has(p.id)) return '#7dd3fc';
                }
                if (mediaColorBy === 'studio') {
                  const m = mediaById[p.id];
                  if (m?.type === 'ANIME') return studioPalette[mediaStudioById[p.id] ?? 'Unknown Studio'] ?? '#9ca3af';
                }
                return p.type === 0 ? '#66a3ff' : '#ff8080';
              }
              return peopleColorBy === 'role' ? ROLE_COLORS[p.role] ?? ROLE_COLORS.Other : STUDIO_COLORS[p.studioCategory] ?? STUDIO_COLORS.Unaffiliated;
            }}
            onHover={(info: any) => {
              const id = info.object?.id;
              if (!id) {
                setHoveredNode(null);
                return;
              }
              if (atlasMode === 'media') {
                const m = mediaById[id] ?? relationLookup[String(id)];
                setHoveredNode(m ? { kind: 'media', label: localizeTitle(m.title, lang), sub: `[${m.type}] ${m.year || ''}` } : null);
              } else {
                const p = peopleById[id];
                setHoveredNode(p ? { kind: 'people', label: personDisplayName(p, id), sub: 'Staff' } : null);
              }
            }}
            onClick={(info: any) => {
              const id = info.object?.id;
              if (!id) return;
              if (atlasMode === 'media') {
                setSelected(mediaById[id] ?? relationLookup[String(id)] ?? null);
                setSelectedPersonId(null);
                if (mediaNetworkSeedId) setMediaNetworkSeedId(id);
              } else {
                setSelectedPersonId(id);
                setSelected(null);
              }
            }}
          />
          {hoveredNode ? (
            <div style={{ position: 'absolute', left: 10, bottom: 10, background: 'rgba(15,17,23,0.85)', border: '1px solid #334155', borderRadius: 6, padding: '6px 8px', pointerEvents: 'none' }}>
              <div style={{ fontWeight: 600 }}>{hoveredNode.label}</div>
              <small style={{ color: '#cbd5e1' }}>{hoveredNode.sub}</small>
            </div>
          ) : null}
        </div>

        {selectedPerson ? (
          <aside style={{ padding: 10, borderLeft: '1px solid #333', overflow: 'auto' }}>
            <PersonPage person={selectedPerson} media={media} lang={lang} onOpenMedia={(id: number) => { setSelected(mediaById[id] ?? relationLookup[String(id)] ?? null); setSelectedPersonId(null); setAtlasMode('media'); setMediaNetworkSeedId(null); setPeopleExploreMode(false); }} />
          </aside>
        ) : (
          <Drawer
            media={selected}
            mediaById={mediaById}
            peopleById={peopleById}
            charactersById={charactersById}
            relationLookup={relationLookup}
            lang={lang}
            onExplore={(id: number) => { setSelected(mediaById[id]); setMediaNetworkSeedId(id); }}
            onOpenPerson={(id: number) => { setSelectedPersonId(id); setSelected(null); setAtlasMode('people'); setPeopleExploreMode(true); }}
            onOpenMedia={(id: number) => { setSelected(mediaById[id] ?? relationLookup[String(id)] ?? null); setSelectedPersonId(null); setAtlasMode('media'); setMediaNetworkSeedId(null); setPeopleExploreMode(false); }}
          />
        )}
      </div>
      <footer style={{ padding: 8, borderTop: '1px solid #333' }}><a href="https://anilist.co" target="_blank" rel="noreferrer">{t.dataAttribution}</a></footer>
    </div>
  );
}
