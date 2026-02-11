import { localizeTitle } from '../i18n/i18n';

export function NetworkGraph({
  selectedMedia,
  selectedPersonId,
  edges,
  peopleById,
  mediaById,
  relationLookup,
  depth = 1,
  lang = 'en'
}: {
  selectedMedia: any | null;
  selectedPersonId?: number | null;
  edges: Array<[number, number, number]>;
  peopleById: Record<number, any>;
  mediaById: Record<number, any>;
  relationLookup: Record<string, any>;
  depth?: number;
  lang?: 'en' | 'ja';
}) {
  if (!selectedMedia && !selectedPersonId) return <div>Select node for graph</div>;

  if (!selectedPersonId && selectedMedia) {
    const rels = (selectedMedia.relations ?? []).slice(0, 20);
    return (
      <div>
        <h4>Ego Graph</h4>
        <small>Media relation network for selected title</small>
        <ul>
          {rels.map((r: any, i: number) => {
            const rel = mediaById[r.id] || relationLookup?.[String(r.id)];
            const label = rel ? localizeTitle(rel.title, lang) : `#${r.id}`;
            return <li key={i}>{label} ({r.relationType})</li>;
          })}
        </ul>
      </div>
    );
  }

  const seedPeople = new Set<number>(selectedPersonId ? [selectedPersonId] : []);
  const adjacency = new Map<number, Array<[number, number]>>();
  for (const [a, b, w] of edges) {
    adjacency.set(a, [...(adjacency.get(a) ?? []), [b, w]]);
    adjacency.set(b, [...(adjacency.get(b) ?? []), [a, w]]);
  }

  const reached = new Set<number>(seedPeople);
  let frontier = new Set<number>(seedPeople);
  for (let d = 0; d < depth; d += 1) {
    const next = new Set<number>();
    for (const pid of frontier) {
      for (const [nid] of adjacency.get(pid) ?? []) if (!reached.has(nid)) next.add(nid);
    }
    for (const n of next) reached.add(n);
    frontier = next;
  }

  const local = edges.filter(([a, b]) => reached.has(a) && reached.has(b)).sort((a, b) => b[2] - a[2]).slice(0, 40);
  const strength = (w: number) => (w >= 4 ? 'Very strong' : w >= 2 ? 'Strong' : 'Related');

  return (
    <div>
      <h4>Ego Graph</h4>
      <small>{`Seed person network (depth ${depth})`}</small>
      <ul>
        {local.map((e, i) => {
          const left = peopleById[e[0]]?.name?.full ?? peopleById[e[0]]?.name?.native ?? `#${e[0]}`;
          const right = peopleById[e[1]]?.name?.full ?? peopleById[e[1]]?.name?.native ?? `#${e[1]}`;
          return <li key={i}>{left} ↔ {right} (shared: {e[2]}, {strength(e[2])})</li>;
        })}
      </ul>
    </div>
  );
}
