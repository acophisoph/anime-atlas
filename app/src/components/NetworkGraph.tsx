export function NetworkGraph({
  selectedMedia,
  edges,
  peopleById
}: {
  selectedMedia: any | null;
  edges: Array<[number, number, number]>;
  peopleById: Record<number, any>;
}) {
  if (!selectedMedia) return <div>Select node for graph</div>;

  const seedPeople = new Set<number>((selectedMedia.staff ?? []).map((s: any) => s.personId).filter(Boolean));
  const local = edges
    .filter((e) => seedPeople.has(e[0]) || seedPeople.has(e[1]))
    .sort((a, b) => b[2] - a[2])
    .slice(0, 30);

  return (
    <div>
      <h4>Ego Graph</h4>
      <small>{local.length ? 'Top collaborator links around selected media staff' : 'No collaborator edges found for this media'}</small>
      <ul>
        {local.map((e, i) => {
          const left = peopleById[e[0]]?.name?.full ?? peopleById[e[0]]?.name?.native ?? `#${e[0]}`;
          const right = peopleById[e[1]]?.name?.full ?? peopleById[e[1]]?.name?.native ?? `#${e[1]}`;
          return (
            <li key={i}>
              {left} ↔ {right} (shared: {e[2]})
            </li>
          );
        })}
      </ul>
    </div>
  );
}
