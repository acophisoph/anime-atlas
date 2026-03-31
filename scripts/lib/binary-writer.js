/**
 * Binary format for points.bin and graph .bin files.
 *
 * points.bin layout:
 *   [4 bytes] magic = 0x41544C50 ('ATLP')
 *   [4 bytes] version = 1
 *   [4 bytes] count (uint32)
 *   Per point (28 bytes each):
 *     [4 bytes] id (int32)
 *     [4 bytes] x (float32)
 *     [4 bytes] y (float32)
 *     [4 bytes] kind: 0=media, 1=person (uint8 padded to 4)
 *     [4 bytes] popularity (uint32)
 *     [4 bytes] averageScore (uint16 padded, 0 if null)
 *     [4 bytes] colorRGB packed (0xRRGGBB, 0 if none)
 *
 * graph .bin layout:
 *   [4 bytes] magic = 0x41544C47 ('ATLG')
 *   [4 bytes] version = 1
 *   [4 bytes] nodeCount (uint32)
 *   [4 bytes] edgeCount (uint32)
 *   Per node (8 bytes): [4 bytes] id, [4 bytes] edgeOffset (index into edges array)
 *   Per edge (12 bytes): [4 bytes] targetId, [4 bytes] weight (float32), [4 bytes] edgeType (enum)
 */
import fs from 'fs';

export const POINT_MAGIC  = 0x41544c50;
export const GRAPH_MAGIC  = 0x41544c47;
export const POINT_VERSION = 1;
export const GRAPH_VERSION = 1;
export const BYTES_PER_POINT = 28;

export function writePointsBin(outPath, points) {
  const count = points.length;
  const buf = Buffer.allocUnsafe(16 + count * BYTES_PER_POINT);
  let offset = 0;

  buf.writeUInt32LE(POINT_MAGIC,   offset); offset += 4;
  buf.writeUInt32LE(POINT_VERSION, offset); offset += 4;
  buf.writeUInt32LE(count,         offset); offset += 4;
  buf.writeUInt32LE(0,             offset); offset += 4; // reserved

  for (const p of points) {
    const colorPacked = parseColorHex(p.color);
    buf.writeInt32LE(p.id,                    offset); offset += 4;
    buf.writeFloatLE(p.x,                     offset); offset += 4;
    buf.writeFloatLE(p.y,                     offset); offset += 4;
    buf.writeUInt32LE(p.kind === 'person' ? 1 : 0, offset); offset += 4;
    buf.writeUInt32LE(p.popularity ?? 0,      offset); offset += 4;
    buf.writeUInt32LE(p.averageScore ?? 0,    offset); offset += 4;
    buf.writeUInt32LE(colorPacked,            offset); offset += 4;
  }

  fs.writeFileSync(outPath, buf);
  console.log(`[bin] Wrote ${outPath} (${count} points, ${buf.length} bytes)`);
}

export function writeGraphBin(outPath, adjacency) {
  // adjacency: Map<nodeId, [{targetId, weight, edgeType}]>
  const nodes = [...adjacency.keys()].sort((a, b) => a - b);
  const nodeCount = nodes.length;
  let totalEdges = 0;
  for (const edges of adjacency.values()) totalEdges += edges.length;

  const headerSize = 16;
  const nodeTableSize = nodeCount * 8;
  const edgesSize = totalEdges * 12;
  const buf = Buffer.allocUnsafe(headerSize + nodeTableSize + edgesSize);
  let offset = 0;

  buf.writeUInt32LE(GRAPH_MAGIC,   offset); offset += 4;
  buf.writeUInt32LE(GRAPH_VERSION, offset); offset += 4;
  buf.writeUInt32LE(nodeCount,     offset); offset += 4;
  buf.writeUInt32LE(totalEdges,    offset); offset += 4;

  const nodeTableStart = offset;
  offset += nodeTableSize; // skip, fill after

  const nodeIndexMap = new Map(nodes.map((id, i) => [id, i]));
  let edgeOffset = 0;
  let nodeTableOffset = nodeTableStart;

  for (const nodeId of nodes) {
    const edges = adjacency.get(nodeId) || [];
    buf.writeInt32LE(nodeId,    nodeTableOffset); nodeTableOffset += 4;
    buf.writeUInt32LE(edgeOffset, nodeTableOffset); nodeTableOffset += 4;

    for (const e of edges) {
      buf.writeInt32LE(e.targetId,                offset); offset += 4;
      buf.writeFloatLE(e.weight ?? 1.0,           offset); offset += 4;
      buf.writeUInt32LE(encodeEdgeType(e.edgeType), offset); offset += 4;
      edgeOffset++;
    }
  }

  fs.writeFileSync(outPath, buf);
  console.log(`[bin] Wrote ${outPath} (${nodeCount} nodes, ${totalEdges} edges, ${buf.length} bytes)`);
}

function parseColorHex(hex) {
  if (!hex) return 0;
  const s = hex.replace('#', '');
  if (s.length === 6) return parseInt(s, 16);
  if (s.length === 3) {
    const r = parseInt(s[0]+s[0], 16);
    const g = parseInt(s[1]+s[1], 16);
    const b = parseInt(s[2]+s[2], 16);
    return (r << 16) | (g << 8) | b;
  }
  return 0;
}

const EDGE_TYPES = { SEQUEL: 1, PREQUEL: 2, ALTERNATIVE: 3, PARENT: 4, SIDE_STORY: 5,
  SUMMARY: 6, ADAPTATION: 7, OTHER: 8, STAFF_OVERLAP: 10, COLLAB: 20 };

function encodeEdgeType(t) {
  return EDGE_TYPES[t] ?? 0;
}
