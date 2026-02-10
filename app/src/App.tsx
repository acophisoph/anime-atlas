import { useEffect, useMemo, useState } from 'react';
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

export default function App() {
  const [lang, setLang] = useState<Lang>('en');
  const [scope, setScope] = useState<Scope>('BOTH');
  const [atlasMode, setAtlasMode] = useState<'media' | 'people'>('media');
  const [peopleColorBy, setPeopleColorBy] = useState<'role' | 'studio'>('role');
  const [roleFilter, setRoleFilter] = useState<string[]>([]);
  const [studioFilter, setStudioFilter] = useState<string[]>([]);
  const [peopleDepth, setPeopleDepth] = useState<1 | 2>(1);

  const [points, setPoints] = useState<any[]>([]);
  const [media, setMedia] = useState<any[]>([]);
  const [people, setPeople] = useState<any[]>([]);
  const [characters, setCharacters] = useState<any[]>([]);
  const [relationLookup, setRelationLookup] = useState<Record<string, any>>({});
  const [selected, setSelected] = useState<any>(null);
  const [selectedPersonId, setSelectedPersonId] = useState<number | null>(null);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [query, setQuery] = useState('');
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

  const peoplePoints = useMemo(() => {
    const sorted = [...people].sort((a, b) => a.id - b.id);
    const degree = new Map<number, number>();
    for (const [a, b, w] of collab) {
      degree.set(a, (degree.get(a) ?? 0) + w);
      degree.set(b, (degree.get(b) ?? 0) + w);
    }
    return sorted.map((p, i) => {
      const angle = (i / Math.max(sorted.length, 1)) * Math.PI * 2;
      const radius = 0.7 - Math.min(0.4, ((degree.get(p.id) ?? 1) / 20) * 0.4);
      const stat = personStats[p.id] ?? { primaryRole: 'Other', studioCategory: 'Unaffiliated' };
      return {
        id: p.id,
        type: 2,
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
        role: stat.primaryRole,
        studioCategory: stat.studioCategory
      };
    });
  }, [people, collab, personStats]);

  const roleCategories = useMemo(() => Object.keys(ROLE_COLORS), []);
  const studioCategories = useMemo(() => Object.keys(STUDIO_COLORS), []);


  const personAdjacency = useMemo(() => {
    const adj = new Map<number, Array<[number, number]>>();
    for (const [a, b, w] of collab) {
      adj.set(a, [...(adj.get(a) ?? []), [b, w]]);
      adj.set(b, [...(adj.get(b) ?? []), [a, w]]);
    }
    return adj;
  }, [collab]);

  const selectedNeighborhood = useMemo(() => {
    if (atlasMode !== 'people' || !selectedPersonId) return null;
    const reached = new Set<number>([selectedPersonId]);
    let frontier = new Set<number>([selectedPersonId]);
    for (let d = 0; d < peopleDepth; d += 1) {
      const next = new Set<number>();
      for (const pid of frontier) {
        for (const [nid] of personAdjacency.get(pid) ?? []) if (!reached.has(nid)) next.add(nid);
      }
      for (const n of next) reached.add(n);
      frontier = next;
    }
    return reached;
  }, [atlasMode, selectedPersonId, peopleDepth, personAdjacency]);
  const filteredIds = useMemo(() => {
    const scoped = media.filter((m) => scope === 'BOTH' || m.type === scope).map((m) => m.id);
    if (!selectedTags.length) return scoped;
    return intersectSorted([scoped.sort((a, b) => a - b), ...selectedTags.map((tag) => tagToMedia[tag] ?? [])]);
  }, [media, scope, selectedTags, tagToMedia]);

  const filteredMediaPoints = points.filter((p) => filteredIds.includes(p.id));
  const filteredPeoplePoints = peoplePoints.filter((p) => {
    const roleOk = roleFilter.length ? roleFilter.includes(p.role) : true;
    const studioOk = studioFilter.length ? studioFilter.includes(p.studioCategory) : true;
    const neighborhoodOk = selectedNeighborhood ? selectedNeighborhood.has(p.id) : true;
    return roleOk && studioOk && neighborhoodOk;
  });

  const results = query
    ? media.filter((m) => localizeTitle(m.title, lang).toLowerCase().includes(query.toLowerCase())).slice(0, 10)
    : [];

  const selectedPerson = selectedPersonId ? peopleById[selectedPersonId] : null;

  if (!points.length || !media.length) return <Loading />;

  return (
    <div style={{ height: '100vh', display: 'grid', gridTemplateRows: 'auto 1fr auto' }}>
      <Header t={t} lang={lang} setLang={setLang} scope={scope} setScope={setScope} atlasMode={atlasMode} setAtlasMode={setAtlasMode} />
      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr 360px', minHeight: 0 }}>
        <div style={{ padding: 10, overflow: 'auto' }}>
          <SearchBox placeholder={t.search} value={query} setValue={setQuery} />
          <ul>
            {results.map((m) => (
              <li key={m.id}>
                <button
                  onClick={() => {
                    setSelected(m);
                    setSelectedPersonId(null);
                    setAtlasMode('media');
                  }}
                >
                  {localizeTitle(m.title, lang)} <small>[{m.type}] {m.year || ''}</small>
                </button>
              </li>
            ))}
          </ul>

          {atlasMode === 'media' ? (
            <>
              <Filters tags={availableTags} selectedTags={selectedTags} setSelectedTags={setSelectedTags} />
              <TalentFinder
                roleToPeople={roleToPeople}
                tagRoleToPeople={tagRoleToPeople}
                peopleById={peopleById}
                media={media}
                onOpenPerson={(id: number) => {
                  setSelectedPersonId(id);
                  setSelected(null);
                  setAtlasMode('people');
                }}
              />
              <NetworkGraph selectedMedia={selected} selectedPersonId={selectedPersonId} depth={peopleDepth} edges={collab} peopleById={peopleById} />
            </>
          ) : (
            <div>
              <h3>Staff Atlas Controls</h3>
              <label>
                Color by:{' '}
                <select value={peopleColorBy} onChange={(e) => setPeopleColorBy(e.target.value as 'role' | 'studio')}>
                  <option value="role">Most frequent role</option>
                  <option value="studio">Studio affiliation</option>
                </select>
              </label>
              <label style={{ marginLeft: 8 }}>
                Depth:{' '}
                <select value={peopleDepth} onChange={(e) => setPeopleDepth(Number(e.target.value) as 1 | 2)}>
                  <option value={1}>1-hop</option>
                  <option value={2}>2-hop</option>
                </select>
              </label>
              {selectedPersonId && <div><small>Focused around selected person id {selectedPersonId}</small></div>}
              <div style={{ marginTop: 8 }}>
                <strong>Role filters</strong>
                {roleCategories.map((r) => (
                  <label key={r} style={{ display: 'block' }}>
                    <input
                      type="checkbox"
                      checked={roleFilter.includes(r)}
                      onChange={(e) =>
                        setRoleFilter((prev) => (e.target.checked ? [...prev, r] : prev.filter((x) => x !== r)))
                      }
                    />
                    {r}
                  </label>
                ))}
              </div>
              <div style={{ marginTop: 8 }}>
                <strong>Studio filters</strong>
                {studioCategories.map((s) => (
                  <label key={s} style={{ display: 'block' }}>
                    <input
                      type="checkbox"
                      checked={studioFilter.includes(s)}
                      onChange={(e) =>
                        setStudioFilter((prev) => (e.target.checked ? [...prev, s] : prev.filter((x) => x !== s)))
                      }
                    />
                    {s}
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        <MapView
          points={atlasMode === 'media' ? filteredMediaPoints : filteredPeoplePoints}
          getFillColor={(p: any) => {
            if (atlasMode === 'media') return p.type === 0 ? '#66a3ff' : '#ff8080';
            return peopleColorBy === 'role' ? ROLE_COLORS[p.role] ?? ROLE_COLORS.Other : STUDIO_COLORS[p.studioCategory] ?? STUDIO_COLORS.Unaffiliated;
          }}
          onHover={() => {}}
          onClick={(info: any) => {
            if (atlasMode === 'media') {
              setSelected(mediaById[info.object?.id]);
              setSelectedPersonId(null);
            } else {
              setSelectedPersonId(info.object?.id ?? null);
              setSelected(null);
            }
          }}
        />

        {selectedPerson ? (
          <aside style={{ padding: 10, borderLeft: '1px solid #333', overflow: 'auto' }}>
            <PersonPage
              person={selectedPerson}
              media={media}
              lang={lang}
              onOpenMedia={(id: number) => {
                setSelected(mediaById[id] ?? relationLookup[String(id)] ?? null);
                setSelectedPersonId(null);
                setAtlasMode('media');
              }}
            />
          </aside>
        ) : (
          <Drawer
            media={selected}
            mediaById={mediaById}
            peopleById={peopleById}
            charactersById={charactersById}
            relationLookup={relationLookup}
            lang={lang}
            onExplore={(id: number) => setSelected(mediaById[id])}
            onOpenPerson={(id: number) => {
              setSelectedPersonId(id);
              setSelected(null);
              setAtlasMode('people');
            }}
            onOpenMedia={(id: number) => {
              setSelected(mediaById[id] ?? relationLookup[String(id)] ?? null);
              setSelectedPersonId(null);
              setAtlasMode('media');
            }}
          />
        )}
      </div>
      <footer style={{ padding: 8, borderTop: '1px solid #333' }}>
        <a href="https://anilist.co" target="_blank" rel="noreferrer">
          {t.dataAttribution}
        </a>
      </footer>
    </div>
  );
}
