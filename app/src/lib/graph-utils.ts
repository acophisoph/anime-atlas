import type { Graph } from '../types';

/**
 * BFS/DFS to get neighbors up to `hops` hops from `startId`.
 * Returns Map<nodeId, hopDistance>
 */
export function getNeighborhood(
  graph: Graph,
  startId: number,
  maxHops: number,
  minWeight = 0
): Map<number, number> {
  const result = new Map<number, number>();
  const queue: Array<[number, number]> = [[startId, 0]];

  while (queue.length > 0) {
    const [nodeId, depth] = queue.shift()!;
    if (result.has(nodeId)) continue;
    result.set(nodeId, depth);
    if (depth >= maxHops) continue;

    const node = graph.nodes.get(nodeId);
    if (!node) continue;

    // Find edges for this node
    // Edges are stored contiguously; end = next node's edgeOffset or total edges
    const nodeIds = [...graph.nodes.keys()];
    const myIdx = nodeIds.indexOf(nodeId);
    const nextNodeId = nodeIds[myIdx + 1];
    const edgeStart = node.edgeOffset;
    const edgeEnd = nextNodeId !== undefined
      ? graph.nodes.get(nextNodeId)!.edgeOffset
      : graph.edgeCount;

    for (let i = edgeStart; i < edgeEnd; i++) {
      const edge = graph.edges[i];
      if (edge.weight >= minWeight && !result.has(edge.targetId)) {
        queue.push([edge.targetId, depth + 1]);
      }
    }
  }

  result.delete(startId); // exclude self
  return result;
}

/**
 * Get the direct edge weight from fromId → toId.
 * Returns 1 if no edge found.
 */
export function getDirectEdgeWeight(graph: Graph, fromId: number, toId: number): number {
  const node = graph.nodes.get(fromId);
  if (!node) return 1;
  const nodeIds = [...graph.nodes.keys()];
  const myIdx   = nodeIds.indexOf(fromId);
  const nextId  = nodeIds[myIdx + 1];
  const start   = node.edgeOffset;
  const end     = nextId !== undefined ? graph.nodes.get(nextId)!.edgeOffset : graph.edgeCount;
  for (let i = start; i < end; i++) {
    if (graph.edges[i].targetId === toId) return graph.edges[i].weight;
  }
  return 1;
}

/**
 * Compute Jaccard similarity between tag sets.
 */
export function tagSimilarity(tagsA: string[], tagsB: string[]): number {
  const setA = new Set(tagsA);
  const setB = new Set(tagsB);
  const intersection = [...setA].filter(t => setB.has(t)).length;
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}
