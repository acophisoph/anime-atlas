export function packPoints(points: Array<{ id: number; type: number; x: number; y: number; cluster: number; year: number }>): Buffer {
  const stride = 4 + 1 + 4 + 4 + 2 + 2;
  const buffer = Buffer.alloc(4 + points.length * stride);
  buffer.writeUInt32LE(points.length, 0);
  let offset = 4;
  for (const p of points) {
    buffer.writeUInt32LE(p.id, offset); offset += 4;
    buffer.writeUInt8(p.type, offset); offset += 1;
    buffer.writeFloatLE(p.x, offset); offset += 4;
    buffer.writeFloatLE(p.y, offset); offset += 4;
    buffer.writeUInt16LE(p.cluster, offset); offset += 2;
    buffer.writeUInt16LE(p.year, offset); offset += 2;
  }
  return buffer;
}

export function packGraphEdges(edges: Array<[number, number, number]>): Buffer {
  const buffer = Buffer.alloc(4 + edges.length * 12);
  buffer.writeUInt32LE(edges.length, 0);
  let offset = 4;
  for (const [a, b, w] of edges) {
    buffer.writeUInt32LE(a, offset); offset += 4;
    buffer.writeUInt32LE(b, offset); offset += 4;
    buffer.writeUInt32LE(w, offset); offset += 4;
  }
  return buffer;
}
