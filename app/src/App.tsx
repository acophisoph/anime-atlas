import { useEffect, useMemo, useState } from 'react';
import { Header } from './components/Header';
import { Filters } from './components/Filters';
import { SearchBox } from './components/SearchBox';
import { Drawer } from './components/Drawer';
import { Loading } from './components/Loading';
import { MapView } from './components/MapView';
import { TalentFinder } from './components/TalentFinder';
import { NetworkGraph } from './components/NetworkGraph';
import { dict, localizeTitle } from './i18n/i18n';
import { loadAllMeta, loadGraphEdges, loadJson, loadPoints } from './lib/api';
import type { Lang, Scope } from './lib/types';
import { intersectSorted } from './lib/setOps';

export default function App() {
  const [lang, setLang] = useState<Lang>('en');
  const [scope, setScope] = useState<Scope>('BOTH');
  const [points, setPoints] = useState<any[]>([]);
  const [media, setMedia] = useState<any[]>([]);
  const [people, setPeople] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [tagToMedia, setTagToMedia] = useState<Record<string, number[]>>({});
  const [roleToPeople, setRoleToPeople] = useState<Record<string, number[]>>({});
  const [tagRoleToPeople, setTagRoleToPeople] = useState<Record<string, number[]>>({});
  const [collab, setCollab] = useState<Array<[number, number, number]>>([]);

  useEffect(() => {
    Promise.all([
      loadPoints().then(setPoints),
      loadAllMeta().then(({ media, people }) => {
        setMedia(media);
        setPeople(people);
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
  const availableTags = useMemo(() => Object.keys(tagToMedia).sort(), [tagToMedia]);

  const filteredIds = useMemo(() => {
    const scoped = media.filter((m) => scope === 'BOTH' || m.type === scope).map((m) => m.id);
    if (!selectedTags.length) return scoped;
    return intersectSorted([scoped.sort((a, b) => a - b), ...selectedTags.map((tag) => tagToMedia[tag] ?? [])]);
  }, [media, scope, selectedTags, tagToMedia]);

  const filteredPoints = points.filter((p) => filteredIds.includes(p.id));
  const results = query
    ? media.filter((m) => localizeTitle(m.title, lang).toLowerCase().includes(query.toLowerCase())).slice(0, 10)
    : [];

  if (!points.length || !media.length) return <Loading />;

  return (
    <div style={{ height: '100vh', display: 'grid', gridTemplateRows: 'auto 1fr auto' }}>
      <Header t={t} lang={lang} setLang={setLang} scope={scope} setScope={setScope} />
      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr 340px', minHeight: 0 }}>
        <div style={{ padding: 10, overflow: 'auto' }}>
          <SearchBox placeholder={t.search} value={query} setValue={setQuery} />
          <ul>
            {results.map((m) => (
              <li key={m.id}>
                <button onClick={() => setSelected(m)}>{localizeTitle(m.title, lang)}</button>
              </li>
            ))}
          </ul>
          <Filters tags={availableTags} selectedTags={selectedTags} setSelectedTags={setSelectedTags} />
          <TalentFinder
            roleToPeople={roleToPeople}
            tagRoleToPeople={tagRoleToPeople}
            peopleById={peopleById}
            onOpenPerson={(id: number) => alert(peopleById[id]?.name?.full || id)}
          />
          <NetworkGraph selectedId={selected?.id ?? null} edges={collab} />
        </div>
        <MapView points={filteredPoints} onHover={() => {}} onClick={(info: any) => setSelected(mediaById[info.object?.id])} />
        <Drawer media={selected} lang={lang} onExplore={(id: number) => setSelected(mediaById[id])} />
      </div>
      <footer style={{ padding: 8, borderTop: '1px solid #333' }}>
        <a href="https://anilist.co" target="_blank" rel="noreferrer">
          {t.dataAttribution}
        </a>
      </footer>
    </div>
  );
}
