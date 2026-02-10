import type { PointRecord } from './types';

export async function decodePoints(url: string): Promise<PointRecord[]> {
  const res = await fetch(url);
  const buf = await res.arrayBuffer();
  const view = new DataView(buf);
  const count = view.getUint32(0, true);
  const points: PointRecord[] = [];
  let offset = 4;
  for (let i = 0; i < count; i++) {
    points.push({
      id: view.getUint32(offset, true),
      type: view.getUint8(offset + 4) as 0 | 1,
      x: view.getFloat32(offset + 5, true),
      y: view.getFloat32(offset + 9, true),
      cluster: view.getUint16(offset + 13, true),
      year: view.getUint16(offset + 15, true)
    });
    offset += 17;
  }
  return points;
}
