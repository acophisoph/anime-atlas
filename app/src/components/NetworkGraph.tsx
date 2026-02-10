export function NetworkGraph({ selectedId, edges }: { selectedId: number | null; edges: Array<[number, number, number]> }) {
  if (!selectedId) return <div>Select node for graph</div>;
  const local = edges.filter((e) => e[0] === selectedId || e[1] === selectedId).slice(0, 30);
  return (
    <div>
      <h4>Ego Graph</h4>
      <ul>{local.map((e, i) => <li key={i}>{e[0]} ↔ {e[1]} (shared: {e[2]})</li>)}</ul>
    </div>
  );
}
