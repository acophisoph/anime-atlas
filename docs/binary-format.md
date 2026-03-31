# Binary File Format Reference

Anime Atlas uses two custom binary formats for compact, zero-parse-overhead delivery of the
point cloud and graph data to the browser.

---

## `points.bin` — Point Cloud

### Purpose

Stores the 2-D coordinates, visual properties, and metadata for every node (media + people)
shown on the atlas canvas. Loaded at startup before first paint.

### File Layout

```
Offset  Size  Type      Field
──────  ────  ────────  ──────────────────────────────────────────────────
0       4     uint32LE  magic = 0x41544C50  ('A', 'T', 'L', 'P')
4       4     uint32LE  version = 1
8       4     uint32LE  count  (number of point records that follow)
12      4     uint32LE  reserved = 0

── Per-point record (28 bytes each, repeated `count` times) ──
0       4     int32LE   id           (AniList media or person ID)
4       4     float32LE x            (normalized [-1, 1])
8       4     float32LE y            (normalized [-1, 1])
12      4     uint32LE  kind         (0 = media, 1 = person)
16      4     uint32LE  popularity   (raw AniList popularity integer)
20      4     uint32LE  averageScore (0–100; 0 if not applicable)
24      4     uint32LE  colorRGB     (packed 0x00RRGGBB; 0 if none)
```

Total header size: **16 bytes**
Per-point record size: **28 bytes**
File size formula: `16 + count * 28`

Example: 35 points → `16 + 35 * 28 = 996 bytes`

### Field Notes

- **magic**: Use as a sanity check on load. Reject the file if it doesn't match.
- **version**: Only version 1 is currently defined.
- **id**: Unique within the file. AniList media IDs are in the range 1–~170,000; person IDs
  start at 95,000 in practice but are not distinguished by range — use `kind` instead.
- **kind**: `0` = media (ANIME or MANGA), `1` = person (staff / VA).
- **colorRGB**: Derived from AniList's `coverImage.color` hex string. Zero means no color was
  available; the renderer falls back to a type-based default.

### Reading in JavaScript

```js
async function loadPoints(url) {
  const buf = await fetch(url).then(r => r.arrayBuffer());
  const view = new DataView(buf);

  const magic   = view.getUint32(0,  true);
  const version = view.getUint32(4,  true);
  const count   = view.getUint32(8,  true);
  // offset 12 is reserved

  if (magic !== 0x41544C50) throw new Error('Bad points.bin magic');
  if (version !== 1)        throw new Error('Unknown points.bin version');

  const points = new Array(count);
  const BASE   = 16;
  const STRIDE = 28;

  for (let i = 0; i < count; i++) {
    const off = BASE + i * STRIDE;
    points[i] = {
      id:           view.getInt32 (off +  0, true),
      x:            view.getFloat32(off + 4, true),
      y:            view.getFloat32(off + 8, true),
      kind:         view.getUint32(off + 12, true),  // 0=media, 1=person
      popularity:   view.getUint32(off + 16, true),
      averageScore: view.getUint32(off + 20, true),
      colorRGB:     view.getUint32(off + 24, true),
    };
  }

  return points;
}
```

### TypeScript Interface

```ts
export interface AtlasPoint {
  id:           number;   // AniList ID
  x:            number;   // float, [-1, 1]
  y:            number;   // float, [-1, 1]
  kind:         0 | 1;    // 0=media, 1=person
  popularity:   number;   // uint32
  averageScore: number;   // uint32, 0–100
  colorRGB:     number;   // uint32, 0x00RRGGBB
}

export interface PointsFile {
  version: number;
  count:   number;
  points:  AtlasPoint[];
}
```

---

## `graph_*.bin` — Graph Files

Three graph files are produced:

| Filename                     | Edge type      | Edge enum value |
|------------------------------|----------------|-----------------|
| `graph_media_relations.bin`  | SEQUEL etc.    | see table below |
| `graph_media_staff.bin`      | STAFF_OVERLAP  | 10              |
| `graph_people_collab.bin`    | COLLAB         | 20              |

### File Layout

```
Offset  Size  Type      Field
──────  ────  ────────  ──────────────────────────────────────────────────
0       4     uint32LE  magic = 0x41544C47  ('A', 'T', 'L', 'G')
4       4     uint32LE  version = 1
8       4     uint32LE  nodeCount
12      4     uint32LE  edgeCount  (total edges across all nodes)

── Node table (8 bytes × nodeCount) ──
0       4     int32LE   nodeId
4       4     uint32LE  edgeOffset  (index into the edge array below where this node's edges start)

── Edge array (12 bytes × edgeCount) ──
0       4     int32LE   targetId    (ID of the connected node)
4       4     float32LE weight
8       4     uint32LE  edgeType    (see enum below)
```

Header size: **16 bytes**
Node table size: `nodeCount * 8 bytes`
Edge array size: `edgeCount * 12 bytes`
Total: `16 + nodeCount*8 + edgeCount*12`

### Edge Type Enum

| Name           | Value | Description                                |
|----------------|-------|--------------------------------------------|
| `OTHER`        | 0     | Unclassified relation                      |
| `SEQUEL`       | 1     | Direct sequel                              |
| `PREQUEL`      | 2     | Direct prequel                             |
| `ALTERNATIVE`  | 3     | Alternative version / setting              |
| `PARENT`       | 4     | Parent story (manga → anime adaptation)    |
| `SIDE_STORY`   | 5     | Side story or spin-off                     |
| `SUMMARY`      | 6     | Recap/summary edition                      |
| `ADAPTATION`   | 7     | Adaptation (anime of a manga, etc.)        |
| `STAFF_OVERLAP`| 10    | Media share significant crew               |
| `COLLAB`       | 20    | People worked on the same title            |

### Traversal Algorithm

The node table acts as an index into the edge array. To find all neighbors of a node:

1. Binary-search (or linear scan) the node table for the target `nodeId`.
2. Read its `edgeOffset` at position `i`.
3. Edge count for this node = `nodeTable[i+1].edgeOffset - nodeTable[i].edgeOffset`
   (or `edgeCount - edgeOffset` for the last node).
4. Slice the edge array from `edgeOffset` to `edgeOffset + count`.

Nodes are stored in ascending order of `nodeId`.

### Reading in JavaScript

```js
async function loadGraph(url) {
  const buf  = await fetch(url).then(r => r.arrayBuffer());
  const view = new DataView(buf);

  const magic     = view.getUint32(0,  true);
  const version   = view.getUint32(4,  true);
  const nodeCount = view.getUint32(8,  true);
  const edgeCount = view.getUint32(12, true);

  if (magic !== 0x41544C47) throw new Error('Bad graph magic');

  // Parse node table
  const nodes = [];
  const NODE_BASE   = 16;
  const NODE_STRIDE = 8;
  for (let i = 0; i < nodeCount; i++) {
    const off = NODE_BASE + i * NODE_STRIDE;
    nodes.push({
      id:         view.getInt32 (off + 0, true),
      edgeOffset: view.getUint32(off + 4, true),
    });
  }

  // Parse edge array
  const EDGE_BASE   = NODE_BASE + nodeCount * NODE_STRIDE;
  const EDGE_STRIDE = 12;
  const edges = [];
  for (let i = 0; i < edgeCount; i++) {
    const off = EDGE_BASE + i * EDGE_STRIDE;
    edges.push({
      targetId: view.getInt32  (off + 0, true),
      weight:   view.getFloat32(off + 4, true),
      edgeType: view.getUint32 (off + 8, true),
    });
  }

  // Build adjacency map: nodeId → edges[]
  const adjacency = new Map();
  for (let i = 0; i < nodes.length; i++) {
    const node  = nodes[i];
    const start = node.edgeOffset;
    const end   = i + 1 < nodes.length ? nodes[i + 1].edgeOffset : edgeCount;
    adjacency.set(node.id, edges.slice(start, end));
  }

  return adjacency;
}
```

### TypeScript Interfaces

```ts
export type EdgeType =
  | 0   // OTHER
  | 1   // SEQUEL
  | 2   // PREQUEL
  | 3   // ALTERNATIVE
  | 4   // PARENT
  | 5   // SIDE_STORY
  | 6   // SUMMARY
  | 7   // ADAPTATION
  | 10  // STAFF_OVERLAP
  | 20; // COLLAB

export interface GraphEdge {
  targetId: number;
  weight:   number;
  edgeType: EdgeType;
}

export type GraphAdjacency = Map<number, GraphEdge[]>;
```

---

## Writing Binary Files (Node.js)

The writer is implemented in `scripts/lib/binary-writer.js` as ES module exports:

```js
import { writePointsBin, writeGraphBin } from '../lib/binary-writer.js';

// Points
writePointsBin('data/points.bin', [
  { id: 1, x: 0.3, y: -0.1, kind: 'media', popularity: 95000, averageScore: 82, color: '#e05020' },
]);

// Graph (adjacency as Map<nodeId, [{targetId, weight, edgeType}]>)
const adj = new Map([
  [1, [{ targetId: 2, weight: 0.9, edgeType: 'SEQUEL' }]],
  [2, [{ targetId: 1, weight: 0.9, edgeType: 'PREQUEL' }]],
]);
writeGraphBin('data/graph_media_relations.bin', adj);
```

`color` in the points writer accepts a CSS hex string (`#rrggbb` or `#rgb`); it is packed into
the `colorRGB` uint32 automatically.

`edgeType` in the graph writer accepts either the string name (e.g. `'SEQUEL'`) or the numeric
value. Unknown strings map to `0` (OTHER).
