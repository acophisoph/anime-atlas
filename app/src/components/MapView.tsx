export function MapView({ points, onClick }: any) {
  return (
    <svg viewBox="-1 -1 2 2" style={{ width: '100%', height: '100%', background: '#0f1117' }}>
      {points.map((p: any) => (
        <circle key={p.id} cx={p.x} cy={p.y} r={0.01} fill={p.type === 0 ? '#66a3ff' : '#ff8080'} onClick={() => onClick({ object: p })}>
          <title>{p.id}</title>
        </circle>
      ))}
    </svg>
  );
}
