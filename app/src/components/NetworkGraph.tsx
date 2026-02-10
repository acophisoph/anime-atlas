export function NetworkGraph({
  selectedMedia,
  selectedPersonId,
  edges,
  peopleById,
  depth = 1
}: {
  selectedMedia: any | null;
  selectedPersonId?: number | null;
  edges: Array<[number, number, number]>;
  peopleById: Record<number, any>;
  depth?: 1 | 2;
}) {
  const seedPeople = new Set<number>();
  if (selectedPersonId) seedPeople.add(selectedPersonId);
  else for (const s of selectedMedia?.staff ?? []) if (s.personId) seedPeople.add(s.personId);

  if (!seedPeople.size) return <div>Select node for graph</div>;

  const adjacency = new Map<number, Array<[number, number]>>();
  for (const [a, b, w] of edges) {
    adjacency.set(a, [...(adjacency.get(a) ?? []), [b, w]]);
    adjacency.set(b, [...(adjacency.get(b) ?? []), [a, w]]);
  }

  const reached = new Set<number>(seedPeople);
  const frontier = new Set<number>(seedPeople);
  for (let d = 0; d < depth; d += 1) {
    const next = new Set<number>();
    for (const pid of frontier) {
      for (const [nid] of adjacency.get(pid) ?? []) {
        if (!reached.has(nid)) next.add(nid);
      }
    }
    for (const n of next) reached.add(n);
    frontier.clear();
    for (const n of next) frontier.add(n);
  }

  const local = edges.filter(([a, b]) => reached.has(a) && reached.has(b)).sort((a, b) => b[2] - a[2]).slice(0, 40);

  const strength = (w: number) => (w >= 4 ? 'Very strong' : w >= 2 ? 'Strong' : 'Related');

  return (
    <div>
      <h4>Ego Graph</h4>
      <small>{selectedPersonId ? `Seed person network (depth ${depth})` : 'Top collaborator links around selected media staff'}</small>
      <ul>
        {local.map((e, i) => {
          const left = peopleById[e[0]]?.name?.full ?? peopleById[e[0]]?.name?.native ?? `#${e[0]}`;
          const right = peopleById[e[1]]?.name?.full ?? peopleById[e[1]]?.name?.native ?? `#${e[1]}`;
          return (
            <li key={i}>
              {left} ↔ {right} (shared: {e[2]}, {strength(e[2])})
            </li>
          );
        })}
      </ul>
    </div>
  );
}
