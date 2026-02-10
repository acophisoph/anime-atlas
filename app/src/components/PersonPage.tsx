export function PersonPage({ person, works, collaborators }: any) {
  if (!person) return null;
  return <div><h3>{person.name?.full || person.name?.native}</h3><p>{works?.length ?? 0} works</p><p>Top collaborators: {(collaborators ?? []).slice(0,5).join(', ')}</p></div>;
}
